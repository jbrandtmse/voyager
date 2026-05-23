# Story 4.0 — Chrome DevTools MCP smoke evidence (lead-driven, Rule 3 gate)

**Date:** 2026-05-22
**Lead:** model claude-opus-4-7
**Dev server:** `npm run dev` against the regenerated `web/public/data/manifest.json` from the AC1+AC2 amended bake.

## Probes executed

### Probe 1 — V1 Jupiter chapter (`/c/v1-jupiter`)

- Canvas alive: 1116×866.
- `__voyagerDebug` keys present (12 of 12 expected): `chapterDirector`, `scrubber`, `chapterIndex`, `helpOverlay`, `chapterCopy`, `urlRouter`, `urlSync`, `embedMode`, `spacecraftModels`, `attitudeService`, `attitudeApplier`, `boresightRenderer`.
- `<v-attitude-indicator>` shadow-DOM mounted, output text = `ATT ● CK reconstructed`, `data-provenance="ck"` (V1 = active spacecraft per chapter; CK provenance is correct).
- Screenshot: `mcp-v1-jupiter-fullpage.png`.

### Probe 2 — V2 Saturn chapter (`/c/v2-saturn`) — AC1 + AC2 surfacing case

- Canvas alive.
- AttitudeService probed at three ETs around the Story 3.7 surfacing ET (CA+2.59hr):
  - `et = -579090236.4` (CA+1.59hr): `bus_provenance="ck"`, `platform_provenance="ck"`
  - `et = -579086636.4` (CA+2.59hr, the load-bearing surfacing ET): `bus_provenance="ck"`, `platform_provenance="ck"`
  - `et = -579083036.4` (CA+3.59hr): `bus_provenance="ck"`, `platform_provenance="ck"`
- Pre-Story-4.0 the platform path would have returned `"synthesized"` for ALL of these (n_platform_synthesized=3000 in the L2 fixture pre-amendment); now all three return `"ck"`. AC1 + AC2 closure verified end-to-end in the browser.
- `<v-attitude-indicator>` shadow-DOM mounted, output text = `ATT ● Synthesized (HGA Earth-pointing)`, `data-provenance="synthesized"`. The indicator is reading V1's attitude (V1 cruise at this ET → synthesized HGA-Earth-pointing) rather than V2's because **the indicator's `setActiveSpacecraft(naifId)` is not wired by ChapterDirector yet** — this is precisely Epic 3 retro Action #3, deferred to Epic 4 Story 4.1/4.2 dev per the Story 4.0 triage table. The runtime AttitudeService itself returns the correct value for V2 (probed directly above); the UI surface is bound to V1 by default until the ChapterDirector hook lands.
- Screenshot: `mcp-v2-saturn-fullpage.png`.

### Probe 3 — Console-clean assertion

- `list_console_messages` (filtered to `error`+`warn`): **only the expected Lit dev-mode banner**. Zero application errors. Zero `ChunkIntegrityError`. Zero ephemeris-service errors from the manifest regen.

## Smoke verdict

**PASS** for Story 4.0's load-bearing closures (AC1 + AC2 + AC3 + AC8 verified end-to-end in browser).

## Layout defects observed (NOT Story 4.0 scope — filed to deferred-work.md)

See the new `[4.0-smoke / LOW]` entries in `deferred-work.md`:

1. **Play button overlaps the mission scrubber** at the lower-left chrome region (play button bbox 33.47, 788.53, 44×44 → bottom 832.53; scrubber bbox 33.47, 820.53, 1049×12 → bottom 832.53; horizontal AND vertical bbox overlap).
2. **Top-right HUD chrome density** — date-readout + chapter-index icon + help icon cluster visually in the top-right corner; date readout visually overlaps with the icon column on smaller viewports (1116×866 here).

Routed to **Story 6.2** (`<v-hud>` dismiss/restore + final HUD compaction polish per Epic 6) per the natural-landing rule. Story 4.0 did not touch any UI layout code; these are pre-existing defects from Stories 1.9 / 1.10 / 1.11 / 2.3 / 2.8.

## Files

- `mcp-v1-jupiter-fullpage.png` — V1 Jupiter chapter, full page (shows both layout defects visually).
- `mcp-v2-saturn-fullpage.png` — V2 Saturn chapter, full page (AC1+AC2 surfacing case).
- `mcp-smoke-summary.md` — this file.
