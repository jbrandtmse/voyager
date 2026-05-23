# Story 5.2 — Friendly-User Prep Note (input for Story 6.5)

**Story:** 5.2 — Choreographed Spacecraft Turn (CK or Synthesized per Coverage)
**Owner of friendly-user session:** Story 6.5 (Epic 6)

## PBD-specific probes for Story 6.5 session protocol

Story 5.2 implements the PBD choreographed turn with mixed coverage: V1 bus quat is CK-driven (the body turn matches `vgr1_super_v2.bc`); the V1 platform quat is synthesized per-substate by the PBD module (no platform CK at 1990-02-14 per `ckbrief-inventory.md:300-301`). The chapter copy acknowledges this ("scan-platform aim shown here is reconstructed from ephemeris constraints; the body turn is from the historical CK"); the indicator continues to render "ATT CK reconstructed" (bus provenance).

**Probes Story 6.5 should ask the friendly user:**

1. **J1 differentiator:** Did the user notice the spacecraft physically turning? Did they read it as choreography (the camera being aimed) rather than spectacle?
2. **Mixed-coverage honesty:** When prompted about provenance, did they distinguish the historical body turn from the reconstructed platform aim? Did the chapter copy land?
3. **Per-target recognition:** Can they identify which planet the platform is aimed at during each `sweeping_<body>` substate?
4. **Reduced motion:** For users with `prefers-reduced-motion: reduce`, does the instant-cut variant still communicate the choreography?
