# Story 3.5 — Lead-driven Chrome DevTools MCP smoke evidence

Date: 2026-05-22
Lead model: claude-opus-4-7
Dev server: `cd web && npm run dev -- --port 5173 --host 127.0.0.1`

## Probe 1 — V1 Jupiter ET (synthesized locally per Story 3.4 local-manifest constraint)

URL: `http://127.0.0.1:5173/?t=1979-03-05T11:30:00Z`

`__voyagerDebug.boresightRenderer` published ✓ (AC8 prereq).

Scene-graph walk of V1's group surfaced exactly one `LineSegments` cone:

```
{
  name: "voyager-1-na-boresight-cone",
  parent_name: "SCAN_PLATFORM",         ✓ AC1 contract
  material_opacity: 0.5,                ✓ AC2 contract
  material_transparent: true,           ✓ AC2 contract
  material_color: "d4a017",             ✓ amber accent, low-saturation
  scale: [0.001, 0.001, 0.001],         ✓ unit-scale-then-mesh-scale fix
  visible: true,                        ✓
}
```

V2 cone identical (name `voyager-2-na-boresight-cone`).

**Cone count:** exactly 2 across both spacecraft scene graphs. AC3 single-instance contract ✓ (NOT 8 = one per LOD level × 2 spacecraft).

Screenshot: `probe1-v1-jupiter-boresight-cone.png` — V1 visible with the thin amber wireframe cone extending from the scan platform along the platform's +Z axis.

## Probe 2 — Cruise ET (1995-01-01)

URL: `http://127.0.0.1:5173/?t=1995-01-01T00:00:00Z`

V1 cone still parented to SCAN_PLATFORM. World position `[-2.70e9, -6.68e9, 4.85e9]` km — places the cone with V1 in its outer-cruise heliocentric location, ~70 AU from Sun. SCAN_PLATFORM inherits the bus's synthesized HGA-Earth-pointing quaternion (Story 3.2 § Completion Note 5: PLATFORM_REST_RELATIVE_TO_BUS = identity in cruise), so the cone's world orientation is along the synthesized cruise bus +Z axis.

The Story 3.5 epic's AC4 third clause ("scrubbing forward 1 simulated hour at 100× speed shows the cone sweeping from Io to Europa to Ganymede to Callisto") is structurally deferred to the post-CI-bake visual smoke + Story 3.7's L2 validator — local manifest lacks CK attitude files (see Story 3.4 deferred-work `[3.4 / LOW]`). The cone WIRING + visual register are verified here.

Screenshot: `probe2-cruise-1995-boresight-cone.png`.

## Probe 3 — Console clean

`list_console_messages` (filter=error,warn):
- 1 [warn] Lit dev-mode (expected boilerplate)
- 0 errors
- 0 Story 3.5-specific warnings — no `THREE.LineSegments` complaints, no EdgesGeometry-empty warnings, no parent-resolution failures.

## Summary

**Story 3.5 AC8 verdict: PASS.**

- BoresightRenderer wired into per-frame loop (after AttitudeApplier, before trajectory/celestial — tick ordering verified by QA gap 8 source-grep).
- `__voyagerDebug.boresightRenderer` published per AC8.
- Cone count = 2 (single-instance contract — AC3).
- Cone parented to SCAN_PLATFORM in active LOD (AC1).
- Material: amber, opacity 0.5, transparent, low-saturation (AC2 visual register).
- Cone scale 0.001 (unit-scale-then-mesh-scale fix — preserves world-space contract while keeping EdgesGeometry numerically stable).
- Console clean.

Local-manifest constraint applies (cone direction follows synthesized cruise attitude, not CK); the CK-aimed-at-Io articulation visual is deferred to the post-CI-bake smoke per the established `[3.4 / LOW]` deferral.
