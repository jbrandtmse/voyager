// FK (Frame Kernel) constants for Voyager 1 / Voyager 2 (Story 3.2 AC6).
//
// Hardcodes the canonical FK-derived rotations and boresight vectors from
// `kernels/vg1_v02.tf` and `kernels/vg2_v02.tf`. The values are committed
// at compile time so the runtime does not have to parse SPICE FK syntax;
// `fk-constants.test.ts` asserts orthonormality and parity with the source
// kernels (manual transcription from the cited line ranges below).
//
// Conventions:
//   - Vectors are expressed in the spacecraft BUS frame.
//   - Quaternions are scalar-LAST `[x, y, z, w]` (Three.js / WebGL); the
//     SPICE → Three.js permute is done at the constant authoring point, so
//     consumers never see SPICE scalar-first quaternions.
//   - `as const` everywhere — compile-time immutability per AC6.
//
// Source kernels (verbatim transcription points; line numbers are stable
// because the kernels are content-hash-pinned in `kernels/kernels-manifest.json`):
//   - `kernels/vg1_v02.tf` lines 157-172 → spacecraft frame IDs
//   - `kernels/vg1_v02.tf` lines 217-230 → VG1_HGA TKFRAME (boresight +Z;
//        relative to VG1_SC_BUS via ROLL=180°, PITCH=0, YAW=0; AXES=(1,2,3))
//   - `kernels/vg1_v02.tf` lines 247-256 → VG1_ISSNA TKFRAME (identity
//        relative to VG1_SCAN_PLATFORM; boresight +Z)
//   - `kernels/vg2_v02.tf` lines 165-180 → V2 spacecraft frame IDs
//   - `kernels/vg2_v02.tf` lines 228-239 → VG2_HGA TKFRAME (identical
//        construction to V1 — same ROLL=180° about X, same +Z boresight)
//   - `kernels/vg2_v02.tf` lines 256-265 → VG2_ISSNA TKFRAME (identity)
//
// Derivation of HGA_BORESIGHT_RELATIVE_TO_BUS:
//   The FK ROT transforms vec_in_bus → vec_in_hga (per the TKFRAME comment
//   block at vg1_v02.tf:84-113). The HGA boresight is +Z in HGA frame
//   (vg1_v02.tf:217 "The boresight of the antenna is the +Z axis"). To express
//   the boresight axis IN bus frame: v_bus = ROT^T · [0,0,1]. With
//   ROLL=180°, PITCH=0, YAW=0, AXES=(1,2,3): ROT = Rz(0)·Ry(0)·Rx(180°)
//   = Rx(180°) = diag(1, -1, -1). Since Rx(180°) is symmetric and self-inverse,
//   v_bus = Rx(180°) · [0,0,1] = [0, 0, -1]. The HGA points along the -Z
//   axis of the bus.
//
// Derivation of PLATFORM_REST_QUAT_RELATIVE_TO_BUS:
//   The scan platform (-31100 / -32100) is a Class-3 CK frame, not a TKFRAME,
//   so the FK does NOT define a static orientation relative to the bus. Story
//   3.2 § Tasks T5.6 specifies the cruise-rest pose as identity (platform
//   aligned with bus); platform articulation is CK-driven during encounters
//   (Story 3.1's `platform_attitude` files), and Story 5.2 will override for
//   the PBD choreographed turn. Identity is the most defensible choice for
//   the "no articulation during cruise" contract.
//
// Derivation of NA_CAMERA_BORESIGHT_RELATIVE_TO_PLATFORM:
//   VG1_ISSNA (-31101) is a TKFRAME relative to VG1_SCAN_PLATFORM with
//   ANGLES=(0,0,0) (identity rotation). Boresight is +Z in NA-camera frame,
//   which equals +Z in the platform frame. Same for V2 (vg2_v02.tf:256-265).
//
// Derivation of SOLAR_PANEL_AXIS_RELATIVE_TO_BUS:
//   Voyager has no solar panels (RTG-powered). The "secondary-axis constraint"
//   for the synthesized HGA-Earth-pointing attitude is therefore not a real
//   solar-panel vector; it is the spacecraft's roll-axis convention. Per the
//   bus body-fixed frame definition (FRAME_VG{1,2}_SC_BUS, Class-3 CK frame),
//   bus +X is the convention pivot for the cruise roll reference (the
//   Voyager AACS uses Sun + Canopus to fix the bus roll about HGA axis; the
//   visualization choice here is "lock bus +X to ecliptic-up after Earth-aim").
//   This is a visualization convention, not a mission fact — documented in
//   `attitude-service.ts` § synthesizeBusQuat below.

// === V1 frame IDs (vg1_v02.tf:155-172, 217-230, 247-256) =====================

export const VG1_BUS_FRAME_ID = -31000;
export const VG1_SCAN_PLATFORM_FRAME_ID = -31100;
export const VG1_NA_CAMERA_FRAME_ID = -31101;
export const VG1_HGA_FRAME_ID = -31400;

// === V2 frame IDs (vg2_v02.tf:163-180, 228-239, 256-265) =====================

export const VG2_BUS_FRAME_ID = -32000;
export const VG2_SCAN_PLATFORM_FRAME_ID = -32100;
export const VG2_NA_CAMERA_FRAME_ID = -32101;
export const VG2_HGA_FRAME_ID = -32400;

// === Spacecraft NAIF SPK IDs (the 2-digit ID rolls trajectory + attitude up) ==

export const V1_NAIF_ID = -31;
export const V2_NAIF_ID = -32;

// === HGA boresight unit vector in bus frame ==================================
//
// Derived above. Identical for V1 and V2 — same TKFRAME construction in both
// vg1_v02.tf:217-230 and vg2_v02.tf:228-239 (ROLL=180°, PITCH=0, YAW=0,
// AXES=(1,2,3)).

export const VG1_HGA_BORESIGHT_RELATIVE_TO_BUS = [0.0, 0.0, -1.0] as const;
export const VG2_HGA_BORESIGHT_RELATIVE_TO_BUS = [0.0, 0.0, -1.0] as const;

// === Scan-platform rest quaternion relative to bus ===========================
//
// Identity — see derivation comment block above.
// Scalar-LAST [x, y, z, w].

export const VG1_PLATFORM_REST_QUAT_RELATIVE_TO_BUS = [0.0, 0.0, 0.0, 1.0] as const;
export const VG2_PLATFORM_REST_QUAT_RELATIVE_TO_BUS = [0.0, 0.0, 0.0, 1.0] as const;

// === NA-camera boresight unit vector in platform frame =======================
//
// VG{1,2}_ISSNA TKFRAME is identity relative to VG{1,2}_SCAN_PLATFORM, so
// the NA-camera +Z boresight equals the platform +Z axis verbatim. The
// platform-frame boresight is what Story 3.5 composes with the platform
// world quaternion to recover the world-space cone direction.

export const VG1_NA_CAMERA_BORESIGHT_RELATIVE_TO_PLATFORM = [0.0, 0.0, 1.0] as const;
export const VG2_NA_CAMERA_BORESIGHT_RELATIVE_TO_PLATFORM = [0.0, 0.0, 1.0] as const;

// === Solar-panel axis (visualization-convention secondary-axis constraint) ===
//
// Bus +X — see derivation comment block above. Used as the secondary-axis
// constraint when synthesizing the HGA-Earth-pointing attitude during cruise.

export const VG1_SOLAR_PANEL_AXIS_RELATIVE_TO_BUS = [1.0, 0.0, 0.0] as const;
export const VG2_SOLAR_PANEL_AXIS_RELATIVE_TO_BUS = [1.0, 0.0, 0.0] as const;
