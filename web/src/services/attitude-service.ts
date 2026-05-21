// AttitudeService — runtime quaternion resolution for V1 and V2 (Story 3.2).
//
// Two regimes:
//   1. CK-window SLERP path (AC3): when the manifest declares a `bus_attitude`
//      or `platform_attitude` file covering the query ET, the service decodes
//      the (N, 5) attitude body, finds the two surrounding knots by binary
//      search on column 0 (the explicit per-sample ETs per ADR-0004 § Body
//      Layout per Kind, Story 3.1 amendment 2026-05-21), and SLERPs the
//      Three.js-convention quaternion between them. Story 3.1's pre-bake
//      sign-flip walk (ADR-0024) guarantees `dot(q_i, q_{i+1}) >= 0`, so the
//      runtime SLERP uses standard `THREE.Quaternion.slerpQuaternions` with
//      no shortest-path adjustment.
//   2. Synthesized HGA-Earth-pointing path (AC4): when no CK file covers the
//      ET, the service synthesizes a bus quaternion from the spacecraft and
//      Earth positions (queried via the injected `EphemerisService`) such
//      that the HGA boresight (FK constant) aligns with the spacecraft→Earth
//      direction. The platform quaternion is the bus quaternion composed with
//      `PLATFORM_REST_QUAT_RELATIVE_TO_BUS` (identity per FK; see fk-constants
//      § derivation block).
//
// Architecture pillars:
//   - Single chunk-loader (AC1): the constructor shares the existing
//     EphemerisService `ChunkLoader` — no second cache, no second decoder.
//   - Provenance is manifest-driven, not loader-driven (AC5): provenance
//     reflects what the manifest says, not whether the loader has the chunk
//     cached. Boundary discipline is a step function in provenance; no
//     smoothing across regime transitions.
//   - Sync API: per-frame `getBusQuat` / `getPlatformQuat` return synchronously.
//     A missing chunk kicks off async load and returns `null` (mirror of
//     EphemerisService Story 1.6 pattern), or falls back to synthesized in
//     the case where the CK chunk is in transit but the synthesized path is
//     valid for the current ET.
//   - Quaternion convention permute happens ONCE at decode time (AC2): the
//     SPICE scalar-first `[w, x, y, z]` body becomes Three.js scalar-last
//     `[x, y, z, w]` cached knots. Per-frame queries SLERP and return — no
//     repeated permute work.
//
// ADR compliance:
//   - ADR-0004 § Body Layout per Kind (Story 3.1 amendment): decoder reads
//     column 0 as the SLERP knot ET; columns 1-4 are SPICE scalar-first
//     quaternion. No linspace reconstruction (forbidden per Story 3.1 saga).
//   - ADR-0009 (no web workers): SLERP runs on the main thread.
//   - ADR-0015 (no global store): the service is constructed at boot and
//     injected into consumers via the FirstPaintHandle / module-level
//     references in `main.ts`.
//   - ADR-0024 (pre-bake sign-flip walk): runtime SLERP needs NO shortest-
//     path check; the walked data already guarantees `dot >= 0`.
//   - ADR-0026 (TS strict, no `any`): all public surfaces use the branded
//     `Quaternion` type.

import * as THREE from 'three';

import type { ChunkLoader, LoadedChunk } from './chunk-loader';
import type { Manifest, ManifestFile } from './manifest-loader';
import type { EphemerisService } from './ephemeris-service';
import type { Quaternion, WorldVec3 } from '../types/branded';
import { quaternion } from '../types/branded';
import {
  V1_NAIF_ID,
  V2_NAIF_ID,
  VG1_HGA_BORESIGHT_RELATIVE_TO_BUS,
  VG2_HGA_BORESIGHT_RELATIVE_TO_BUS,
  VG1_PLATFORM_REST_QUAT_RELATIVE_TO_BUS,
  VG2_PLATFORM_REST_QUAT_RELATIVE_TO_BUS,
  VG1_SOLAR_PANEL_AXIS_RELATIVE_TO_BUS,
  VG2_SOLAR_PANEL_AXIS_RELATIVE_TO_BUS,
} from './fk-constants';

export type AttitudeKind = 'bus_attitude' | 'platform_attitude';
export type AttitudeProvenance = 'ck' | 'synthesized';

