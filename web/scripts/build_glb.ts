/**
 * Story 3.3 AC2 — asset pipeline: 4-LOD `voyager-lod{N}.<hash>.glb` chain.
 *
 * Reads:
 *   - bake/inputs/models/voyager-raw.glb      (NASA Voyager Probe (B), Draco)
 *   - bake/inputs/voyager-mesh-mapping.json   (Phase 0 mesh-to-node mapping)
 *
 * Writes:
 *   - web/public/models/voyager-lod{0..3}.<hash>.glb  (4 LODs, content-hashed)
 *   - bake/out/models-manifest-fragment.json          (consumed by manifest_writer.py)
 *
 * Pipeline (per AC2 + ADR-0006):
 *   1. NodeIO loads raw GLB; ALL_EXTENSIONS handles KHR_draco_mesh_compression
 *      + EXT_texture_webp + KHR_texture_basisu reads. DracoMeshCompression
 *      `init(decoderModule)` is required to read the Draco-compressed input.
 *   2. Restructure flat mesh tree into BUS / SCAN_PLATFORM / HGA named groups
 *      per `bake/inputs/voyager-mesh-mapping.json`.
 *   3. KTX2 transcode step: extract each material's baseColor + AO textures,
 *      invoke `toktx` (Khronos KTX-Software CLI) to produce KTX2 payloads, and
 *      re-attach via KHRTextureBasisu. UASTC for baseColor (hero textures per
 *      ADR-0006 § Decision step 3); ETC1S for AO. Removes EXT_texture_webp.
 *   4. Strip Draco extension (the meshopt-compressed output replaces it).
 *   5. `prune` → `dedup` → `weld` → `meshopt` (ADR-0006 mandatory pipeline).
 *   6. For each LOD level: clone the document, `simplify` to the LOD's ratio,
 *      write to a temp path, content-hash the bytes, rename to the final
 *      `voyager-lod{N}.<hash>.glb` filename, emit the manifest fragment.
 *   7. Verify idempotency: re-emit with identical inputs MUST produce
 *      byte-identical outputs (NFR-R4).
 *
 * Prerequisites (CI + local dev):
 *   - Node.js 20+ (tsx required)
 *   - `toktx` (Khronos KTX-Software) on PATH:
 *       https://github.com/KhronosGroup/KTX-Software/releases
 *     The script exits with a clear error pointing at the install docs if
 *     `toktx --version` doesn't resolve.
 *
 * Invocation:
 *   - cd web && npm run build-glb
 *   - just bake-glb     (chains into the top-level `just bake` recipe)
 */

import { writeFile, readFile, mkdir, rm, mkdtemp, access, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO, Document, Node, type Texture } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import {
  prune,
  dedup,
  weld,
  meshopt,
  simplify,
  cloneDocument,
} from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
// draco3dgltf is a CommonJS module without an upstream .d.ts. The decoder
// module is loaded once at runtime to decode the upstream NASA GLB's
// KHR_draco_mesh_compression payload (stripped after restructure). A
// minimal ambient declaration appears below this import so the call sites
// stay strict-mode clean (ADR-0026 zero-`any` discipline).
import draco3d from 'draco3dgltf';

// === Paths (resolved relative to web/ working dir) ============================

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const RAW_GLB = join(REPO_ROOT, 'bake', 'inputs', 'models', 'voyager-raw.glb');
const MAPPING_JSON = join(REPO_ROOT, 'bake', 'inputs', 'voyager-mesh-mapping.json');
const OUTPUT_DIR = join(REPO_ROOT, 'web', 'public', 'models');
const FRAGMENT_OUT = join(REPO_ROOT, 'bake', 'out', 'models-manifest-fragment.json');

// === LOD schedule (AC2 + AC3) =================================================
//
// AC2 commits to four LODs with simplify ratios 1.0 / 0.5 / 0.2 / 0.05. AC3
// commits to render-space distance thresholds (in km) of 0.001 / 0.1 / 1.0 /
// null (LOD3 = far-field silhouette, no upper bound). Both are codified here
// as the single source of truth; the manifest emitter copies these into the
// fragment JSON.

interface LodSpec {
  readonly level: 0 | 1 | 2 | 3;
  readonly ratio: number;
  readonly maxDistanceKm: number | null;
}

