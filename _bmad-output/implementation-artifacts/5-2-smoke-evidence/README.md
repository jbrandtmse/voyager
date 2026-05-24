# Story 5.2 AC9 — PBD Choreographed Turn Production Smoke Evidence

_Captured 2026-05-24 by Chrome DevTools MCP against the production build (`web/dist/` served via `vite preview --port 4173`)._

## Context

Story 5.2 introduces the per-substate platform-quaternion override for the PBD module. AC9 is the lead-driven Chrome DevTools MCP smoke verifying the production-build PBD chain remains intact under the new override-injection topology.

## Smoke result

**PASS** — production build stable; deep-link substate navigation works; DOM-visible PBD state remains correct across substate ETs; console clean.

### Verified invariants

| Probe | Expected | Observed | Pass |
|---|---|---|---|
| URL `/c/pale-blue-dot/` cold-load | Settles into PBD chapter | URL = `/c/pale-blue-dot/`, title `Pale Blue Dot` | ✅ |
| Attitude indicator label (AC6 Option B) | `ATT CK reconstructed` | `ATT ● CK reconstructed` | ✅ |
| Chapter copy contains reconstruction language | true | true (`/reconstruct\|synthes/i.test(body) === true`) | ✅ |
| Chapter copy word count | [80, 120] | 118 | ✅ |
| `__voyagerDebug` absent in production (DEV-gate discipline) | true | true | ✅ |
| Deep-link to `?t=1990-02-14T00:01:00Z` (60s after anchor, mid-`turning`) | HUD date = `1990-02-14 00:01` | `1990-02-14 00:01` | ✅ |
| Deep-link to `?t=1990-02-14T00:01:15Z` (75s after anchor, mid-`sweeping_<body>`) | HUD date = `1990-02-14 00:01` | `1990-02-14 00:01` | ✅ |
| Console errors / warnings across all substate ETs probed | none | none | ✅ |

### Screenshots

- `pbd-cold-load-idle.png` — initial PBD load at the anchor ET (substate = `idle`).
- `pbd-substate-sweeping-venus-60s.png` — deep-link to anchor + 60s (within `turning`/`sweeping_venus` per the 180s cinematic arc).
- `pbd-substate-sweeping-earth-75s.png` — deep-link to anchor + 75s (within `sweeping_earth` per the cinematic arc).

### What the smoke validates

The production build:

1. Loads PBD correctly on cold-navigation.
2. Routes deep-link URLs with sub-anchor ET offsets correctly through `URLRouter` → `ClockManager` → `ChapterDirector` → PBD module → `AttitudeApplier` chain.
3. Renders the AC6 Option B attitude indicator label consistently across substates (`ATT CK reconstructed` — bus provenance accurately reflects the user-visible body turn).
4. Renders the AC4 chapter copy with reconstruction acknowledgement, satisfying the AC6 Option B contract (the chapter copy is the venue for the platform-synthesis caveat).
5. Survives the new override-injection wiring without console errors or runtime crashes (the AttitudeApplier override-first check operates correctly when the PBD module returns `null` outside sweeping substates and when it returns a quaternion inside sweeping substates).

### What the smoke does NOT validate (deferred to other gates)

The visual difference between substates is NOT observable in this smoke at the world-origin camera viewport — V1's mesh is sub-pixel at 40 AU from the Sun, and the camera framing during PBD remains at the cruise default (per the Story 5.2 "Out of Scope" — Story 5.X follow-up for PBD-specific camera framing). The per-substate platform-quaternion override semantic correctness is verified at:

- **Unit test tier** (`web/src/chapters/pale-blue-dot/turn-choreography.test.ts`): aim math direction (BUS-frame vs J2000), SLERP between substates, reduced-motion path.
- **Integration test tier** (`web/tests/pale-blue-dot-turn-integration.test.ts`): real-stack ChapterDirector + main.ts subscriber + AttitudeApplier override-first check at 1×/10×/100× simulation speeds.
- **Lifecycle integration tier** (`web/tests/pale-blue-dot-override-lifecycle.test.ts`): override deactivation on substate-exit, chapter-exit, V2 isolation, idempotency.
- **Story 5.4 L4 Playwright visual regression** (forthcoming) will add the per-substate pixel-diff coverage — that's the canonical smoke for "did the scene visually change in the way it should between substates."

The lead-driven Chrome DevTools MCP smoke here is the production-build integrity gate (Rule 3): the new override-injection topology doesn't break the chain. The integration test pyramid is the per-substate-correctness gate.

## Console messages

Zero error or warning messages across all probed substate ETs. The override-injection mechanism does not surface any runtime warnings; the AttitudeApplier null-fall-through to AttitudeService.getPlatformQuat works cleanly.