/**
 * NAIF ID for Earth used as the HGA-Earth-pointing aim target. Story 1.13
 * baked NAIF=3 (Earth-Moon barycenter). At cruise-scale distances (≥1 AU
 * spacecraft separation) the EMBary vs Earth-centre offset (~1 part in 1e8)
 * is well below the synthesized-attitude visual fidelity bar.
 */
export const EARTH_NAIF_ID = 3;

interface DecodedAttitude {
  /** Knot ETs read from column 0 of the (N, 5) attitude body. */
  readonly knotEts: Float64Array;
  /**
   * Three.js-convention quaternions (scalar-last `[x, y, z, w]`) — one per
   * knot. The SPICE → Three.js permute happens ONCE here at decode time so
   * per-frame queries are pure SLERP + return.
   */
  readonly knotQuats: ReadonlyArray<THREE.Quaternion>;
}

interface AttitudeFileIndex {
  /** Sorted ascending by `timeRangeEt[0]`. */
  readonly sortedFiles: ReadonlyArray<ManifestFile>;
  /** Parallel to `sortedFiles`: `starts[i] = sortedFiles[i].timeRangeEt[0]`. */
  readonly starts: ReadonlyArray<number>;
}

// Key shape: `${spacecraftNaifId}|${kind}` (string-encoded tuple — Maps with
// composite keys are otherwise object-ref-based which makes per-call construction
// allocate). Trivial parse on the hot path; lookup is by string equality.
type IndexKey = string;
const makeIndexKey = (spacecraftNaifId: number, kind: AttitudeKind): IndexKey =>
  `${spacecraftNaifId}|${kind}`;

export class AttitudeService {
  private readonly chunkLoader: ChunkLoader;
  private readonly ephemerisService: EphemerisService;
  private readonly index = new Map<IndexKey, AttitudeFileIndex>();
  /** Decoded-attitude cache, keyed by chunk URL — decode happens once per chunk-load. */
  private readonly decodedByUrl = new Map<string, DecodedAttitude>();
  /** One-time `console.warn` deduplication for missing-chunk loader failures. */
  private readonly warnedUrls = new Set<string>();

  constructor(
    manifest: Manifest,
    chunkLoader: ChunkLoader,
    ephemerisService: EphemerisService,
  ) {
    this.chunkLoader = chunkLoader;
    this.ephemerisService = ephemerisService;

    // Build the (spacecraftNaifId, kind) → AttitudeFileIndex map. The manifest
    // groups attitude files under the spacecraft's NAIF SPK ID (-31 / -32);
    // the per-file `kind` discriminates bus vs platform.
    const buckets = new Map<IndexKey, ManifestFile[]>();
    for (const body of manifest.bodies) {
      if (body.naifId !== V1_NAIF_ID && body.naifId !== V2_NAIF_ID) continue;
      for (const file of body.files) {
        if (file.kind === 'bus_attitude' || file.kind === 'platform_attitude') {
          const key = makeIndexKey(body.naifId, file.kind);
          const bucket = buckets.get(key);
          if (bucket === undefined) {
            buckets.set(key, [file]);
          } else {
            bucket.push(file);
          }
        }
      }
    }
    for (const [key, files] of buckets) {
      const sorted = files
        .slice()
        .sort((a, b) => a.timeRangeEt[0] - b.timeRangeEt[0]);
      this.index.set(key, {
        sortedFiles: sorted,
        starts: sorted.map((f) => f.timeRangeEt[0]),
      });
    }
  }