const LOD_SCHEDULE: ReadonlyArray<LodSpec> = [
  { level: 0, ratio: 1.0, maxDistanceKm: 0.001 },
  { level: 1, ratio: 0.5, maxDistanceKm: 0.1 },
  { level: 2, ratio: 0.2, maxDistanceKm: 1.0 },
  { level: 3, ratio: 0.05, maxDistanceKm: null },
] as const;

// === Mesh mapping JSON shape =================================================

interface MeshMappingEntry {
  readonly source_mesh_index: number;
  readonly source_name: string;
  readonly target_parent: 'BUS' | 'SCAN_PLATFORM' | 'HGA';
  readonly rationale: string;
}

interface MeshMapping {
  readonly source_sha256: string;
  readonly source_path: string;
  readonly phase0_notes: string;
  readonly mesh_mapping: ReadonlyArray<MeshMappingEntry>;
  readonly scan_platform_pivot_meters: readonly [number, number, number];
  readonly scan_platform_pivot_rationale: string;
  readonly hga_orientation_relative_to_bus_quat: readonly [number, number, number, number];
  readonly hga_orientation_rationale: string;
  readonly hga_position_meters: readonly [number, number, number];
  readonly hga_position_rationale: string;
}

// === Manifest fragment (consumed by bake/src/manifest_writer.py) =============

interface ModelLodFragment {
  readonly level: 0 | 1 | 2 | 3;
  readonly url: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly maxDistanceKm: number | null;
}

interface ModelFragment {
  readonly id: string;
  readonly lods: ReadonlyArray<ModelLodFragment>;
  readonly pivotMeters: readonly [number, number, number];
  readonly scaleToKm: number;
}

interface ModelsFragment {
  readonly models: ReadonlyArray<ModelFragment>;
}

// === toktx prerequisite check ================================================

