/**
 * Story 3.3 — ambient declaration for `draco3dgltf` (no upstream .d.ts).
 *
 * Used by `web/scripts/build_glb.ts` to decode the upstream NASA Voyager
 * GLB's KHR_draco_mesh_compression payload (the upstream is Draco-compressed
 * per Story 1.12; we strip the extension after restructuring and re-encode
 * with EXT_meshopt_compression per ADR-0006).
 *
 * The Draco decoder module is a wasm-backed object. The gltf-transform
 * NodeIO registers it via `registerDependencies({'draco3d.decoder': mod})`
 * and gltf-transform handles all the .decode() calls — we never directly
 * invoke any decoder method here, so the shape is the minimal factory we
 * actually call.
 */
declare module 'draco3dgltf' {
  type DecoderModule = unknown;
  type EncoderModule = unknown;
  interface Draco3dGltf {
    createDecoderModule: () => Promise<DecoderModule>;
    createEncoderModule: () => Promise<EncoderModule>;
  }
  const draco3d: Draco3dGltf;
  export default draco3d;
}