  /**
   * Returns the attitude file covering `et` for `(spacecraftNaifId, kind)`,
   * or `null` if no manifest entry covers the ET. This is the SINGLE source
   * of truth for provenance: a non-null return ⇒ provenance `'ck'`; a null
   * return ⇒ provenance `'synthesized'`. Independent of whether the chunk is
   * loaded (per AC5).
   */
  findAttitudeFile(
    et: number,
    spacecraftNaifId: number,
    kind: AttitudeKind,
  ): ManifestFile | null {
    const idx = this.index.get(makeIndexKey(spacecraftNaifId, kind));
    if (idx === undefined) return null;
    if (idx.sortedFiles.length === 0) return null;
    if (et < idx.starts[0]) return null;

    // Binary-search for the largest start <= et.
    let lo = 0;
    let hi = idx.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (idx.starts[mid] <= et) lo = mid;
      else hi = mid - 1;
    }
    const candidate = idx.sortedFiles[lo];
    if (et > candidate.timeRangeEt[1]) return null;
    return candidate;
  }

  /** Provenance for the bus attitude at `et` — `'ck'` if any bus_attitude file covers ET, else `'synthesized'`. */
  getBusProvenance(spacecraftNaifId: number, et: number): AttitudeProvenance {
    return this.findAttitudeFile(et, spacecraftNaifId, 'bus_attitude') !== null
      ? 'ck'
      : 'synthesized';
  }

  /** Provenance for the platform attitude at `et`. May differ from bus (V1 PBD has bus CK but no platform CK). */
  getPlatformProvenance(spacecraftNaifId: number, et: number): AttitudeProvenance {
    return this.findAttitudeFile(et, spacecraftNaifId, 'platform_attitude') !== null
      ? 'ck'
      : 'synthesized';
  }

  /**
   * Returns the spacecraft bus attitude at `et` as a Three.js-convention
   * branded `Quaternion`, or `null` if a CK chunk needed by the file lookup
   * has not yet landed in the chunk-loader cache. Per AC5 boundary discipline,
   * the regime selection is manifest-driven (not loader-availability-driven):
   * if a CK file covers the ET we use the CK path; if no CK file covers, we
   * synthesize from Earth-pointing.
   */
  getBusQuat(spacecraftNaifId: number, et: number): Quaternion | null {
    const file = this.findAttitudeFile(et, spacecraftNaifId, 'bus_attitude');
    if (file !== null) {
      const ckResult = this.slerpFromCkFile(file, et);
      // If the chunk has not loaded yet, `slerpFromCkFile` returns null. We
      // do NOT fall through to the synthesized path — that would produce a
      // silent regime substitution per AC5. The caller (per-frame render
      // loop) must tolerate the transient null and use hold-previous
      // semantics, mirroring the EphemerisService contract.
      return ckResult;
    }
    return this.synthesizeBusQuat(spacecraftNaifId, et);
  }

  /**
   * Returns the scan-platform attitude at `et`. CK path mirrors `getBusQuat`;
   * the synthesized path composes the synthesized bus quaternion with the
   * platform's FK-derived rest pose (identity per Story 3.2 § Tasks T5.6 —
   * platform articulation only occurs during CK-covered encounters).
   */
  getPlatformQuat(spacecraftNaifId: number, et: number): Quaternion | null {
    const file = this.findAttitudeFile(et, spacecraftNaifId, 'platform_attitude');
    if (file !== null) {
      return this.slerpFromCkFile(file, et);
    }
    return this.synthesizePlatformQuat(spacecraftNaifId, et);
  }

  /**
   * Decode + SLERP a CK chunk at `et`. Returns null when the chunk has not
   * yet been loaded by the chunk-loader; kicks off the async load so a
   * subsequent frame will see the cached chunk and return real data.
   */
  private slerpFromCkFile(file: ManifestFile, et: number): Quaternion | null {
    const chunk = this.chunkLoader.peek(file.url);
    if (chunk === undefined) {
      void this.chunkLoader.load(file).catch((err: unknown) => {
        if (this.warnedUrls.has(file.url)) return;
        this.warnedUrls.add(file.url);
        console.warn(`[attitude] chunk load failed for ${file.url}:`, err);
      });
      return null;
    }

    let decoded = this.decodedByUrl.get(file.url);
    if (decoded === undefined) {
      decoded = decodeAttitudeChunk(chunk);
      this.decodedByUrl.set(file.url, decoded);
    }

    return slerpAtEt(decoded, et);
  }

  /**
   * Build the HGA-Earth-pointing bus quaternion at `et`. Returns null when
   * either spacecraft or Earth ephemeris is not yet available (caller uses
   * hold-previous semantics — mirrors EphemerisService null contract).
   */
  private synthesizeBusQuat(
    spacecraftNaifId: number,
    et: number,
  ): Quaternion | null {
    const scPos = this.ephemerisService.getPosition(et, spacecraftNaifId);
    const earthPos = this.ephemerisService.getPosition(et, EARTH_NAIF_ID);
    if (scPos === null || earthPos === null) return null;

    const hgaInBus = hgaBoresightInBus(spacecraftNaifId);
    const solarInBus = solarPanelAxisInBus(spacecraftNaifId);

    return synthesizeHgaPointingQuat(scPos, earthPos, hgaInBus, solarInBus);
  }

  /**
   * Compose the synthesized bus quaternion with the platform's rest pose.
   * Per FK derivation (fk-constants.ts § derivation block), the platform-
   * rest-relative-to-bus is identity, so the platform quaternion equals the
   * bus quaternion during cruise. The composition is left explicit so future
   * stories (5.2 PBD choreographed turn) can replace the identity with a
   * choreographed local-frame rotation without changing the call site.
   */
  private synthesizePlatformQuat(
    spacecraftNaifId: number,
    et: number,
  ): Quaternion | null {
    const busQuat = this.synthesizeBusQuat(spacecraftNaifId, et);
    if (busQuat === null) return null;
    const restQuat = platformRestRelativeToBus(spacecraftNaifId);
    // q_platform_world = q_bus_world · q_platform_rest_relative_to_bus
    const result = new THREE.Quaternion(busQuat.x, busQuat.y, busQuat.z, busQuat.w);
    const rest = new THREE.Quaternion(
      restQuat[0],
      restQuat[1],
      restQuat[2],
      restQuat[3],
    );
    result.multiply(rest);
    return quaternion(result.x, result.y, result.z, result.w);
  }
}