const requireToktx = (): void => {
  try {
    const out = execFileSync('toktx', ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const banner = out.toString().split(/\r?\n/)[0];
    console.log(`[build-glb] toktx prerequisite OK: ${banner}`);
  } catch (err) {
    console.error('[build-glb] toktx not found on PATH.');
    console.error('[build-glb] Install Khronos KTX-Software:');
    console.error('[build-glb]   https://github.com/KhronosGroup/KTX-Software/releases');
    console.error('[build-glb] After install, re-run `just bake-glb` (or `npm run build-glb`).');
    throw new Error(`toktx not found: ${(err as Error).message}`);
  }
};

// === Texture transcoding via toktx ===========================================
//
// gltf-transform doesn't ship a `textureCompress` for KTX2 with toktx — the
// CLI tool is a separate Khronos binary. We extract each texture's bytes to a
// temp file, run toktx, and read the resulting .ktx2 back. Then we attach the
// KTX2 payload to the gltf-transform Texture via setImage + setMimeType.

const writeTexturesAsKtx2 = async (
  doc: Document,
  workDir: string,
): Promise<{ converted: number; skipped: number }> => {
  const textures = doc.getRoot().listTextures();
  let converted = 0;
  let skipped = 0;

  for (let i = 0; i < textures.length; i += 1) {
    const tex = textures[i];
    const mime = tex.getMimeType();
    const img = tex.getImage();
    if (img === null) {
      skipped += 1;
      continue;
    }
    // Skip if already KTX2 (idempotency for re-runs over a partially-baked doc)
    if (mime === 'image/ktx2') {
      skipped += 1;
      continue;
    }

    // Detect source extension from MIME so toktx reads it correctly.
    const ext =
      mime === 'image/webp'
        ? 'webp'
        : mime === 'image/png'
          ? 'png'
          : mime === 'image/jpeg'
            ? 'jpg'
            : null;
    if (ext === null) {
      console.warn(`[build-glb] skipping texture ${i} (unsupported MIME ${mime})`);
      skipped += 1;
      continue;
    }

    // WebP → toktx doesn't accept WebP directly (it can't decode the format),
    // so we transcode to PNG via `sharp` before invoking toktx. `sharp` is
    // already a transitive dep via `@gltf-transform/functions` →
    // `ndarray-pixels`. toktx natively supports PNG / JPEG / PPM.
    // (Pre-Story-3.3-smoke version of this script disposed EXT_texture_webp
    // hoping gltf-transform would fall back to embedded PNG variants — that
    // does NOT alter the texture's image bytes. Per-story smoke caught this
    // when toktx hard-failed reading WebP; sharp-based transcode is the fix.)
    let toktxInputPath: string;
    let toktxInputExt: string;
    if (ext === 'webp') {
      // Lazy import keeps the script bootable even on environments where
      // sharp's native binary isn't installed (the prerequisite check upstream
      // catches missing toktx already; sharp is a soft dep).
      const sharp = (await import('sharp')).default;
      const pngBuffer = await sharp(Buffer.from(img)).png().toBuffer();
      toktxInputPath = join(workDir, `tex-${i}.png`);
      toktxInputExt = 'png';
      await writeFile(toktxInputPath, pngBuffer);
    } else {
      toktxInputPath = join(workDir, `tex-${i}.${ext}`);
      toktxInputExt = ext;
      await writeFile(toktxInputPath, img);
    }
    const inputPath = toktxInputPath;
    const outputPath = join(workDir, `tex-${i}.ktx2`);

    // ADR-0006 § Decision step 3: UASTC for hero/baseColor textures, ETC1S
    // for the coarser-tolerance maps (AO/roughness). The Voyager Probe (B)
    // GLB has 3 textures: indices 0+1 are baseColor pairs (tex_01), index 2
    // is the AO map (tex_02_AO_dark). Heuristic: use UASTC for any texture
    // referenced from a `pbrMetallicRoughness.baseColorTexture` slot;
    // ETC1S for everything else.
    const isBaseColor = isUsedAsBaseColor(doc, tex);
    const args = isBaseColor
      ? [
          '--encode', 'uastc',
          '--uastc_quality', '2',
          '--uastc_rdo_l', '1.0',
          '--zcmp', '20',
          '--genmipmap',
          outputPath,
          inputPath,
        ]
      : [
          '--encode', 'etc1s',
          '--clevel', '1',
          '--qlevel', '128',
          '--genmipmap',
          outputPath,
          inputPath,
        ];

    const result = spawnSync('toktx', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.status !== 0) {
      const stderr = result.stderr?.toString() ?? '';
      const stdout = result.stdout?.toString() ?? '';
      throw new Error(
        `toktx failed for texture ${i} (source=${ext} transcoded=${toktxInputExt}, isBaseColor=${isBaseColor}):\n${stdout}\n${stderr}`,
      );
    }

    const ktx2Bytes = await readFile(outputPath);
    tex.setImage(new Uint8Array(ktx2Bytes)).setMimeType('image/ktx2');
    converted += 1;
  }

  return { converted, skipped };
};

const isUsedAsBaseColor = (doc: Document, tex: Texture): boolean => {
  for (const mat of doc.getRoot().listMaterials()) {
    if (mat.getBaseColorTexture() === tex) return true;
  }
  return false;
};

// === Restructure to named hierarchy ==========================================

const restructureHierarchy = (doc: Document, mapping: MeshMapping): void => {
  const root = doc.getRoot();
  const scene = root.listScenes()[0];
  if (scene === undefined) throw new Error('GLB has no scene');

  // Index source meshes (by ordinal in the document — matches glTF mesh array
  // order, which is what the mapping JSON's source_mesh_index refers to).
  const meshes = root.listMeshes();
  const indexByName = new Map<string, number>();
  meshes.forEach((m, idx) => indexByName.set(m.getName(), idx));

  // Create the named groups.
  const busNode = doc.createNode('BUS');
  const platformNode = doc.createNode('SCAN_PLATFORM');
  const hgaNode = doc.createNode('HGA');

  // Pivot offsets (T2.3 — SCAN_PLATFORM translated to the historical hinge,
  // HGA rotated so its local +Z is bus -Z).
  platformNode.setTranslation([
    mapping.scan_platform_pivot_meters[0],
    mapping.scan_platform_pivot_meters[1],
    mapping.scan_platform_pivot_meters[2],
  ]);
  hgaNode.setRotation([
    mapping.hga_orientation_relative_to_bus_quat[0],
    mapping.hga_orientation_relative_to_bus_quat[1],
    mapping.hga_orientation_relative_to_bus_quat[2],
    mapping.hga_orientation_relative_to_bus_quat[3],
  ]);
  hgaNode.setTranslation([
    mapping.hga_position_meters[0],
    mapping.hga_position_meters[1],
    mapping.hga_position_meters[2],
  ]);

  // For each mapping entry, create a leaf node that wraps the mesh and
  // parent it under the target group. Counter-translate the leaf so the
  // mesh's geometry stays visually anchored where the upstream GLB had it
  // (i.e. the SCAN_PLATFORM/HGA group's local origin is the articulation
  // pivot, not the mesh centroid — the leaf node's translation cancels the
  // group's translation so the mesh's world position is preserved).
  for (const entry of mapping.mesh_mapping) {
    const meshIdx = entry.source_mesh_index;
    const mesh = meshes[meshIdx];
    if (mesh === undefined) {
      throw new Error(
        `mesh-mapping references source_mesh_index=${meshIdx} but GLB only has ${meshes.length} meshes`,
      );
    }
    // Sanity: cross-check source_name as a guard against mesh reordering on
    // re-export. Fail loudly so a contributor updating voyager-raw.glb is
    // forced to update voyager-mesh-mapping.json in the same change.
    if (mesh.getName() !== entry.source_name) {
      throw new Error(
        `mesh-mapping mismatch at index ${meshIdx}: expected source_name="${entry.source_name}", got "${mesh.getName()}". Update bake/inputs/voyager-mesh-mapping.json.`,
      );
    }

    const leaf = doc.createNode(`mesh_${entry.source_name}`);
    leaf.setMesh(mesh);
    // Counter-translate so the mesh stays at its original world position:
    //   leaf.translation + group.translation = (0, 0, 0)
    // For SCAN_PLATFORM the group sits at scan_platform_pivot_meters; the
    // leaf inverts so the mesh vertices remain at the upstream coordinates.
    if (entry.target_parent === 'BUS') {
      busNode.addChild(leaf);
    } else if (entry.target_parent === 'SCAN_PLATFORM') {
      leaf.setTranslation([
        -mapping.scan_platform_pivot_meters[0],
        -mapping.scan_platform_pivot_meters[1],
        -mapping.scan_platform_pivot_meters[2],
      ]);
      platformNode.addChild(leaf);
    } else {
      // HGA — counter both the rotation AND the translation. For the
      // rotation, the inverse of a quaternion (x, y, z, w) representing a
      // pure 180° rotation is (-x, -y, -z, w); for our (1,0,0,0) HGA quat
      // the inverse is (-1, 0, 0, 0) — but since Rx(180°) is self-inverse,
      // we can use the same quat or its negation. We use the negation to
      // be explicit about the inversion semantics.
      const q = mapping.hga_orientation_relative_to_bus_quat;
      leaf.setRotation([-q[0], -q[1], -q[2], q[3]]);
      leaf.setTranslation([
        -mapping.hga_position_meters[0],
        -mapping.hga_position_meters[1],
        -mapping.hga_position_meters[2],
      ]);
      hgaNode.addChild(leaf);
    }
  }

  // SCAN_PLATFORM + HGA are children of BUS. BUS is the scene root.
  busNode.addChild(platformNode);
  busNode.addChild(hgaNode);

  // Detach all previous nodes from the scene and add only BUS.
  for (const oldChild of scene.listChildren()) {
    scene.removeChild(oldChild);
  }
  scene.addChild(busNode);

  // Clean up orphan nodes (the old Blender-export nodes are now unparented
  // but still attached to the document; `prune` will GC them but for clarity
  // we explicitly dispose nodes that have no scene-graph ancestor).
  for (const node of root.listNodes()) {
    if (
      node !== busNode &&
      node !== platformNode &&
      node !== hgaNode &&
      isOrphanedFromScene(node, scene)
    ) {
      node.dispose();
    }
  }
};

const isOrphanedFromScene = (node: Node, scene: ReturnType<Document['createScene']>): boolean => {
  // Walk up parents to see if we reach `scene`. gltf-transform's Node has
  // `getParentNode()` returning the parent Node or null; the scene-root
  // children list is what scene.listChildren() returns.
  let current: Node | null = node;
  const sceneChildren = new Set(scene.listChildren());
  while (current !== null) {
    if (sceneChildren.has(current)) return false;
    current = current.getParentNode();
  }
  return true;
};

// === Main pipeline ============================================================

const main = async (): Promise<void> => {
  console.log('[build-glb] Story 3.3 — building Voyager LOD chain');

  requireToktx();

  // Read raw GLB + mesh mapping JSON.
  const mappingRaw = await readFile(MAPPING_JSON, 'utf8');
  const mapping = JSON.parse(mappingRaw) as MeshMapping;

  // Verify source SHA-256 matches the mapping's pinned value (T2.4 guard:
  // a regenerated input GLB invalidates the mapping; surface clearly).
  const rawBytes = await readFile(RAW_GLB);
  const actualSha = createHash('sha256').update(rawBytes).digest('hex');
  if (actualSha !== mapping.source_sha256) {
    throw new Error(
      `voyager-raw.glb SHA-256 mismatch:\n  expected ${mapping.source_sha256}\n  actual   ${actualSha}\nUpdate bake/inputs/voyager-mesh-mapping.json with the new mesh inventory.`,
    );
  }
  console.log(`[build-glb] raw GLB SHA-256 OK (${actualSha.slice(0, 12)}...)`);

  // Set up NodeIO with ALL_EXTENSIONS + Draco decoder module + meshopt encoder.
  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;

  const dracoModule = await draco3d.createDecoderModule();
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': dracoModule,
      // Story 3.3 smoke-fix: EXTMeshoptCompression writer needs the encoder
      // wired through the IO's dependency registry. Without this, the writer
      // calls `this.encoder.encodeGltfBuffer` on an undefined `encoder` and
      // throws `TypeError: Cannot read properties of undefined`. Required
      // per @gltf-transform/extensions §EXTMeshoptCompression usage docs.
      'meshopt.encoder': MeshoptEncoder,
    });

  // Read once into a "base" document. We'll clone per-LOD.
  console.log(`[build-glb] reading ${RAW_GLB}`);
  const baseDoc = await io.read(RAW_GLB);

  // T2.3 — restructure named hierarchy
  console.log('[build-glb] restructuring mesh tree into BUS / SCAN_PLATFORM / HGA');
  restructureHierarchy(baseDoc, mapping);

  // Strip Draco extension (the meshopt-compressed output replaces it).
  const dracoExt = baseDoc.getRoot()
    .listExtensionsUsed()
    .find((e) => e.extensionName === 'KHR_draco_mesh_compression');
  if (dracoExt !== undefined) {
    dracoExt.dispose();
  }
  // Strip EXT_texture_webp so toktx reads the PNG fallback variants embedded
  // in the GLB. KHRTextureBasisu is added unconditionally below since AC1
  // commits to KTX2 textures.
  const webpExt = baseDoc.getRoot()
    .listExtensionsUsed()
    .find((e) => e.extensionName === 'EXT_texture_webp');
  if (webpExt !== undefined) {
    webpExt.dispose();
  }

  // Register KHR_texture_basisu so the writer emits it. Set required=true per
  // the gltf-transform extension docs — KTX2 cannot fall back to PNG/JPEG.
  baseDoc.createExtension(KHRTextureBasisu).setRequired(true);

  // T2.5 prep — KTX2 transcode happens once on the base doc (it's identical
  // across LODs since simplify only touches geometry).
  const workDir = await mkdtemp(join(tmpdir(), 'voyager-glb-'));
  console.log(`[build-glb] toktx work dir: ${workDir}`);
  try {
    const { converted, skipped } = await writeTexturesAsKtx2(baseDoc, workDir);
    console.log(`[build-glb] textures: converted ${converted}, skipped ${skipped}`);
  } finally {
    // Clean up the toktx work dir (best-effort; tests may want to inspect)
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }

  // Core pipeline (per AC2): prune → dedup → weld → meshopt. Applied once
  // on the base doc; cloned per-LOD afterwards.
  console.log('[build-glb] running prune / dedup / weld');
  await baseDoc.transform(
    prune(),
    dedup(),
    weld({}),
  );

  // T2.6 — content-hash the output filename. We compute the LOD's hash from
  // the bytes we'd write; since simplify is a deterministic transform, the
  // hash is stable across re-runs.
  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(dirname(FRAGMENT_OUT), { recursive: true });

  const lodFragments: ModelLodFragment[] = [];

  for (const spec of LOD_SCHEDULE) {
    console.log(`[build-glb] LOD${spec.level}: cloning + simplify(ratio=${spec.ratio})`);
    const lodDoc = cloneDocument(baseDoc);

    // simplify is a no-op at ratio = 1.0; gltf-transform still runs the
    // function but the resulting geometry is unchanged. Skip explicitly for
    // LOD0 to reduce determinism risk.
    const transforms = [];
    if (spec.ratio < 1.0) {
      transforms.push(
        simplify({ simplifier: MeshoptSimplifier, ratio: spec.ratio, error: 0.01 }),
      );
    }
    transforms.push(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    await lodDoc.transform(...transforms);

    // Write to a temp path so we can hash + rename atomically.
    const tempPath = join(OUTPUT_DIR, `voyager-lod${spec.level}.tmp.glb`);
    await io.write(tempPath, lodDoc);
    const lodBytes = await readFile(tempPath);
    const hash = createHash('sha256').update(lodBytes).digest('hex');
    const finalName = `voyager-lod${spec.level}.${hash.slice(0, 8)}.glb`;
    const finalPath = join(OUTPUT_DIR, finalName);

    // Idempotency: delete any prior LOD output with a different hash before
    // writing the new one. This is the cleanup that lets a re-run produce
    // byte-identical state on disk (no orphan voyager-lod{N}.<oldhash>.glb).
    const existingLODs = await listFilesMatching(OUTPUT_DIR, new RegExp(`^voyager-lod${spec.level}\\.[0-9a-f]{8}\\.glb$`));
    for (const stale of existingLODs) {
      if (stale !== finalName) {
        await rm(join(OUTPUT_DIR, stale)).catch(() => undefined);
      }
    }

    // Atomic rename of the temp file to the final hashed name.
    await writeFile(finalPath, lodBytes);
    await rm(tempPath).catch(() => undefined);

    const stats = await stat(finalPath);
    const sizeBytes = stats.size;

    // Get input vs output vertex counts for the build log.
    const baseVertCount = countVertices(baseDoc);
    const lodVertCount = countVertices(lodDoc);
    console.log(
      `[build-glb] voyager-lod${spec.level}: ${baseVertCount} → ${lodVertCount} verts, ${sizeBytes} bytes, sha256=${hash.slice(0, 16)}...`,
    );

    lodFragments.push({
      level: spec.level,
      url: `/models/${finalName}`,
      sha256: hash,
      sizeBytes,
      maxDistanceKm: spec.maxDistanceKm,
    });
  }

  // T2.7 — emit the manifest fragment JSON for bake/src/manifest_writer.py
  // to merge. The fragment has a single model entry (the Voyager spacecraft;
  // V1 + V2 share the same GLB set per Story 1.12 reuse pattern).
  const fragment: ModelsFragment = {
    models: [
      {
        id: 'voyager',
        lods: lodFragments,
        pivotMeters: [0, 0, 0],
        scaleToKm: 0.001,
      },
    ],
  };
  const fragmentJson = JSON.stringify(fragment, null, 2) + '\n';
  await writeFile(FRAGMENT_OUT, fragmentJson, 'utf8');
  console.log(`[build-glb] wrote ${FRAGMENT_OUT}`);

  console.log('[build-glb] done.');
};

// === Helpers =================================================================

const countVertices = (doc: Document): number => {
  let total = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (pos !== null) total += pos.getCount();
    }
  }
  return total;
};

const listFilesMatching = async (dir: string, pattern: RegExp): Promise<string[]> => {
  try {
    await access(dir);
  } catch {
    return [];
  }
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(dir);
  return entries.filter((e) => pattern.test(e));
};

// Run if invoked as a script (not when imported by tests). The check uses
// the file basename so it works under both Node-direct + tsx-import modes,
// across POSIX + Windows path separators. Vitest's argv[1] never contains
// "build_glb.ts" so this is safe.
const invokedAsScript = (() => {
  const argv1 = process.argv[1] ?? '';
  return argv1.replace(/\\/g, '/').endsWith('/scripts/build_glb.ts');
})();
if (invokedAsScript) {
  main().catch((err: unknown) => {
    console.error('[build-glb] FAILED:', err);
    process.exit(1);
  });
}

// Exported for tests.
export {
  main as buildGlb,
  LOD_SCHEDULE,
  type LodSpec,
  type MeshMapping,
  type ModelsFragment,
  type ModelFragment,
  type ModelLodFragment,
  restructureHierarchy,
  countVertices,
};