// =============================================================================
// Pure functions — exported for unit tests.
// =============================================================================

/**
 * Decode an attitude (N, 5) VTRJ chunk into (Float64Array knotEts) +
 * (Three.js Quaternion[] knotQuats). The SPICE scalar-first `[w, x, y, z]`
 * convention is permuted to Three.js scalar-last `[x, y, z, w]` once per
 * sample — per AC2, never again at query time.
 *
 * `chunk.samples` is a Float64Array view over the body bytes returned by
 * `chunk-loader.sliceSamples`. For attitude bodies that view is sized as
 * `sampleCount * 5` doubles (Story 3.1 ADR-0004 amendment); the layout
 * is `[et_0, qw_0, qx_0, qy_0, qz_0, et_1, qw_1, ...]`.
 */
export const decodeAttitudeChunk = (chunk: LoadedChunk): DecodedAttitude => {
  const { header, samples } = chunk;
  const n = header.sampleCount;
  if (samples.length !== n * 5) {
    throw new Error(
      `attitude-service: expected ${n * 5} doubles in (N, 5) body; got ${samples.length}`,
    );
  }
  const knotEts = new Float64Array(n);
  const knotQuats: THREE.Quaternion[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const base = i * 5;
    knotEts[i] = samples[base + 0];
    // SPICE scalar-first [w, x, y, z] → Three.js scalar-last [x, y, z, w].
    // The permute is the ONLY convention-aware operation; downstream code is
    // entirely Three.js-convention.
    const qw = samples[base + 1];
    const qx = samples[base + 2];
    const qy = samples[base + 3];
    const qz = samples[base + 4];
    knotQuats[i] = new THREE.Quaternion(qx, qy, qz, qw);
  }
  return { knotEts, knotQuats };
};

/**
 * SLERP-at-ET over the decoded attitude. Binary searches for the two
 * surrounding knots and returns the SLERPed Three.js quaternion as a branded
 * `Quaternion`. Edge cases:
 *   - ET at-or-before the first knot → returns knot 0 unchanged.
 *   - ET at-or-after the last knot → returns knot N-1 unchanged.
 *   - ET between knots → standard `THREE.Quaternion.slerpQuaternions`
 *     (Story 3.1's pre-bake walk_signs guarantees the SLERP takes the short
 *     way; no shortest-path adjustment per ADR-0024 § Consequences).
 *
 * @throws if the decoded attitude is empty (decoded chunks always have ≥1
 * knot per `vtrj_writer._validate_inputs`'s sample-count ≥ 1 contract).
 */
export const slerpAtEt = (
  decoded: DecodedAttitude,
  et: number,
): Quaternion => {
  const { knotEts, knotQuats } = decoded;
  const n = knotEts.length;
  if (n === 0) {
    throw new Error('attitude-service: decoded chunk has zero knots');
  }
  if (et <= knotEts[0]) {
    const q0 = knotQuats[0];
    return quaternion(q0.x, q0.y, q0.z, q0.w);
  }
  if (et >= knotEts[n - 1]) {
    const qLast = knotQuats[n - 1];
    return quaternion(qLast.x, qLast.y, qLast.z, qLast.w);
  }

  // Binary search for the largest i such that knotEts[i] <= et < knotEts[i+1].
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (knotEts[mid] <= et) lo = mid;
    else hi = mid - 1;
  }
  const i = lo;
  const t0 = knotEts[i];
  const t1 = knotEts[i + 1];
  // Defensive guard against pathological duplicate ETs (vtrj_writer's
  // `_validate_inputs` permits monotonically non-decreasing, so equal-ET
  // pairs are possible but rare; SciPy Slerp at the bake side rejects them
  // upstream). Treat duplicate as "use knot i".
  if (t1 === t0) {
    const q = knotQuats[i];
    return quaternion(q.x, q.y, q.z, q.w);
  }
  const tau = (et - t0) / (t1 - t0);
  const result = new THREE.Quaternion().slerpQuaternions(
    knotQuats[i],
    knotQuats[i + 1],
    tau,
  );
  return quaternion(result.x, result.y, result.z, result.w);
};

/**
 * Synthesize the HGA-Earth-pointing bus quaternion. Constructs an orthonormal
 * rotation `R_bus_to_world` such that:
 *   1. `R_bus_to_world · hgaInBus = (scToEarth unit vector in world)`
 *      (primary constraint: HGA boresight aims at Earth)
 *   2. The projection of `R_bus_to_world · solarInBus` onto the plane
 *      perpendicular to the primary axis aligns with the world-frame ecliptic
 *      +Z (secondary constraint: bus +X locked to ecliptic-up after Earth-aim;
 *      a visualization convention — see fk-constants § derivation block).
 *
 * Implementation is a Gram-Schmidt on the world-space basis:
 *   - z_w = -scToEarthUnit  (because Voyager's HGA boresight is bus -Z, and
 *     we want bus -Z to point at Earth → bus +Z points AWAY from Earth, i.e.
 *     the world -scToEarth direction maps to bus +Z. Equivalently, we want
 *     R · (0, 0, -1) = scToEarthUnit → R · (0, 0, 1) = -scToEarthUnit.)
 *
 * The math: we construct R such that the BUS-frame axes (X, Y, Z) map to
 * world-frame vectors (X_w, Y_w, Z_w):
 *   - Z_w  = -scToEarthUnit  (so bus +Z is opposite Earth; HGA -Z aims at Earth)
 *   - X_w  = projection of world ecliptic-up onto the plane ⊥ Z_w, normalized
 *   - Y_w  = Z_w × X_w  (right-hand rule completes the basis)
 * R is the matrix [X_w | Y_w | Z_w]. The Three.js quaternion is recovered via
 * `Quaternion.setFromRotationMatrix`.
 *
 * Numerical edge case: if scToEarth is parallel to ecliptic-up (the rare case
 * of an off-ecliptic encounter geometry, e.g. V1 post-Saturn at high
 * inclination near the line connecting the Sun to Earth), the Gram-Schmidt
 * degenerates. Fallback: use world +X as the secondary direction.
 */
export const synthesizeHgaPointingQuat = (
  scPos: WorldVec3,
  earthPos: WorldVec3,
  hgaInBus: readonly [number, number, number],
  solarInBus: readonly [number, number, number],
): Quaternion => {
  // Spacecraft → Earth unit vector (world frame, km).
  const dx = earthPos[0] - scPos[0];
  const dy = earthPos[1] - scPos[1];
  const dz = earthPos[2] - scPos[2];
  const distance = Math.hypot(dx, dy, dz);
  if (distance === 0) {
    // Spacecraft is colocated with Earth (impossible in practice but defended
    // for unit-test robustness). Return identity.
    return quaternion(0, 0, 0, 1);
  }
  const aimX = dx / distance;
  const aimY = dy / distance;
  const aimZ = dz / distance;

  // We solve: R · hgaInBus = (aimX, aimY, aimZ).
  // The HGA boresight in bus frame is constant (bus -Z; see fk-constants).
  // To avoid the generic two-vector alignment math (and the secondary-axis
  // ambiguity it requires resolving), we use Three.js's setFromUnitVectors
  // for the primary alignment, then post-multiply with a roll quaternion
  // about the primary axis to satisfy the secondary constraint.
  const hgaThree = new THREE.Vector3(hgaInBus[0], hgaInBus[1], hgaInBus[2]);
  const aimThree = new THREE.Vector3(aimX, aimY, aimZ);
  const primary = new THREE.Quaternion().setFromUnitVectors(hgaThree, aimThree);

  // After `primary`, the bus's `solarInBus` direction has been rotated to
  // some world-frame direction `solarInWorld`. We want to roll about the
  // primary axis (aimThree in world frame, i.e. the spacecraft→Earth ray)
  // so that the projection of `solarInWorld` onto the plane perpendicular
  // to `aimThree` aligns with the projection of world ecliptic-up
  // (J2000 +Z = (0, 0, 1)) onto that same plane.
  const solarThree = new THREE.Vector3(solarInBus[0], solarInBus[1], solarInBus[2]);
  const solarInWorld = solarThree.clone().applyQuaternion(primary);

  // Project both `solarInWorld` and ecliptic-up onto the plane perpendicular
  // to `aimThree`. The roll angle is the signed angle from the solar
  // projection to the up projection, measured about `aimThree`.
  const projectOntoPlane = (
    v: THREE.Vector3,
    planeNormal: THREE.Vector3,
  ): THREE.Vector3 => {
    const dot = v.dot(planeNormal);
    return new THREE.Vector3(
      v.x - dot * planeNormal.x,
      v.y - dot * planeNormal.y,
      v.z - dot * planeNormal.z,
    );
  };

  // Ecliptic-up (world frame, J2000) = +Z. Fallback to world +X if degenerate.
  let up = new THREE.Vector3(0, 0, 1);
  let upProj = projectOntoPlane(up, aimThree);
  if (upProj.lengthSq() < 1e-12) {
    up = new THREE.Vector3(1, 0, 0);
    upProj = projectOntoPlane(up, aimThree);
  }
  upProj.normalize();

  const solarProj = projectOntoPlane(solarInWorld, aimThree);
  if (solarProj.lengthSq() < 1e-12) {
    // solarInWorld is parallel to the primary axis (degenerate). No roll
    // adjustment possible; return the primary alone.
    return quaternion(primary.x, primary.y, primary.z, primary.w);
  }
  solarProj.normalize();

  // Signed angle between solarProj and upProj about aimThree:
  //   cos = solarProj · upProj
  //   sin = (solarProj × upProj) · aimThree
  const cosAngle = THREE.MathUtils.clamp(solarProj.dot(upProj), -1, 1);
  const cross = new THREE.Vector3().crossVectors(solarProj, upProj);
  const sinAngle = cross.dot(aimThree);
  const angle = Math.atan2(sinAngle, cosAngle);

  // Roll quaternion about the primary axis (world-frame aimThree). We pre-
  // apply it as a world-space rotation, so the composition order is
  // `roll · primary` (apply primary first, then roll about the aim axis).
  const roll = new THREE.Quaternion().setFromAxisAngle(aimThree, angle);
  const combined = new THREE.Quaternion().multiplyQuaternions(roll, primary);

  return quaternion(combined.x, combined.y, combined.z, combined.w);
};

// =============================================================================
// FK-constant routers (per-spacecraft).
// =============================================================================

const hgaBoresightInBus = (
  spacecraftNaifId: number,
): readonly [number, number, number] =>
  spacecraftNaifId === V2_NAIF_ID
    ? VG2_HGA_BORESIGHT_RELATIVE_TO_BUS
    : VG1_HGA_BORESIGHT_RELATIVE_TO_BUS;

const solarPanelAxisInBus = (
  spacecraftNaifId: number,
): readonly [number, number, number] =>
  spacecraftNaifId === V2_NAIF_ID
    ? VG2_SOLAR_PANEL_AXIS_RELATIVE_TO_BUS
    : VG1_SOLAR_PANEL_AXIS_RELATIVE_TO_BUS;

const platformRestRelativeToBus = (
  spacecraftNaifId: number,
): readonly [number, number, number, number] =>
  spacecraftNaifId === V2_NAIF_ID
    ? VG2_PLATFORM_REST_QUAT_RELATIVE_TO_BUS
    : VG1_PLATFORM_REST_QUAT_RELATIVE_TO_BUS;
