---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - _bmad-output/planning-artifacts/product-brief-Voyager.md
  - _bmad-output/planning-artifacts/product-brief-Voyager-distillate.md
  - _bmad-output/planning-artifacts/research/initial-research.md
  - _bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md
  - _bmad-output/planning-artifacts/ux-design-directions.html
---

# Voyager - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Voyager, decomposing the requirements from the PRD, UX Design Specification, and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

**Time Navigation & Timeline (PRD §Functional Requirements):**

- FR1: User can scrub the simulation to any point in time between 1977-08-20 (V2 launch) and 2030-12-31 (end of projected trajectory window).
- FR2: User can play, pause, and resume the simulation.
- FR3: User can set simulation playback speed across the range 1× real-time to 1,000,000× real-time.
- FR4: User can jump directly to any of the mission's eleven named chapters (V1 launch, V2 launch, V1 Jupiter, V2 Jupiter, V1 Saturn, V2 Saturn, V2 Uranus, V2 Neptune, Pale Blue Dot, V1 heliopause, V2 heliopause).
- FR5: User can see chapter markers positioned along the timeline scrubber at the correct historical timestamps.
- FR6: User can return to mission start or mission end with a single action.
- FR7: System auto-adjusts playback speed downward when asset chunks are still loading, preventing main-thread starvation; restores the user's chosen speed once loading completes.

**Spacecraft, Trajectories & Bodies:**

- FR8: User can see Voyager 1 and Voyager 2 as distinct, identifiable spacecraft throughout the simulation.
- FR9: User can see each spacecraft's full historical trajectory from launch through the current simulation timestamp.
- FR10: User can see each spacecraft's future trajectory from the current simulation timestamp through 2030, visually distinguished from the historical (past) trajectory.
- FR11: User can see the gravity-assist trajectory bends at each gas-giant encounter rendered with sufficient accuracy that the physical mechanism (the planet pulling and redirecting the spacecraft) is visually apparent.
- FR12: User can see Voyager 2's post-Neptune trajectory bend sharply south of the ecliptic plane (the Triton flyby effect).
- FR13: User can zoom from a system-scale view (heliopause distance, ~165 AU) down to a sub-meter inspection of either spacecraft without visual instability (jitter, z-fighting, or flickering).
- FR14: User can see celestial bodies (Sun, planets, key moons) rendered at correct positions for the current simulation timestamp using SPICE-derived ephemerides.

**Attitude Reconstruction (the differentiator):**

- FR15: User can see each spacecraft's body and scan-platform orientation reconstructed from CK kernel data during encounter windows.
- FR16: User can see the scan platform physically articulate during encounters as the historical instrument pointing changes.
- FR17: User can see a narrow-angle camera boresight cone driven by the reconstructed attitude data, showing what the instrument was pointed at moment-to-moment.
- FR18: User can see synthesized Earth-pointing high-gain-antenna attitude during cruise periods where CK kernel data is unavailable.
- FR19: User can see, at all times, a clear UI indicator distinguishing CK-derived attitude from synthesized attitude.
- FR20: System does not render attitude as smoothly interpolated through quaternion sign-flip discontinuities — articulation must remain visually stable across CK sample boundaries.

**Encounter Chapters:**

- FR21: User can experience the V1 Jupiter encounter (1979-03-05) with body-centered camera framing and CK-driven instrument articulation.
- FR22: User can experience the V2 Jupiter encounter (1979-07-09) with body-centered camera framing and CK-driven instrument articulation.
- FR23: User can experience the V1 Saturn encounter (1980-11-12), including the Titan close flyby that slingshots V1 out of the ecliptic.
- FR24: User can experience the V2 Saturn encounter (1981-08-26), including Iapetus, Hyperion, and Titan flybys.
- FR25: User can experience the V2 Uranus encounter (1986-01-24), including the Miranda close flyby.
- FR26: User can experience the V2 Neptune encounter (1989-08-25), including the Triton flyby that bends the trajectory south of the ecliptic.
- FR27: User can experience the Pale Blue Dot chapter (1990-02-14), during which V1 physically turns toward the inner solar system and the narrow-angle camera frustum sweeps Venus, Earth, Jupiter, Saturn, Uranus, and Neptune in their historical sequence.
- FR28: User can see original NASA photo plates composite into the Pale Blue Dot scene at the corresponding instants of capture.
- FR29: User can see chapter cards marking V1's heliopause crossing (2012-08-25) and V2's heliopause crossing (2018-11-05) with explanatory text describing the cosmic-ray and solar-wind signatures.
- FR30: User can see chapter-specific copy displayed alongside the simulation explaining what is happening in the current chapter.

**Camera & HUD:**

- FR31: User can see the camera smoothly transition between heliocentric (solar-system-scale) and body-centered (planet-scale) view frames as the simulation enters and exits encounter windows.
- FR32: User can manually orbit, pan, and zoom the camera at any time, overriding the default camera framing.
- FR33: User can return to default camera framing with a single action after manual camera control.
- FR34: User can see a HUD overlay displaying the current simulation date in UT, the active spacecraft's distance from the Sun in AU, the current chapter title, and the current speed multiplier.
- FR35: User can see, in the HUD, which scientific instruments are currently active versus shut off for each spacecraft, reflecting the historical instrument shutoff schedule (ISS, UVS, PLS, LECP).
- FR36: User can dismiss or restore the HUD overlay (e.g., for unobstructed viewing or screenshot capture).

**Deep-Linking, Sharing & Embed:**

- FR37: User can share a URL that links to any specific chapter, and recipients opening that URL land at the chapter's anchor timestamp.
- FR38: User can share a URL that encodes a specific timestamp, and recipients opening that URL land paused at that exact moment.
- FR39: User can preview the destination scene of any chapter URL via a pre-rendered Open Graph card when the link is pasted into messaging apps, social platforms, or other Open-Graph-aware contexts.
- FR40: Curator can append `?embed=true` (or equivalent) to any URL to render the artifact chrome-less for iframe embedding or kiosk display.
- FR41: System preserves URL contract stability across releases so that chapter URLs created by curators or shared by users remain valid as the product evolves.
- FR42: User can copy the current URL to share at any moment without explicit "share this" affordances getting in the way (URL is always current in the browser's address bar).

**Audio, Accessibility & Attribution:**

- FR43: User can toggle the Voyager Golden Record audio layer on or off; it is off by default.
- FR44: User can hear Golden Record audio gently activate at chapter markers (launch, Pale Blue Dot, heliopause crossings) when the audio layer is enabled.
- FR45: User can operate all primary controls (play/pause, scrub, chapter jump, speed change, audio toggle) via keyboard alone.
- FR46: User can experience reduced-motion mode when their browser's `prefers-reduced-motion` setting is set to reduce; camera transitions become instant cuts and scrubber animation becomes instantaneous, while the simulation itself continues to play.
- FR47: User can navigate to an About / Methodology page that explains the SPICE data sources, the CK-vs-synthesis distinction, the validation tolerances, and links to underlying technical documentation.
- FR48: User can find attribution for every third-party data source and asset (NAIF, PDS Rings Node, USGS, Björn Jónsson, NASA 3D Resources, NASA Photojournal) in a discoverable location.
- FR49: System renders all interface text at WCAG 2.2 AA color-contrast ratios and does not encode any meaning by color alone (chapter markers, trajectory styling, HUD indicators use shape, position, or pattern in addition to color).
- FR50: System does not collect personally identifiable data, set tracking cookies, or include third-party analytics that would require user consent banners.

**Build, Deploy & Maintenance (Operational):**

- FR51: Maintainer can rebuild the entire trajectory and attitude binary asset set from pinned NAIF kernels via a documented build pipeline.
- FR52: System verifies SHA-256 hashes of every kernel against a manifest at build time and fails the build on any mismatch.
- FR53: Maintainer can trigger a kernel-drift report comparing the current kernel set against the prior pinned baseline, producing a max-position-drift and RMS-drift summary plus a coverage delta.
- FR54: System rejects a kernel update if max position drift exceeds the configured acceptance threshold (default: 5 km).
- FR55: Maintainer can run the 6-layer validation harness (L1 Python interpolation validation; L2 JS-vs-SPICE consistency; L3 TypeScript unit tests; L4 Playwright visual regression; L5 Playwright E2E mission-timeline assertion) as CI gates blocking on any failure.
- FR56: System deploys the static artifact bundle to a global CDN with content-hashed immutable asset filenames and long-lived cache headers on green CI.
- FR57: System falls back to a friendly browser-unsupported page when the visitor's browser lacks WebGL2, WebAssembly, or other required platform capabilities, rather than attempting to render a degraded simulation.
- FR58: Maintainer can roll back a deployment by redeploying a prior content-hashed bundle via the CDN provider's standard deployment surface.

### NonFunctional Requirements

**Performance:**

- NFR-P1: Sustained rendering frame rate 60 FPS at 1280×720+, measured on a mid-range laptop (2024-or-newer integrated GPU; Intel Iris Xe, AMD Radeon Graphics, Apple M-series base, or equivalent).
- NFR-P2: Frame-time distribution P95 ≤ 16.7 ms/frame; P99 ≤ 22 ms/frame; no individual frame > 50 ms during any chapter scene (first three post-load frames excluded).
- NFR-P3: Time-to-interactive ≤ 3 seconds on a 25 Mbps broadband connection from cold cache, measured by Lighthouse on the homepage URL.
- NFR-P4: First-paint asset bundle size ≤ 35 MB compressed (Brotli).
- NFR-P5: Full asset bundle size (including Golden Record audio, all 8k texture upgrades, all trajectory and attitude chunks) ≤ 150 MB compressed (Brotli).
- NFR-P6: Time-warp resilience — at 1,000,000× playback rate, the simulation must scrub the full 1977–2030 mission in ≤ 60 seconds wall-clock time without main-thread starvation or chunk-load stutter; chunk prefetch must begin no later than the last 10% of the currently-playing chunk.
- NFR-P7: Trajectory interpolation cost ≤ 1 ms per frame for 12 bodies (2 spacecraft + Sun + 8 planets + 1 moon) using cubic Hermite. Measured by `/perf` route harness.
- NFR-P8: Rendering precision — zero z-fighting and zero positional jitter visible at any zoom level between sub-meter spacecraft inspection and 165 AU far-plane view. Validated by Playwright visual regression at extreme zoom states.
- NFR-P9: Trajectory accuracy — max position error ≤ 20 km, RMS error ≤ 5 km vs dense SPICE reference across the full 1977–2030 mission window. Gated by Layer-1 Python validation harness.
- NFR-P10: Attitude accuracy ≤ 1 milliradian (≤ 0.05°, ≤ 100 NA-pixel error) vs source CK quaternions during encounter windows. Gated by Layer-2 JS-vs-SPICE consistency tests.

**Reliability:**

- NFR-R1: Deployment availability target ≥ 99.9% measured monthly (CDN provider SLA — Cloudflare Pages / Vercel).
- NFR-R2: Asset durability — all asset URLs are content-hashed and immutable; a given asset URL must continue to resolve indefinitely after the deployment that produced it.
- NFR-R3: Recovery time from a bad deploy ≤ 5 minutes from rollback trigger to prior-version visitor service, via CDN provider's standard rollback surface.
- NFR-R4: Build determinism — given identical pinned kernels and identical source-code commit, the Python bake step produces byte-identical trajectory and attitude binary outputs; CI verifies this on every PR.
- NFR-R5: Browser session integrity — a sustained user session of ≥ 30 minutes does not accumulate WebGL resource leaks that degrade frame rate by more than 5%.

**Security:**

- NFR-S1: Transport — all assets and HTML served over HTTPS (TLS 1.2+, with TLS 1.3 preferred); HTTP redirects to HTTPS.
- NFR-S2: Content Security Policy — strict CSP header restricts script sources to `'self'` plus any explicitly-allowed asset CDN; disallows `eval` and inline scripts (with hashes for genuinely-needed inline boot script); disallows mixed content.
- NFR-S3: Subresource Integrity (SRI) — any third-party JavaScript loaded from external CDNs must carry SRI hashes (none planned in v1).
- NFR-S4: Kernel integrity — every NAIF kernel SHA-256 verified at build time against the pinned manifest; mismatch fails the build (FR52).
- NFR-S5: Asset supply-chain integrity — all third-party assets (3D models, textures, audio) hash-pinned at build time; asset-hash mismatch fails the build.
- NFR-S6: Dependency supply chain — `npm/pnpm audit` and `uv` advisory checks run on every CI build; high-severity advisories block deploy until remediated.
- NFR-S7: No execution of untrusted user-supplied input — URL parameters (`?t=`, `?embed=`) are parsed as strict typed values with rejection of malformed input; no string substitution into DOM, no template evaluation.
- NFR-S8: Privacy posture — no PII collection, no tracking cookies, no third-party analytics, no fingerprinting libraries (FR50).
- NFR-S9: Subresource isolation — the artifact does not load any cross-origin resources at runtime that aren't from the artifact's own CDN domain or an explicitly-allowed pinned source.

**Scalability:**

- NFR-Sc1: The artifact scales to arbitrary concurrent visitor counts at constant per-visitor cost because all delivery is via static CDN with no origin-side computation.

**Accessibility:**

- NFR-A1: WCAG 2.2 AA conformance for all interface text and interactive controls; validated by axe-core in CI plus manual review.
- NFR-A2: Color-contrast ratios ≥ 4.5:1 for body text; ≥ 3:1 for large text and graphical UI components (FR49).
- NFR-A3: Keyboard reachability — every interactive control (play/pause, scrub, chapter jump, speed, audio toggle, manual camera, HUD toggle, About link) is operable via keyboard alone; tab order follows visual reading order (FR45).
- NFR-A4: Visible focus indication — all keyboard-focusable elements have a focus indicator with ≥ 3:1 contrast against background, persisting until focus moves.
- NFR-A5: Reduced-motion support — `prefers-reduced-motion: reduce` collapses transitions to instant cuts; simulation playback continues (FR46).
- NFR-A6: No photosensitive-epilepsy hazards — no content flashes more than 3 times per second; no large-area high-contrast strobing.
- NFR-A7: Semantic markup — navigation surfaces use semantic HTML (`<nav>`, `<button>`, headings in hierarchical order) and ARIA labels where the visual affordance has no equivalent semantic element.
- NFR-A8: Screen-reader floor — page `<title>` updates announce chapter changes; primary controls expose `aria-label` and `aria-pressed`/`aria-expanded` state; the About page is fully accessible as text content.

**Compatibility:**

- NFR-C1: Browser support Tier 1 (fully polished) — latest two stable versions of Chrome, Firefox, Safari on desktop; Edge inherits from Chrome.
- NFR-C2: Browser support Tier 2 (functional but not polished) — latest two stable versions of Chrome and Safari on tablet (iPadOS, ChromeOS).
- NFR-C3: Browser support Tier 3 (best-effort) — latest two stable versions of mobile Chrome and Safari on phone.
- NFR-C4: Required platform capabilities (boot-time feature-detected, with fallback page if missing) — WebGL2, WebAssembly, Brotli decoding, `requestAnimationFrame`, History API, ResizeObserver.
- NFR-C5: GPU capability fallback — if reverse-Z depth is unstable on the visitor's GPU (detected at boot), fall back transparently to logarithmic depth buffer.
- NFR-C6: Texture-tier fallback — if device GPU memory is insufficient for 8k planet textures, fall back to 4k textures with no lazy upgrade.
- NFR-C7: Older / unsupported browsers — render a single-frame fallback page explaining the browser requirement; do not attempt a degraded simulation (FR57).

**Maintainability:**

- NFR-M1: Code documentation — every architectural decision documented in the technical research's "Rejected Technical Ideas" inventory has a corresponding ADR explaining rationale and rejected alternatives.
- NFR-M2: Kernel-update operational flow — a maintainer can complete a kernel update (manifest, drift report review, CI run, deploy) in ≤ 30 minutes of attention time.
- NFR-M3: Mission-fact provenance — every pinned timestamp, encounter date, closest-approach distance, and instrument-shutoff date is traceable to a primary mission documentation source via inline code comments or a `MISSION_FACTS.md` reference.
- NFR-M4: Test execution time — full L1+L2+L3 test suite completes in ≤ 5 minutes on a standard CI runner; L4+L5 suite completes in ≤ 15 minutes.
- NFR-M5: Build pipeline observability — every CI build produces a build manifest (asset sizes, kernel hashes, validation tolerances, frame-budget summary) attached to the PR or build record.
- NFR-M6: No accumulating tech debt during multi-year maintenance — dependency advisory checks, drift report flow, and ADR discipline collectively make the artifact maintainable without continuous engineering attention.

### Additional Requirements

**Architecture-derived (Architecture.md §Starter Template Evaluation, §Core Architectural Decisions, §Implementation Patterns):**

- AR1 (Starter Template — Epic 1 Story 1): Project is initialized as a **monorepo with two halves**: `web/` (Vite `vanilla-ts` template) and `bake/` (`uv init`). Initial scaffold commands: `npm create vite@latest web -- --template vanilla-ts` and `uv init bake` at repo root. No additional starter templates beyond these.
- AR2: **Lit 3+** (~6 KB gzipped) is the Web Components ergonomics layer; the design system is otherwise bespoke (no Material/Ant/Chakra/Radix/Tailwind UI/shadcn). `focus-trap` (~3 KB) + `tabbable` (~2 KB) are the only third-party a11y micro-libraries.
- AR3: Render-space scale layering — SCALE=1 (km in render-space), branded type layering for unit safety; reverse-Z native Three.js API (≥r170) with a boot-time `GPUCapabilityProbe`; logarithmic-depth fallback per NFR-C5.
- AR4: Floating-origin rendering via single `WorldGroup` whose position equals `-cameraWorldPos / SCALE` per frame.
- AR5: Trajectory & attitude data are precomputed offline via **SpiceyPy build-time bake** producing a custom binary format (`VTRJ` — 40-byte header + Float64Array body + brotli compression); chunked per-decade at daily cadence with hourly/minute/10-second cadence refinements during encounter windows.
- AR6: Asset manifest schema — JSON at `bake/out/manifest.json` (generated by bake) copied to `web/public/manifest.json` for runtime fetch; chunking is one VTRJ file per `(body × time-window × kind)` where kind ∈ {`trajectory`, `bus_attitude`, `platform_attitude`}.
- AR7: Drift report tool at `bake/src/drift_report.py` — inputs prior baseline manifest + new bake manifest; deterministic ET grid sampling; markdown output attached to PR; CI auto-fails if `max_drift_km > 5` (FR54).
- AR8: Bake determinism (NFR-R4) — CI runs bake twice on identical inputs and asserts output binary SHAs match; pins Python patch version (`.python-version`), `SpiceyPy==8.1.0` (exact), `uv.lock` committed; CI runs only on linux/amd64.
- AR9: Kernel acquisition strategy — Git LFS for storage of NAIF kernels; automated tool (`just fetch-kernels`) for first-time population from NAIF + PDS Rings Node mirrors; hash-pinned `kernels/kernels-manifest.json`.
- AR10: Chapter system — declarative spec for 10 chapters + dedicated module for Pale Blue Dot (PBD); per-chapter lifecycle states `out → entering → held → exiting → passed` driven by `ChapterDirector.update(et)`; PBD extends with internal substates `turning`, `sweeping_<body>`, `composite_active`, `composite_decay`.
- AR11: View-frame blend mechanics — translation-only smoothstep blend over ±2-day window between heliocentric and body-centered frames; no quaternion rotation blend in v1 (deferred to v1.1 only if Jupiter's tilt feels off in playtesting).
- AR12: Chapter copy authorship — hand-written TypeScript string literals (backtick template literals) inside each chapter spec; single-source-of-truth; markdown subset rendered by `<v-chapter-copy>` (italics + line breaks only).
- AR13: Mission-phase FSM is a separate concern from the chapter system; tracks SOI entry/exit, instrument shutoff schedule, and asset-tier upgrades (4k → 8k textures on encounter entry).
- AR14: URL contract — timestamp format ISO-8601 UTC (`?t=1989-08-25T09:23:00Z`); URL writeback via `history.replaceState` (throttled 250ms during scrub) to avoid history pollution; `pushState` only on chapter selection. Boot-time deep-link parse initializes the simulation paused at the requested instant.
- AR15: Embed-mode mechanics — `?embed=true` is a strict-boolean parse (only literal `true` counts); `EmbedModeState` read at boot and immutable for the session; every chrome Web Component reads it via constructor injection (site logo, share button, footer, chapter-index button, About link, methodology link).
- AR16: OG card generation pipeline — Playwright headless against the built site; per-chapter pre-rendered images committed/published as static assets.
- AR17: Browser-unsupported fallback (FR57, NFR-C7) — a 1-KB inline pre-bootstrap script in `index.html` probes WebGL2 + WebAssembly + Brotli; if any missing, `window.location.replace('/unsupported.html')` (static, no JS dependency).
- AR18: CI on GitHub Actions, `ubuntu-22.04` runner; native Git LFS; matches linux/amd64 platform pinning. Single workflow, sequential by data dependency: lint/type → unit (L3) → bake → bake-determinism check → JS-vs-SPICE (L2) → Python validation (L1) → build → visual regression (L4) → E2E (L5) → deploy gate.
- AR19: Drift report flow — path-filtered workflow on PRs touching `kernels/kernels-manifest.json`; runs `just drift-report --baseline=$BASE_SHA --current=HEAD` and posts markdown comment (FR53).
- AR20: Deploy gates (FR55, FR56, FR58) — green CI deploys to CDN (Cloudflare Pages or Vercel — ADR 0016 authored in Phase 0). Content-hashed immutable filenames with `Cache-Control: public, max-age=31536000, immutable`. HTML/entry JS use 1-hour TTL.
- AR21: Analytics-zero hard commitment (FR50, NFR-S8) — no analytics, no cookies, no pixel tracking, no third-party scripts of any kind.
- AR22: Error capture — localStorage-only (no remote telemetry).
- AR23: Build-manifest observability (NFR-M5) — every CI build emits `build-manifest.json` as a workflow artifact (asset sizes, kernel hashes, validation tolerances, frame-budget summary).
- AR24: Dev `/perf` route (NFR-P7, NFR-P2 measurement) — separate Vite entry point that loads the simulation in a measurement harness with Performance API instrumentation.
- AR25: Chrome-DevTools MCP is the canonical agent-time tool for manual UI verification; Playwright is the canonical CI tool for visual regression + E2E (ADR `0010-mcp-vs-playwright.md`).
- AR26: Architectural Decision Records (ADRs) — MADR format; stored at `docs/adr/NNNN-kebab-case-title.md`; index at `docs/adr/README.md` auto-generated by `just adr-index`; **25-entry initial ADR catalogue authored as Phase 0 work** (before substantive code), including ADR 0016 for CDN provider selection.
- AR27: Toolchain pinning — Python 3.13 (exact patch in `.python-version`); SpiceyPy `==8.1.0`; `uv.lock` committed; Three.js ≥r170 pinned via `package-lock.json`; TypeScript strict; Vitest for unit tests; Playwright for visual + E2E; gltf-transform + toktx + Blender headless for asset pipeline (added in Phase 0).
- AR28: Phase 0 work (precedes substantive code) — `ckbrief` inventory of NAIF + PDS Rings Node CK products; full kernel acquisition + hash pinning; 25-entry ADR catalogue; asset-pipeline tooling installed; FK frame IDs and rotation values for boresight cone hardcoded after inspection.

### UX Design Requirements

**Design Tokens & Visual System (UX §Design System Foundation, §Visual Design Foundation):**

- UX-DR1: Implement a single root-scope **design token sheet** (CSS custom properties) as the single source of truth for color, typography, spacing, motion, layout, and z-index. Components consume tokens via `var()`; no component hard-codes any visual value. Tokens defined in `src/styles/tokens.css`; critical token CSS inlined in `index.html` for first-paint correctness.
- UX-DR2: Implement the **deep-space color palette** (low-saturation, high-contrast) with verified WCAG 2.2 AA ratios for all combinations actually used. Required tokens: `--v-color-bg #0a0e14`, `--v-color-fg #e8eaed`, `--v-color-fg-muted #9aa0a6`, `--v-color-fg-quiet #5f6368`, `--v-color-accent #d4a017`, `--v-color-accent-quiet #8a6a0e`, `--v-color-trajectory-past`, `--v-color-trajectory-future`, `--v-color-ck #4a7c4e`, `--v-color-synth #d4a017`, `--v-color-focus #6b8cae`, `--v-color-overlay-scrim`, `--v-color-divider`. Forbid "error/warning/success" colors and gradients.
- UX-DR3: Implement the **three-voice typography system** with self-hosted woff2 fonts (latin subset): JetBrains Mono (mono — HUD values, dates, distances, speed); Source Serif 4 variable 350–600 (serif — chapter copy, About body); Inter variable 400–700 (sans — chapter titles, chapter index, About headings). Total typography asset budget ≤ 120 KB compressed. `font-display: swap` on all `@font-face`. Preload critical weights for first paint. `font-variant-numeric: tabular-nums` on all numeric content.
- UX-DR4: Implement the **type scale** as `clamp(min, vw-anchor, max)` fluid sizing per the documented token map (12 size tokens from `--v-size-hud-mono-sm` through `--v-size-title-card`). No h4/h5/h6 sizes — three levels of heading hierarchy max.
- UX-DR5: Implement the **spacing scale** as discrete steps on a 4-px base (`--v-space-px` through `--v-space-24`). Spacing snaps between tiers, does not fluidly reflow. The viewport-edge margin token `--v-edge-margin` is the exception (interpolates via `clamp(16px, 3vw, 64px)`).
- UX-DR6: Implement the **motion foundation** with three duration tokens (`--v-duration-fast 120ms`, `--v-duration-base 200ms`, `--v-duration-slow 400ms`) and two easings (`--v-ease-out`, `--v-ease-in-out`). No spring/bounce/overshoot. `prefers-reduced-motion: reduce` media query at `:root` collapses all duration tokens to `0ms` (single source of truth).
- UX-DR7: Implement a **flat semantic z-index hierarchy** with six discrete tokens: `--v-z-canvas`, `--v-z-hud`, `--v-z-scrubber`, `--v-z-chapter-copy`, `--v-z-overlay`, `--v-z-fallback`. No arbitrary z-index numbers anywhere in the codebase.

**Web Components Inventory (UX §Component Strategy — full v1 inventory of 15+ components):**

- UX-DR8: Implement `<v-timeline-scrubber>` — primary control surface; mission variant (always visible, full 1977–2030, chapter markers as vertebrae) and detail variant (contextual, slides in within ±5 days of an encounter or on chapter-marker pause). Both are the same component configured by `range-start`, `range-end`, `markers`, `variant` attributes. WAI-ARIA Slider pattern with `role="slider"`, `aria-valuemin/max/now/valuetext`. Keyboard `←/→` step (unit per speed), `Shift+←/→` 10 steps, `Home/End` bounds. Chapter markers are individually tab-focusable with `aria-label`.
- UX-DR9: Implement `<v-hud>` container + the **HUD sub-components**: `<v-hud-date>` (ISO-8601 UT, tabular-nums mono), `<v-hud-distance>` (per-spacecraft AU readout), `<v-hud-chapter-title>` (sans caps, fades 400ms on chapter change), `<v-hud-speed>` (multiplier + human-friendly description e.g. "10,000× — 1 min/sec"), `<v-hud-instruments>` (per-spacecraft ISS · UVS · PLS · LECP legend with strikethrough on shutoff dates). HUD has Standard and Embed variants; embed variant renders nothing. `aria-live="polite"`; updates throttled to scrub-stop.
- UX-DR10: Implement `<v-attitude-indicator>` — quiet provenance indicator inline with `<v-hud-date>` displaying "ATT CK reconstructed" (green) or "ATT Synthesized (HGA Earth-pointing)" (warm gold). Text + color + dot icon (never color-only). `aria-live="polite"`.
- UX-DR11: Implement `<v-chapter-copy>` — side-anchored editorial panel. Lede (serif weight 400, `--v-size-chapter-copy-lg`) + body (serif weight 350, `--v-size-chapter-copy`, max-width 32ch). Fades in/out over 400ms (`--v-duration-slow`) on chapter window entry/exit. `<article aria-labelledby>`, `aria-live="polite"`, text fully selectable.
- UX-DR12: Implement `<v-play-button>` — native `<button>` with `aria-pressed`; play/pause glyph toggle; `Space` key shortcut.
- UX-DR13: Implement `<v-chapter-index>` — listbox panel of all 11 chapters opened from a top-right `≡` icon. WAI-ARIA Listbox pattern; `↑/↓/Home/End/Enter/Esc` keyboard; focus-trap via `focus-trap` library on open; restores focus to toggle button on close. Scrim with `--v-color-overlay-scrim`; slide-in 200ms (instant under reduced motion).
- UX-DR14: Implement `<v-speed-multiplier>` — log-scale slider 1× to 1,000,000× with discrete-feeling detents at decade boundaries (snap-to-nearest-decade in 5% tolerance band). WAI-ARIA Slider pattern. Keyboard `+/-` per decade-stop, `Shift+/-` 5%, `Home/End` bounds. Live readout below thumb couples multiplier to elapsed-time.
- UX-DR15: Implement `<v-audio-toggle>` — native `<button>` for Golden Record on/off; off by default; preference persists for session via `localStorage`, resets across sessions.
- UX-DR16: Implement `<v-help-overlay>` — modal dialog revealing the full keyboard shortcut inventory; opens via `?` or icon; WAI-ARIA Dialog (Modal) pattern with `focus-trap`; `Esc` closes; focus restored on close.
- UX-DR17: Implement `<v-fallback-page>` — server-rendered static HTML inline in `index.html`; replaces the entire UI when boot-time feature probe (WebGL2 / WebAssembly / Brotli) fails. Three messaging variants by failure mode. Semantic HTML; no JS dependency.
- UX-DR18: Implement `<v-about-page>` — standalone `/about` route; Light DOM; editorial layout (h1 sans 400 large, h2 sans 500, body Source Serif 4 at 60ch). Sections: About the project, Data sources, Validation tolerances, Attribution, Embed contract, Methodology footnote.
- UX-DR19: Implement `<v-attribution-panel>` — `<dl>` of source → license/usage statement (NAIF SPICE, PDS Rings Node, NASA 3D Resources, Björn Jónsson textures, USGS Astrogeology, Voyager Golden Record, NASA Planetary Photojournal). Embedded within About; also linked from a small "Attributions" footer link on the homepage.

**Accessibility Primitives & Patterns (UX §Component Strategy, §Accessibility Strategy):**

- UX-DR20: Implement hand-rolled accessibility primitive helpers in `src/primitives/`: `slider-keyboard.ts` (APG Slider keyboard handler — shared by scrubber + speed multiplier), `listbox-keyboard.ts` (APG Listbox — chapter index), `dialog.ts` (modal pattern wrapping `focus-trap`), `pointer-events.ts` (unified mouse/touch/pen handling). Total a11y-primitive footprint with focus-trap + tabbable ≤ 5 KB.
- UX-DR21: Enforce **`:focus-visible` global rule** (not `:focus`) — 2px `--v-color-focus` outline + 2px offset (4px total) on every keyboard-focusable element; ≥3:1 contrast. Components do not opt out.
- UX-DR22: Enforce **touch target minimums** ≥44×44px (WCAG AAA, exceeding the AA 24×24px floor) on all interactive elements: buttons, scrubber thumb, chapter markers, chapter-index items. Verified via `min-height`/`min-width` on the interactive bounding box.
- UX-DR23: Implement `<button>` semantic correctness — `aria-pressed` for toggle buttons (play, audio, HUD dismiss); `aria-expanded` + `aria-controls` for disclosure (chapter index, help). No `<div role="button">`.
- UX-DR24: Implement screen-reader announcement throttling — all HUD value `aria-live="polite"` regions announce on scrub-stop and chapter change only, not every frame; `aria-live="assertive"` is forbidden in v1.
- UX-DR25: Implement `@media (forced-colors: active)` palette overrides for Windows high-contrast mode; verify all interactive elements remain visible and operable.
- UX-DR26: Implement `@media (prefers-reduced-transparency: reduce)` — overlay scrim becomes fully opaque.
- UX-DR27: Implement the complete **keyboard shortcut inventory** in `<v-help-overlay>`: `Space`, `←/→`, `Shift+←/→`, `Home/End`, `1`–`9` (chapter jump), `M` (chapter menu), `A` (About), `+/-` (speed decade stop), `Shift+/-` (speed 5%), `H` (HUD toggle), `G` (Golden Record), `?` (help), `Esc` (close overlay), `Tab/Shift+Tab`.

**First-Paint, Layout & Responsive (UX §Visual Design Foundation, §Defining Core Experience, §Responsive Design):**

- UX-DR28: Implement the **designed first-paint sequence**: title card "Voyager. 1977 to 2030." holds for two beats (~2 seconds), dissolves into wide shot of Cape Canaveral on 1977-09-05. Title card uses Inter at `--v-size-title-card`. No chrome blockers (no modal, no cookie banner, no signup), no animated logos, no "Powered by" credits.
- UX-DR29: Implement the **canvas-and-edges layout model** (no traditional grid, no multi-column at any viewport): full-viewport 3D canvas; UI floats over canvas anchored to edges (chapter title top-left, HUD top-right, chapter copy right side, mission scrubber bottom-full-width, speed multiplier bottom-right, play button bottom-left, chapter index toggle top-right corner above HUD).
- UX-DR30: Implement **three structural breakpoints only**: `≤767px` (Tier 3 phone best-effort), `768–1023px` (Tier 2 tablet portrait — chapter copy becomes bottom-sheet drawer, HUD compaction with `⋯` reveal), `≥1024px` (Tier 2 tablet landscape + Tier 1 desktop, canonical layout). At ≥1920px, `--v-edge-margin` grows but layout structure does not change.
- UX-DR31: Implement the **dual-scrubber pattern** behavior: detail scrubber slides into view above mission scrubber on encounter window entry (±5 days from closest approach) with 400 ms ease-out (instant under reduced motion); slides out on window exit. Highlight band on mission scrubber visually connects to detail scrubber extent. Mid-drag scrubber transitions never hijack pointer-capture.
- UX-DR32: Implement **invisible-loading discipline** — chunk prefetch is invisible; speed caps at chunk boundary instead of showing a progress UI; subtle 1–2 second wait at boundary timestamp if chunk not ready in time; no spinner. Only fallback if load takes > 500ms is the thumb visibly "waiting" at the boundary timestamp.
- UX-DR33: Implement **past-solid / future-dashed trajectory styling** using `Line2` + `LineMaterial` (from `three/examples/jsm/lines/`) with screen-space width. Per spacecraft: one past-line (solid, `--v-color-trajectory-past`) + one future-line (dashed, `--v-color-trajectory-future`). Geometry updated incrementally as time advances.
- UX-DR34: Implement **chapter markers as first-class navigation affordances** on the mission scrubber — 2×18px vertical pins in `--v-color-fg-muted` (active = `--v-color-accent`); 2–4 character monospace label above each (V1L, V2L, V1J, V2J, V1S, V2S, V2U, V2N, PBD, V1H, V2H); pointer/keyboard focus with tooltip on 200ms hover delay; touch tap = chapter jump.

**Quality Gates & Testing (UX §Accessibility Strategy → Testing Strategy):**

- UX-DR35: Implement **Layer-1 automated accessibility testing** — axe-core runs in CI on every component (default + each interactive state) and on every static page. Zero `critical` or `serious` violations gate the build.
- UX-DR36: Implement **Layer-2 manual accessibility checklist** executed before each Phase milestone and before launch: keyboard-only navigation pass; screen reader testing on VoiceOver/NVDA/TalkBack; color-blindness simulation (deuteranopia, protanopia, tritanopia); forced-colors mode; reduced-motion validation.
- UX-DR37: Implement **Layer-3 real-device responsive testing** before each Phase milestone and launch: Chrome/Firefox/Safari on macOS+Windows+Linux at 1280×720, 1440×900, 1920×1080; real iPad (Safari) + Galaxy Tab (Chrome) landscape+portrait; real iPhone + Pixel best-effort; 4G-throttled connection for first-paint validation.
- UX-DR38: Recruit at least **one assistive-technology user** into the 5–10 friendly-user qualitative test pool (or run a separate accessibility-focused session via an accessibility user-research vendor as a launch-gate cost).

### FR Coverage Map

| FR | Epic | Description |
| --- | --- | --- |
| FR1 | 1 | Scrub between 1977-08-20 and 2030-12-31 |
| FR2 | 1 | Play / pause / resume |
| FR3 | 1 | Speed 1× – 1,000,000× |
| FR4 | 2 | Jump to any of 11 named chapters |
| FR5 | 2 | Chapter markers at correct historical timestamps |
| FR6 | 1 | Return to mission start/end (single action) |
| FR7 | 1 | Auto speed-cap during chunk load |
| FR8 | 1 | V1 & V2 distinct identifiable spacecraft |
| FR9 | 1 | Past trajectory render (solid) |
| FR10 | 1 | Future trajectory (dashed, visually distinguished) |
| FR11 | 4 | Gravity-assist bends visibly accurate |
| FR12 | 4 | V2 post-Neptune south-of-ecliptic bend (Triton effect) |
| FR13 | 1 | Zoom heliopause → sub-meter, no jitter/z-fighting |
| FR14 | 1 | SPICE-positioned celestial bodies |
| FR15 | 3 | CK-reconstructed bus + scan-platform attitude |
| FR16 | 3 | Scan platform physically articulates |
| FR17 | 3 | NA boresight cone driven by CK |
| FR18 | 3 | Synthesized HGA Earth-pointing in cruise |
| FR19 | 3 | UI indicator: CK vs synthesized |
| FR20 | 3 | No quaternion sign-flip discontinuity artifacts |
| FR21 | 4 | V1 Jupiter encounter (1979-03-05) |
| FR22 | 4 | V2 Jupiter encounter (1979-07-09) |
| FR23 | 4 | V1 Saturn encounter (Titan slingshot) |
| FR24 | 4 | V2 Saturn (Iapetus / Hyperion / Titan) |
| FR25 | 4 | V2 Uranus (Miranda) |
| FR26 | 4 | V2 Neptune (Triton) |
| FR27 | 5 | PBD: spacecraft turn + frustum sweep |
| FR28 | 5 | PBD: NASA photo-plate composites |
| FR29 | 2 | Heliopause text cards (V1 2012, V2 2018) |
| FR30 | 2, 4, 5 | Chapter copy (infra E2; content E4/E5) |
| FR31 | 4 | View-frame heliocentric ↔ body-centered |
| FR32 | 4 | Manual camera orbit/pan/zoom |
| FR33 | 4 | Restore default camera framing |
| FR34 | 1 | HUD: date, distance, chapter title, speed |
| FR35 | 2 | HUD: instrument-shutoff schedule per s/c |
| FR36 | 6 | HUD dismissable/restorable |
| FR37 | 2 | Per-chapter URL deep-link |
| FR38 | 2 | Per-timestamp URL deep-link (paused) |
| FR39 | 2 | Pre-rendered Open Graph cards |
| FR40 | 2 | `?embed=true` chrome-less mode |
| FR41 | 2 | URL contract stability across releases |
| FR42 | 1, 2 | URL always current in address bar |
| FR43 | 6 | Golden Record toggle (off by default) |
| FR44 | 6 | Audio activates at chapter markers |
| FR45 | 1, 6 | Keyboard operates all primary controls |
| FR46 | 6 | `prefers-reduced-motion` honored |
| FR47 | 2 | About / Methodology page |
| FR48 | 2, 7 | Attribution UI (E2) + `THIRD_PARTY.md` (E7) |
| FR49 | 1, 6 | WCAG 2.2 AA contrast + non-color encoding |
| FR50 | 1 | No PII / cookies / analytics |
| FR51 | 1, 7 | Bake pipeline rebuild (scaffold E1; full E7) |
| FR52 | 1 | Build-time SHA-256 kernel hash verification |
| FR53 | 7 | Drift report tool |
| FR54 | 7 | `max_drift_km ≤ 5` acceptance gate |
| FR55 | 1, 3, 4, 7 | 6-layer harness (L1/L3 E1; L2 E3; L4 E4; L5 E7) |
| FR56 | 1, 7 | CDN deploy (basic E1; immutable hashes + TTL E7) |
| FR57 | 1 | Browser-unsupported fallback page |
| FR58 | 7 | Rollback via prior content-hashed bundle |

## Epic List

### Epic 1: Foundation & First Vertical Slice (Cruise Viewer)

A visitor lands on the site, sees both Voyager spacecraft moving along their heliocentric trajectories from 1977→2030, scrubs the timeline at any speed, sees the date/distance HUD update, plays/pauses, and can deep-link a timestamp. No encounters or attitude yet — but the cruise is real, the scrubber feels physical, first paint is ≤3s, and the artifact is already a static-CDN-deployed site behind a green CI.

Includes Phase 0 work (NAIF + PDS CK `ckbrief` inventory; kernel acquisition via Git LFS + hash-pinning; 25-entry ADR catalogue scaffolding; asset-pipeline tooling); monorepo init (`web/` vanilla-ts + `bake/` uv); Python bake pipeline (single chunk, both spacecraft) + L1 validation harness; reverse-Z + floating-origin Three.js renderer with GPU probe and log-depth fallback; Lit-based Web Components scaffold with full design-token sheet; mission timeline scrubber; HUD (date, distance, speed); play button; past-solid/future-dashed trajectories; `<v-fallback-page>`; baseline CI (lint/type/L1/L3) + CDN deploy.

**FRs covered:** FR1, FR2, FR3, FR6, FR7, FR8, FR9, FR10, FR13, FR14, FR34, FR42 (URL live in address bar), FR45 (initial keyboard pass), FR49 (palette), FR50, FR51 (scaffold), FR52, FR56 (basic), FR57.

**UX-DRs covered:** UX-DR1–7 (design tokens), UX-DR8 (scrubber mission variant), UX-DR9 (HUD core), UX-DR12 (play button), UX-DR17 (fallback page), UX-DR20–23 (a11y primitives, `:focus-visible`, touch targets, semantic buttons), UX-DR28 (designed first-paint sequence), UX-DR29 (canvas-edges layout), UX-DR30 (breakpoints), UX-DR32 (invisible loading), UX-DR33 (past/future line styling).

---

### Epic 2: Mission Spine — Chapter Navigation, Deep-Linking & Embed

Every chapter is reachable by index, marker click, keyboard `1`–`9`, or deep-link URL; recipients land paused at the exact second; OG cards render correctly in messaging apps; curators can append `?embed=true` to any URL for chrome-less kiosk display; About / Methodology / Attribution pages explain the methodology and credit data sources; the two heliopause crossings appear as text cards.

Includes ChapterDirector FSM + 11 declarative chapter specs (10 standard + PBD placeholder); chapter markers as scrubber vertebrae with labels; `<v-chapter-index>` listbox; URL writeback (`replaceState` throttled, `pushState` on chapter selection); boot-time deep-link parse; `?embed=true` strict-boolean parse + chrome-element gating; pre-rendered OG card pipeline via Playwright headless; `<v-about-page>` + `<v-attribution-panel>` + `<v-help-overlay>`; heliopause text-cards; per-spacecraft instrument-shutoff schedule reflected in `<v-hud-instruments>`.

**FRs covered:** FR4, FR5, FR29, FR30 (infrastructure), FR35, FR37, FR38, FR39, FR40, FR41, FR42 (URL writeback complete), FR47, FR48 (UI surface).

**UX-DRs covered:** UX-DR11 (chapter copy panel infra), UX-DR13 (chapter index), UX-DR16 (help overlay), UX-DR18 (About), UX-DR19 (Attribution), UX-DR27 (keyboard shortcuts complete), UX-DR34 (chapter markers full).

---

### Epic 3: Attitude Reconstruction — the Differentiator

At every moment of the mission, each spacecraft's orientation is reconstructed: CK-driven during encounter windows (sub-milliradian), synthesized Earth-pointing HGA during cruise — with a quiet "ATT CK reconstructed" / "ATT Synthesized" HUD indicator that never lies about the substrate. The scan platform physically articulates and the narrow-angle boresight cone is visible whenever a CK window is in view.

Includes CK kernel bake pipeline for both spacecraft (`vgr1_super_v2.bc`, `vgr2_super_v2.bc`, PDS Rings Node supplements); quaternion sign-flip walk pre-bake to prevent SLERP artifacts; AttitudeService with SLERP interpolation; synthesized HGA Earth-pointing from SPK + FK constraints (`vg1_v02.tf` / `vg2_v02.tf`); articulated scan-platform GLB model with 4-level LOD; NA-camera wireframe boresight cone (FOV 0.42°, half-angle 0.21°); `<v-attitude-indicator>` HUD child; L2 JS-vs-SPICE attitude consistency validation in CI.

**FRs covered:** FR15, FR16, FR17, FR18, FR19, FR20.

**UX-DRs covered:** UX-DR10 (attitude indicator HUD).

---

### Epic 4: Encounter Chapters — All Six Gas-Giant Flybys

A visitor can scrub to any of the six encounters (V1/V2 Jupiter, V1/V2 Saturn, V2 Uranus, V2 Neptune) and experience body-centered cinematic framing, smooth view-frame transitions, accurate gravity-assist bends, hand-written chapter copy, and the detail-scrubber sliding in for fine-grained control. The V2 post-Neptune trajectory visibly bends south of the ecliptic plane.

Includes ViewFrame translation-only smoothstep blend over ±2 days (heliocentric ↔ body-centered); `VoyagerCameraController` with manual orbit/pan/zoom override + restore-default-framing action; cadence-shift chunk strategy (daily → hourly → minute → 10-second); 4k→8k texture upgrade on SOI entry; gravity-assist trajectory visual validation; Triton south-of-ecliptic bend; hand-written 50–150-word chapter copy for all 6 encounters in TS template literals; detail-scrubber variant of `<v-timeline-scrubber>`; L4 Playwright visual regression at all 6 pinned encounter moments.

**FRs covered:** FR11, FR12, FR21, FR22, FR23, FR24, FR25, FR26, FR30 (encounter content), FR31, FR32, FR33.

**UX-DRs covered:** UX-DR11 (chapter copy fully exercised), UX-DR31 (dual-scrubber pattern).

---

### Epic 5: Pale Blue Dot — the Hero Scene

A visitor reaches 1990-02-14; the spacecraft physically turns toward the inner solar system; the narrow-angle camera frustum sweeps Venus → Earth → Jupiter → Saturn → Uranus → Neptune in historical sequence; original NASA photo plates composite into the scene at the corresponding instants. The visitor pauses for thirty seconds — the success criterion.

Includes dedicated PBD module (not declarative spec); internal substates `turning`, `sweeping_<body>`, `composite_active`, `composite_decay`; choreographed scan-platform turn (uses Epic 3 attitude service or synthesized per-target pointing if CK doesn't cover the window — UI labels reflect); NASA Photojournal plate compositing pipeline at correct timestamps; L4 Playwright visual regression at PBD; hand-written chapter copy for PBD.

**FRs covered:** FR27, FR28, FR30 (PBD content).

**UX-DRs covered:** (uses Epic 1/2/3 surfaces; no new components).

---

### Epic 6: Audio, Reduced Motion & Full Accessibility Pass

A visitor with `prefers-reduced-motion: reduce` sees instant cuts; a screen-reader user gets sensible chapter announcements without queue flooding; a forced-colors-mode user gets a usable UI; an opt-in Golden Record audio layer activates gently at the launch, PBD, and heliopause chapter markers. Friendly-user qualitative sessions (5–10 users + at least 1 AT user) validate that the differentiator is perceived — the launch gate per PRD.

Includes Golden Record audio asset bundling (~30 MB) + `<v-audio-toggle>` with localStorage session persistence; chapter-marker activation; full reduced-motion sweep across all chapters and components; axe-core CI expansion to every component state; manual a11y testing (VoiceOver/NVDA/TalkBack, color-blindness, forced-colors `@media`, reduced-transparency `@media`); HUD dismiss toggle (`H`); friendly-user testing recruitment + sessions; final contrast/typography polish.

**FRs covered:** FR36, FR43, FR44, FR45 (full pass), FR46, FR49 (full audit).

**UX-DRs covered:** UX-DR15 (audio toggle), UX-DR21 (`:focus-visible` global), UX-DR24 (announcement throttling), UX-DR25 (forced-colors), UX-DR26 (reduced-transparency), UX-DR27 (final shortcut polish), UX-DR35 (axe-core full), UX-DR36 (manual a11y checklist), UX-DR38 (AT user in friendly pool).

---

### Epic 7: Operational Substrate & Launch Readiness

The maintainer can update kernels via a bot PR, review the auto-generated drift report, and approve from a phone — CI rebakes, runs the full 6-layer L1–L5 harness, deploys content-hashed assets, and posts a build manifest. The artifact passes every NFR gate (60 FPS, ≤3s TTI, ≤35 MB first-paint, ≤150 MB total). Cross-browser + real-device testing is green. The launch playbook is ready.

Includes drift report tool (`bake/src/drift_report.py`) + PR-comment integration; path-filtered kernel-update workflow; `max_drift_km ≤ 5` gate; bake-determinism verification step (NFR-R4); full L5 Playwright E2E mission-timeline assertion; build-manifest observability artifact (NFR-M5); content-hashed immutable filenames + 1-hour HTML TTL; deploy rollback documentation; `npm/pnpm audit` + `uv` advisory checks; final ADR completion (25 entries including ADR 0016 CDN selection); `THIRD_PARTY.md` + `MISSION_FACTS.md`; CSP + SRI + HTTPS verification; performance pass on mid-range laptop; real-device responsive testing (Tier 1 + 2 + 3 best-effort); launch playbook (HN, r/space, r/NASA, collectSPACE, Twitter/X).

**FRs covered:** FR48 (provenance trail), FR51 (full pipeline), FR53, FR54, FR55 (full L1–L5), FR56 (immutable + rollback), FR58.

**UX-DRs covered:** UX-DR37 (real-device testing).

---

## Epic 1: Foundation & First Vertical Slice (Cruise Viewer)

A visitor lands on the site, sees both Voyager spacecraft moving along their heliocentric trajectories from 1977→2030, scrubs the timeline at any speed, sees the date/distance HUD update, plays/pauses, and can deep-link a timestamp. No encounters or attitude yet — but the cruise is real, the scrubber feels physical, first paint is ≤3s, and the artifact is already a static-CDN-deployed site behind a green CI.

### Story 1.1: Initialize Monorepo with Web and Bake Halves

As the project maintainer,
I want a monorepo scaffolded with a TypeScript Vite `web/` half and a Python `uv` `bake/` half,
So that subsequent stories have a deterministic, lockfile-pinned starting point that codifies the no-PII / no-analytics architectural posture from day one.

**Acceptance Criteria:**

**Given** a clean working directory,
**When** I run `npm create vite@latest web -- --template vanilla-ts` and `uv init bake` at the repo root,
**Then** the `web/` half boots via `npm run dev` and serves a blank Vite page on `http://localhost:5173`,
**And** the `bake/` half resolves dependencies via `uv sync` and `uv run python -c "import spiceypy; print(spiceypy.tkvrsn('TOOLKIT'))"` prints the SpiceyPy 8.1.0 toolkit version.

**Given** the monorepo is initialized,
**When** I inspect the root configuration files,
**Then** `.python-version` pins Python 3.13 exactly,
**And** `bake/pyproject.toml` pins `spiceypy==8.1.0`, scipy, numpy, and Ruff,
**And** `web/package.json` pins TypeScript strict mode, ESLint, Prettier, and Vitest,
**And** `.gitattributes` declares `*.bsp *.bc *.tf *.tsc *.tls *.pck` as Git LFS-tracked,
**And** `uv.lock` and `web/package-lock.json` are committed.

**Given** the dependency manifests,
**When** I grep both for analytics, telemetry, fingerprinting, or cookie-consent libraries,
**Then** zero matches are found (FR50 / NFR-S8 codified by absence),
**And** the `README.md` at the repo root documents the dual-half structure and the no-PII commitment.

---

### Story 1.2: Author Phase 0 ADR Catalogue (25 Entries)

As the project maintainer,
I want all 25 Phase 0 architectural decisions recorded as MADR ADRs before any substantive code lands,
So that every downstream story has documented rationale and rejected alternatives to reference, and the project survives without continuous engineering attention (NFR-M1, NFR-M6).

**Acceptance Criteria:**

**Given** the monorepo is initialized,
**When** I open `docs/adr/0000-template.md`,
**Then** the MADR template includes sections: status, context, decision, consequences, alternatives considered.

**Given** the ADR catalogue is complete,
**When** I list `docs/adr/`,
**Then** 25 ADRs are present numbered `0001` through `0025` covering: starter template choice, render-space scale + reverse-Z, custom VTRJ binary format, asset manifest schema, drift report tool, kernel acquisition (Git LFS), chapter system, view-frame blend, mission-phase FSM, URL format, embed mechanics, OG card pipeline, browser-unsupported fallback, CI provider, ADR 0016 CDN provider selection (Cloudflare Pages vs Vercel), deploy gates, caching strategy, analytics-zero, error capture, build-manifest observability, `/perf` route, MCP vs Playwright split, ADR format, design system bespoke choice, attitude service architecture.

**Given** the ADR set,
**When** I run `just adr-index`,
**Then** `docs/adr/README.md` is regenerated as a table-of-contents listing every ADR with its title and status,
**And** the index is committed.

**Given** ADR 0016 (CDN provider),
**When** I read it,
**Then** the alternatives matrix (Cloudflare Pages vs Vercel) is filled in even though the final selection is marked deferred until Story 1.14 makes the choice operational.

---

### Story 1.3: Acquire and Hash-Pin NAIF and PDS Kernels

As the project maintainer,
I want a reproducible kernel acquisition flow that populates `kernels/` from NAIF and PDS Rings Node and pins every kernel by SHA-256,
So that the build is deterministic (FR52, NFR-S4), kernel updates can be reviewed via drift report (Epic 7 prereq), and the CK coverage inventory is documented for Epic 3 scoping.

**Acceptance Criteria:**

**Given** an empty `kernels/` directory,
**When** I run `just fetch-kernels`,
**Then** all pinned NAIF Voyager SPK kernels, both CK files (`vgr1_super_v2.bc`, `vgr2_super_v2.bc`), PDS Rings Node supplementary CK products, FK frame kernels (`vg1_v02.tf`, `vg2_v02.tf`), LSK, PCK, and SCLK kernels are downloaded into `kernels/` and tracked by Git LFS,
**And** `kernels/kernels-manifest.json` contains every kernel with its SHA-256, source URL, and (where applicable) PDS Rings Node attribution metadata.

**Given** the kernel set is populated,
**When** I run `just verify-kernels`,
**Then** the manifest's SHA-256 hashes are recomputed against the on-disk files and the script exits 0 on match,
**And** modifying any kernel byte and re-running verification exits non-zero with the offending filename printed.

**Given** the CK kernels are present,
**When** I run `ckbrief vgr1_super_v2.bc vgr2_super_v2.bc <pds-supplements>` and commit the captured output,
**Then** `docs/kernels/ckbrief-inventory.md` documents every CK coverage window for both spacecraft, including which encounter windows are covered, which are gaps, and explicitly whether the 1990-02-14 Pale Blue Dot window has CK coverage (input to Epic 5 scoping).

---

### Story 1.4: Bake Pipeline Scaffold and L1 Python Validation Harness

As the project maintainer,
I want a deterministic Python bake step that produces VTRJ binary trajectory files from pinned kernels plus a Layer-1 validation harness that gates accuracy,
So that subsequent web stories consume real interpolated data, the byte-identical-rebuild guarantee (NFR-R4) holds, and FR51 / FR55 (L1) are operational.

**Acceptance Criteria:**

**Given** kernels are verified and present,
**When** I run `just bake`,
**Then** `bake/out/manifest.json` is generated listing both spacecraft with one VTRJ file each covering 1977-08-20 → 2030-12-31 at daily cadence,
**And** each VTRJ file conforms to the format: 40-byte header (magic + version + body_id + et_start + et_end + sample_count + cadence_seconds + reserved) followed by Float64Array body, brotli-compressed,
**And** running `just bake` a second time produces byte-identical VTRJ outputs (verified by SHA-256 comparison).

**Given** the bake has produced VTRJ outputs,
**When** I run `just validate`,
**Then** the L1 Python harness samples both spacecraft on a dense SPICE reference grid via SpiceyPy `spkpos`, interpolates the corresponding VTRJ data via scipy `CubicHermiteSpline` over position+velocity, computes per-body max position error and RMS error,
**And** the report at `bake/out/validation-report.md` records max ≤ 20 km and RMS ≤ 5 km across the full 1977–2030 window for both spacecraft (NFR-P9),
**And** the harness exits non-zero if either threshold is exceeded.

**Given** the bake pipeline,
**When** I inspect `bake/src/`,
**Then** the modules are organized as `sample.py` (SpiceyPy ET grid sampling), `binary_writer.py` (VTRJ format), `bake.py` (orchestration + manifest emission), `validation.py` (L1 harness),
**And** each module has a corresponding `pytest` unit test in `bake/tests/`.

---

### Story 1.5: Three.js Renderer Foundation with Reverse-Z and Floating Origin

As a visitor,
I want the 3D scene to render with sub-meter precision at any zoom level from spacecraft inspection to heliopause distance,
So that the canvas-as-protagonist commitment holds visually and FR13 / NFR-P8 / NFR-C5 are satisfied.

**Acceptance Criteria:**

**Given** the web app is bootstrapped,
**When** the `RenderEngine` initializes,
**Then** a Three.js `WebGLRenderer` (version ≥ r170) is created with native reverse-Z enabled and a float depth buffer,
**And** a `PerspectiveCamera` is configured with FOV 50°, near plane appropriate for sub-meter inspection, far plane ≥ 165 AU,
**And** a `WorldGroup` `Object3D` is added to the scene as the root for all world-space children.

**Given** the render loop is running,
**When** each frame begins,
**Then** `WorldGroup.position` is set to `-cameraWorldPos / SCALE` where SCALE = 1 (km per render-space unit),
**And** branded TypeScript types (`Kilometers`, `Meters`, `AU`) enforce unit safety at API boundaries.

**Given** the application boots,
**When** the `GPUCapabilityProbe` runs,
**Then** a small reverse-Z test pattern is rendered offscreen,
**And** if the probe detects depth instability, the renderer transparently falls back to `logarithmicDepthBuffer: true` and the fallback is logged to the console without user-visible chrome,
**And** appending `?force-log-depth=1` to the URL forces the logarithmic-depth path for testing.

**Given** the renderer is initialized,
**When** I zoom the camera from 1 m sub-meter scale to 165 AU and back,
**Then** there is zero observable z-fighting and zero positional jitter at any intermediate zoom level (verified by a dev-mode visual smoke test in this story; full Playwright regression deferred to Story 7.6).

---

### Story 1.6: Asset Manifest Loader and EphemerisService

As a visitor,
I want the simulation to fetch trajectory binaries on demand and interpolate spacecraft and body positions at the current ET,
So that the time scrubber in Story 1.9 has real data to drive the scene, and FR55 (L2 hook) and NFR-P7 are operational.

**Acceptance Criteria:**

**Given** the bake pipeline has produced `manifest.json` and VTRJ files at `web/public/manifest.json` and `web/public/data/`,
**When** the web app boots,
**Then** `ManifestLoader.load()` fetches `/manifest.json`, validates the schema with Zod, and exposes typed accessors for `bodies[].files[].{etStart, etEnd, cadenceSeconds, url}`,
**And** an invalid schema fails fast with a descriptive error in the console.

**Given** the manifest is loaded,
**When** code calls `EphemerisService.getPosition(bodyId, et)` for the first time on a given chunk,
**Then** the corresponding VTRJ file is fetched, brotli-decoded into an `ArrayBuffer`, parsed via `DataView` into a `Float64Array`, and cached in memory,
**And** subsequent calls within the cached chunk return interpolated values without network access.

**Given** trajectory data is loaded for both Voyager spacecraft and 10 other bodies (Sun, 8 planets, 1 moon),
**When** `EphemerisService.getPosition` is called for all 12 bodies in a tight loop on the `/perf` dev route,
**Then** the median interpolation cost across 1000 iterations is ≤ 1 ms per frame (NFR-P7),
**And** the returned positions match SpiceyPy `spkpos` reference values to within 20 km max / 5 km RMS (NFR-P9 holds at runtime, not just at bake time).

**Given** the service supports velocity-aware interpolation,
**When** I call `EphemerisService.getVelocity(bodyId, et)`,
**Then** it returns the velocity vector computed via cubic-Hermite interpolation over position+velocity, suitable for any future Layer-2 validation harness consumer.

---

### Story 1.7: Design Tokens, Lit 3 Scaffold, and Self-Hosted Typography

As a visitor,
I want the artifact's visual register established on first paint with AiRT-class typography and a single design-token source of truth,
So that the rest of the UI inherits the deep-space palette, three-voice typography, and reduced-motion contract automatically, and FR49 + UX-DR1 through UX-DR7 + UX-DR21 + UX-DR30 are operational.

**Acceptance Criteria:**

**Given** the web app source tree,
**When** I inspect `src/styles/`,
**Then** `tokens.css` contains the full token sheet at `:root` scope (colors with `--v-color-bg #0a0e14` through `--v-color-divider`; typography size tokens via `clamp()`; spacing 4-px discrete + edge-margin `clamp(16px, 3vw, 64px)`; motion `--v-duration-fast/base/slow` with `--v-ease-out/in-out`; z-index six discrete levels),
**And** the critical color + first-paint typography tokens are inlined in `<style>` in `index.html` to avoid FOUC on first paint.

**Given** the typography stack,
**When** the app loads on cold cache,
**Then** JetBrains Mono Regular, Inter Regular, and Source Serif 4 variable (350–600 subset) are loaded via `<link rel="preload" as="font" type="font/woff2" crossorigin>`,
**And** all `@font-face` declarations use `font-display: swap` with latin subset only,
**And** the combined typography asset size measured at `web/dist/assets/fonts/` is ≤ 120 KB compressed.

**Given** the Lit 3+ dependency is installed,
**When** I inspect `src/components/`,
**Then** a `BaseElement extends LitElement` exists exporting the project's shared Shadow DOM stylesheet adoption pattern,
**And** every future Web Component is intended to extend `BaseElement` or directly extend `LitElement` per the Step 11 inventory.

**Given** the global focus and motion rules,
**When** I tab through any focusable element in the DOM,
**Then** a 2px `--v-color-focus` outline with 2px offset is rendered via a global `:focus-visible` rule (not `:focus`),
**And** setting `prefers-reduced-motion: reduce` in OS settings collapses `--v-duration-fast/base/slow` to `0ms` via a `@media` rule at `:root`, with no per-component code changes required.

**Given** the responsive breakpoint strategy,
**When** I inspect `src/styles/`,
**Then** exactly three structural breakpoints are defined: `@media (max-width: 767px)`, `@media (max-width: 1023px)`, and `@media (min-width: 1920px)`,
**And** all other adaptive sizing uses `clamp()` not media queries.

---

### Story 1.8: `<v-fallback-page>` and Boot-Time Capability Probe

As a visitor on an unsupported browser,
I want a dignified, JS-free fallback page that names which capability my browser is missing,
So that I am informed without seeing a degraded simulation, and FR57 / NFR-C4 / NFR-C7 / UX-DR17 are operational.

**Acceptance Criteria:**

**Given** the app's `index.html`,
**When** I view source,
**Then** a ≤ 1 KB inline `<script>` runs before the main bundle and probes `window.WebGL2RenderingContext`, `window.WebAssembly`, and Brotli support (via a Response header check or a fetch of a brotli-encoded asset),
**And** if any probe fails, the script calls `window.location.replace('/unsupported.html?reason=<webgl2|wasm|brotli>')`,
**And** if all probes succeed, the script dynamically imports the main bundle.

**Given** `/unsupported.html` is requested,
**When** the page renders with JavaScript disabled in the browser,
**Then** the page still renders correctly because it is pre-rendered at build time from the `<v-fallback-page>` Lit component into static HTML + inline CSS,
**And** the `?reason` query parameter is read by a tiny inline script (when JS is available) to swap the body copy between the three variants (WebGL2 missing / WebAssembly missing / Brotli missing); when JS is disabled, the default variant renders.

**Given** the fallback page DOM,
**When** I inspect it with screen-reader tooling,
**Then** the document uses `<main>`, `<h1>`, `<p>`, and `<ul>` semantic elements,
**And** the browser-recommendation list links to chrome.com, mozilla.org, and apple.com/safari with explicit hostname text so screen readers announce the destination,
**And** the page's typography matches the main app (Inter for the heading, Source Serif 4 for body, deep-space palette).

**Given** the deploy pipeline,
**When** Story 1.14's CI build runs,
**Then** `web/dist/unsupported.html` is generated as a static asset alongside `index.html`.

---

### Story 1.9: Designed First-Paint Sequence and `<v-timeline-scrubber>` Mission Variant

As a first-time visitor,
I want to see a held title card that dissolves into the launch frame and a physical, draggable timeline scrubber as the primary control surface,
So that the AiRT-class register is established in the first three seconds and time becomes the spine of the experience, fulfilling FR1, FR6, FR42, FR45 (scrub keys), UX-DR8, UX-DR20 (slider keyboard + pointer-events), UX-DR22, UX-DR28, UX-DR32.

**Acceptance Criteria:**

**Given** a visitor lands on `/` on cold cache,
**When** the first paint occurs,
**Then** a title card "Voyager. 1977 to 2030." is rendered centered in Inter at `--v-size-title-card` against `--v-color-bg`,
**And** the card holds for ~2 seconds (two beats) and dissolves over 400ms (`--v-duration-slow`) into the heliocentric scene initialized at ET corresponding to 1977-09-05 00:00 UT,
**And** no modal, cookie banner, signup prompt, or animated logo appears,
**And** under `prefers-reduced-motion: reduce`, the dissolve becomes an instant cut.

**Given** the scene is active,
**When** I inspect the DOM,
**Then** a `<v-timeline-scrubber variant="mission">` is rendered anchored to the viewport bottom with `--v-edge-margin` padding,
**And** the scrubber's track spans 1977-08-20 (V2 launch) → 2030-12-31,
**And** the thumb tracks the current simulation ET,
**And** the component implements WAI-ARIA Slider with `role="slider"`, `aria-valuemin/max/now` (as ISO-8601 strings), `aria-valuetext` as human-readable "YYYY-MM-DD HH:MM UT", and `aria-label="Mission timeline"`.

**Given** the scrubber is focused via keyboard,
**When** I press `←/→`,
**Then** the simulation scrubs by 1 unit where the unit is speed-dependent (1 day at 1× speed),
**And** `Shift+←/→` scrubs by 10 units,
**And** `Home`/`End` jumps to the mission start or end timestamp,
**And** the simulation pauses on first keystroke and resumes 300ms after the last keystroke if it was playing before.

**Given** the scrubber accepts pointer input via `primitives/pointer-events.ts`,
**When** I click on the track (not the thumb),
**Then** the simulation jumps paused to that timestamp,
**And** clicking and dragging the thumb sets pointer-capture, cursor changes to grab/grabbing, simulation pauses implicitly, position updates within 16ms per frame, and on release the simulation resumes at the previously-set speed.

**Given** the scrubber drags,
**When** the timestamp changes,
**Then** the URL's `?t=` parameter is updated via `history.replaceState` throttled at 250ms during the drag,
**And** a final `replaceState` fires on release,
**And** the address bar always reflects the current simulation timestamp without polluting browser history.

**Given** a visitor opens `voyager.app/?t=1989-08-25T09:23:00Z`,
**When** the app boots,
**Then** the simulation initializes paused at that exact instant,
**And** an invalid `?t=` value (non-ISO-8601 or out of range) is rejected silently and the simulation initializes at the mission start (no error UI; per NFR-S7).

**Given** the scrubber thumb's interactive bounding box,
**When** I measure it,
**Then** the effective hit area is ≥ 44×44px even if the visible thumb glyph is smaller (UX-DR22).

---

### Story 1.10: `<v-play-button>`, Simulation Clock, and `<v-speed-multiplier>`

As a visitor,
I want to play and pause the simulation and control its speed from 1× through 1,000,000×,
So that I can scrub the full mission in ~50 seconds or watch a single day at real-time, fulfilling FR2, FR3, FR7, NFR-P6, UX-DR12, UX-DR14, UX-DR23, UX-DR32.

**Acceptance Criteria:**

**Given** the bottom-left of the viewport,
**When** the app is loaded,
**Then** a `<v-play-button>` renders a native `<button>` with a play glyph (▶) when paused and a pause glyph (❚❚) when playing,
**And** the button exposes `aria-label="Play"`/`"Pause"` and `aria-pressed="false"`/`"true"` reflecting state,
**And** pressing `Space` from anywhere in the document toggles play/pause (unless a text input has focus, in which case `Space` types a space),
**And** the button is keyboard-tab-focusable and clickable, both paths toggling state identically.

**Given** the simulation clock is initialized at some ET,
**When** the user clicks play,
**Then** each frame advances `currentEt` by `speedMultiplier × wallClockDelta` seconds,
**And** the HUD date updates to reflect the new ET,
**And** the trajectory positions update via `EphemerisService` per frame.

**Given** the bottom-right of the viewport,
**When** the app is loaded,
**Then** a `<v-speed-multiplier>` renders a 120px wide log-scale slider with end labels "1×" and "1M×" in mono `--v-color-fg-quiet`,
**And** the thumb position maps logarithmically (drag distance → 10^x speed),
**And** dragging snaps to nearest decade boundary (1, 10, 100, 1k, 10k, 100k, 1M) within a 5% tolerance band,
**And** the readout below shows "10,000× — 1 min/sec" coupling the multiplier to elapsed-time intuition,
**And** the component implements WAI-ARIA Slider with `role="slider"`, `aria-label="Playback speed"`, and `aria-valuetext` describing the multiplier and elapsed time.

**Given** the speed-multiplier is focused via keyboard,
**When** I press `+`/`-`,
**Then** the speed adjusts by one decade-stop,
**And** `Shift+/-` adjusts by 5%,
**And** `Home`/`End` jumps to 1× / 1,000,000× bounds.

**Given** the simulation is scrubbing forward and the next chunk is not yet loaded,
**When** the simulation reaches the boundary of the loaded chunk,
**Then** the speed multiplier auto-caps to 0 (effectively pausing) until the next chunk has loaded,
**And** the user's previously-chosen speed multiplier is restored once loading completes (FR7),
**And** chunk prefetch is triggered no later than the last 10% of the currently-playing chunk window so that under normal network conditions the cap is invisible (NFR-P6).

**Given** the speed-multiplier is set to 1,000,000×,
**When** I press play from ET corresponding to 1977-08-20,
**Then** the simulation scrubs the full mission and reaches 2030-12-31 within ≤ 60 seconds of wall-clock time (NFR-P6),
**And** no individual frame exceeds 50ms (NFR-P2).

---

### Story 1.11: `<v-hud>` Container and HUD Sub-Components

As a visitor,
I want a quiet instrument-panel HUD displaying the current simulation date, per-spacecraft distance from Sun, and current speed multiplier,
So that I always know where I am in time and space without the UI competing with the canvas, fulfilling FR34, NFR-A7, NFR-A8, UX-DR9, UX-DR24, UX-DR29.

**Acceptance Criteria:**

**Given** the app is rendered,
**When** I inspect the layout,
**Then** `<v-hud>` is a single component that anchors its sub-components to the viewport edges per the canvas-and-edges model: `<v-hud-date>` and `<v-hud-distance>` top-right; `<v-hud-chapter-title>` top-left (rendered empty during cruise); `<v-hud-speed>` adjacent to the speed-multiplier slider bottom-right; `<v-hud-instruments>` bottom-left placeholder (filled by Epic 2),
**And** no HUD element has a background fill,
**And** every HUD element carries `text-shadow: 0 0 8px rgba(10, 14, 20, 0.8)` for legibility over bright canvas areas.

**Given** `<v-hud-date>`,
**When** the simulation timestamp updates,
**Then** the value renders inside `<time datetime="YYYY-MM-DDTHH:MM:SSZ">YYYY-MM-DD HH:MM</time>` in JetBrains Mono with `font-variant-numeric: tabular-nums` so digits do not jitter,
**And** the label "UT" precedes the value in `--v-color-fg-quiet` uppercase at `--v-size-hud-mono-sm` with `letter-spacing: 0.06em`,
**And** the value uses `--v-color-fg` at `--v-size-hud-mono`,
**And** the date string is computed via `dateForHud(et)` (the bare-value sibling of `formatForHud`, kept distinct so the scrubber's `aria-valuetext` form with inline 'UT' is preserved).

**Given** `<v-hud-distance>`,
**When** the simulation timestamp updates,
**Then** two rows render: "V1" + distance from Sun in AU + "AU" suffix, and "V2" + distance from Sun + "AU",
**And** each value uses 2–3 significant figures (e.g., "5.20 AU", "121 AU") with tabular-nums mono.

**Given** `<v-hud-speed>`,
**When** the speed multiplier changes,
**Then** the readout displays the multiplier with thousands-comma separator (e.g., "10,000×") followed by an em-dash and an elapsed-time description (e.g., "10,000× — 1 min / sec"),
**And** all numeric content uses tabular-nums mono.

**Given** the HUD region semantics,
**When** I inspect the DOM,
**Then** `<v-hud>` renders an `<aside aria-label="Mission HUD">` container,
**And** each sub-component's value is wrapped in a live region with `aria-live="polite"`,
**And** live-region updates fire only on scrub-stop (debounced) and on chapter change — not on every per-frame value change (UX-DR24),
**And** `aria-live="assertive"` is not used anywhere in v1.

**Given** narrower viewports,
**When** the viewport is < 1024px wide,
**Then** the HUD compacts per the responsive strategy: `<v-hud-distance>` and `<v-hud-instruments>` collapse into a single "expand HUD" affordance (deferred details — placeholder behavior acceptable for this story, full polish in Epic 6).

---

### Story 1.12: Both Voyager Spacecraft with Past-Solid / Future-Dashed Trajectory Lines

As a visitor,
I want to see both Voyager spacecraft rendered as distinct identifiable models moving along their full historical and projected trajectories,
So that I perceive each mission's arc and the past-vs-future cartographic distinction, fulfilling FR8, FR9, FR10, UX-DR33.

**Acceptance Criteria:**

**Given** the NASA 3D Resources Voyager spacecraft GLB is committed to `web/public/models/voyager.glb`,
**When** the app boots,
**Then** two instances of the model are loaded into the scene (one labeled `voyager-1`, one `voyager-2`) at a single LOD level appropriate for cruise-scale viewing (full 4-level LOD chain deferred to Epic 4 Story 4.4),
**And** each instance's world position is updated per frame via `EphemerisService.getPosition(bodyId, et)` after the floating-origin transform,
**And** the two spacecraft are visually distinguishable (e.g., subtle hue tint on the HGA or a small monospace label tag — implementation choice but the difference must be perceptible at default cruise zoom).

**Given** the trajectory lines are rendered using `Line2` + `LineMaterial` from `three/examples/jsm/lines/`,
**When** the simulation is at ET corresponding to 1990-02-14 (a mid-mission instant),
**Then** each spacecraft has one past-trajectory line (solid, `--v-color-trajectory-past`, screen-space width ~1.5px) drawn from its launch position to its current position,
**And** each spacecraft has one future-trajectory line (dashed pattern, `--v-color-trajectory-future`, screen-space width ~1px) drawn from its current position to ET corresponding to 2030-12-31.

**Given** the simulation plays forward,
**When** time advances,
**Then** the past line's geometry grows incrementally (extending the polyline by appending vertices from the current position) and the future line's geometry shrinks incrementally (dropping the leading vertex),
**And** no per-frame full geometry rebuild occurs (verified by no `BufferGeometry.dispose` call inside the per-frame update path),
**And** at any scrubbed time the line geometries reflect the past/future split correctly.

**Given** the visual register commitment,
**When** I inspect the lines closely,
**Then** they are solid colors (no gradient between past and future); the past-vs-future distinction is encoded by line-style (solid vs dashed) in addition to color (UX-DR33 + FR49 non-color-only encoding),
**And** at the V2 launch on 1977-08-20, V2's past line is zero-length and its future line spans the full projected mission.

---

### Story 1.13: Celestial Bodies — Sun, Eight Planets, and One Moon

As a visitor,
I want the Sun, all eight planets, and a representative moon (Earth's Moon for the v1 baseline) rendered at their SPICE-derived positions for the current simulation timestamp,
So that the trajectories are visually anchored in a real solar system and the scene is performant at the 12-body benchmark (NFR-P7), fulfilling FR14, NFR-P1.

**Acceptance Criteria:**

**Given** the bake pipeline produced trajectory data for the Sun, Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune, and Earth's Moon,
**When** the app boots,
**Then** each body is rendered as a textured sphere at its SPICE-derived heliocentric position via `EphemerisService.getPosition(bodyId, et)`,
**And** the Sun renders at approximately 700,000 km radius with a simple emissive material (no corona effect required for v1).

**Given** the planet texture pipeline,
**When** I inspect `web/public/textures/`,
**Then** each planet has a 4k base color texture sourced from Björn Jónsson processed plates and/or USGS Astrogeology base maps, encoded as KTX2 via `toktx`,
**And** the texture filenames are content-hashed at build time and referenced from the asset manifest,
**And** the 8k texture upgrade path is deferred to Epic 4 Story 4.3 (SOI entry trigger).

**Given** the Milky Way skybox,
**When** the scene renders,
**Then** a 2k ETC1S-compressed equirectangular Milky Way texture is loaded as the scene's background.

**Given** the full 12-body scene at 1280×720,
**When** I measure rendering performance on a mid-range laptop (per NFR-P1 definition),
**Then** the sustained frame rate is ≥ 60 FPS,
**And** P95 frame time ≤ 16.7 ms (NFR-P2 measured via dev-mode FPS readout in this story; the `/perf` route and Playwright capture are deferred to later epics).

**Given** the textures have alternate resolutions,
**When** the `GPUCapabilityProbe` (Story 1.5) reports insufficient GPU memory for 4k textures,
**Then** the loader falls back to 2k textures without user action and without a lazy upgrade path (NFR-C6 baseline; the full 8k tier upgrade is Epic 4 scope).

---

### Story 1.14: Baseline CI and Static CDN Deploy

As the project maintainer,
I want a green CI pipeline that lints, typechecks, runs the L1 + L3 gates, builds with content-hashed assets, and deploys to the chosen CDN,
So that every merge to main results in a live, immutable, rollback-able deployment, fulfilling FR51, FR55 (L1+L3), FR56, NFR-R1, NFR-R2, NFR-R4, NFR-S1, NFR-M4.

**Acceptance Criteria:**

**Given** ADR 0016 from Story 1.2,
**When** I open it,
**Then** it has been updated with the final CDN selection (Cloudflare Pages or Vercel) and the rationale; the rejected provider is recorded.

**Given** `.github/workflows/ci.yml`,
**When** a PR is opened or main is updated,
**Then** the workflow runs on `ubuntu-22.04` with Git LFS support, sets up Python 3.13 via `.python-version`, installs `uv`, runs `uv sync`, installs Node, runs `npm ci` in `web/`,
**And** executes jobs in dependency order: (a) lint — Ruff for `bake/`, ESLint for `web/`; (b) typecheck — mypy for `bake/`, `tsc --noEmit` for `web/`; (c) bake; (d) bake-determinism check (rebake and SHA-compare); (e) L1 Python validation harness; (f) L3 Vitest unit tests; (g) `npm run build`,
**And** any job failure fails the workflow.

**Given** the L1 + L3 suite,
**When** it executes on the CI runner,
**Then** the total wall-clock time is ≤ 5 minutes (NFR-M4).

**Given** a green CI on main,
**When** the deploy job fires,
**Then** the `web/dist/` artifact is published to the chosen CDN via the provider's official GitHub Action or CLI,
**And** all asset filenames in `web/dist/assets/` are content-hashed (e.g., `app.<hash>.js`, `voyager-lod0.<hash>.glb`),
**And** the provider configuration sets `Cache-Control: public, max-age=31536000, immutable` on `/assets/*` and `Cache-Control: public, max-age=3600` on HTML (configured via `_headers` for Cloudflare or `vercel.json` for Vercel),
**And** HTTPS is enforced (HTTP→HTTPS redirect; TLS 1.2+ with TLS 1.3 preferred — NFR-S1).

**Given** two successive deploys,
**When** I request a previously-deployed asset URL after a new deploy,
**Then** the asset still resolves (immutable URL contract — NFR-R2),
**And** the redeploy did not invalidate the prior bundle's URLs.

**Given** the deployed site,
**When** I run `curl -I https://voyager.app/` from a fresh shell,
**Then** the response includes the appropriate `Cache-Control` and HTTPS headers,
**And** the page returns HTTP 200 with the bootstrapped HTML.

---

## Epic 2: Mission Spine — Chapter Navigation, Deep-Linking and Embed

Every chapter is reachable by index, marker click, keyboard `1`–`9`, or deep-link URL; recipients land paused at the exact second; OG cards render correctly in messaging apps; curators can append `?embed=true` to any URL for chrome-less kiosk display; About / Methodology / Attribution pages explain the methodology and credit data sources; the two heliopause crossings appear as text cards.

### Epic 2 — Risks and Mitigations (carried from Epic 1 retrospective, 2026-05-19)

These risks were surfaced and accepted as planning input during the Epic 1 retrospective. Mitigations are non-negotiable inputs to each story spec.

- **R1 — Chapter FSM coupling with ClockManager and ViewframeService.** Epic 2 layers a state machine on top of the time and camera systems built in Epic 1. Three-way coupling is high-risk: any change to any single subsystem may break the FSM in a non-obvious way. **Mitigation:** Story 2.1 (ChapterDirector FSM) must have an explicit Integration AC (per `_bmad/custom/voyager-skill-rules.md` Rule 1) verifying the FSM ↔ ClockManager ↔ ViewframeService three-way wire-up via Chrome DevTools MCP, in a real browser, against the dev server. Mocks at the boundary are not acceptable. The per-story smoke gate covers the final wire-up validation.
- **R2 — URL state synchronization complexity.** Story 2.4 introduces per-chapter URL slugs + pushState. Interaction with the Story 1.10 URL throttle (250ms history.replaceState) creates edge cases for deep-link arrival, chapter-mid-cycle (URL updates while user is scrubbing), and browser back/forward (history-driven chapter transitions). **Mitigation:** Story 2.4 must include explicit ACs for all three edge cases: (a) cold-load deep-link to mid-chapter timestamp resolves correctly, (b) mid-cycle URL update does not desync ClockManager state, (c) back/forward correctly fires chapter transitions through the FSM. Each AC verified by Chrome DevTools MCP smoke.
- **R3 — Embed mode chrome-less rendering must not break accessibility.** Story 2.5 (`?embed=true`) hides HUD selectively. Easy to ship "looks right but ARIA broken" — exactly the class of bug Epic 1's manual verification surfaced (aria-valuemin/max="0", aria-valuetext mojibake). **Mitigation:** Story 2.5 must include an a11y AC asserting that keyboard shortcuts and ARIA attributes remain intact when HUD is hidden; verified by an axe-core run AND a Chrome DevTools MCP keyboard-driven smoke (tab through the chrome-less view and assert focus order + ARIA exposure).
- **R4 — Pre-rendered OG cards drift from runtime chapter data.** Story 2.6 generates static OG images at build time, but those rely on chapter data that lives in the runtime FSM. If FSM and OG generator drift, social previews go wrong silently. **Mitigation:** Story 2.6 must include a build/runtime parity assertion: OG generator and FSM read chapter definitions from the same source file (no copy-paste). A unit test must enforce that the OG generator's chapter list equals the FSM's chapter list at build time.

These mitigations are NOT optional. The story authors for 2.1, 2.4, 2.5, and 2.6 must include the listed ACs verbatim or document why they are not applicable in the story spec's "Risk Mitigation Audit" subsection.

### Story 2.1: ChapterDirector FSM and 11 Declarative Chapter Specs

As the project maintainer,
I want a per-frame chapter state machine plus declarative specs for all 11 chapters so that subsequent stories have a single source of truth for chapter membership, lifecycle, and anchor timestamps,
So that the Pale Blue Dot module (Epic 5) and encounter modules (Epic 4) plug into a stable substrate without duplicating chapter metadata.

**Acceptance Criteria:**

**Given** the chapter system module,
**When** I inspect `web/src/chapters/`,
**Then** there is a `ChapterDirector` class that exposes `update(currentEt)` called once per frame from the render loop,
**And** the director tracks each chapter's lifecycle state machine: `out → entering → held → exiting → passed`,
**And** state transitions are triggered by `currentEt` crossing the chapter's window bounds (`windowStartEt`, `windowEndEt`) with no hysteresis required at this story.

**Given** the chapter spec format,
**When** I inspect `web/src/chapters/specs/`,
**Then** 10 standard chapter specs exist as TypeScript modules (`launch-v1.ts`, `launch-v2.ts`, `v1-jupiter.ts`, `v2-jupiter.ts`, `v1-saturn.ts`, `v2-saturn.ts`, `v2-uranus.ts`, `v2-neptune.ts`, `v1-heliopause.ts`, `v2-heliopause.ts`),
**And** each spec exports an object with fields `slug` (URL slug), `name` (editorial name), `markerLabel` (2–4 char), `anchorEt` (ISO-8601 → ET conversion), `windowStartEt`, `windowEndEt`, `spacecraft` (`v1`|`v2`|`both`),
**And** anchor timestamps match the encounter dates documented in PRD §Encounter coverage and `MISSION_FACTS.md` (V1 Jupiter 1979-03-05 12:05, V1 Saturn 1980-11-12 23:46, V2 Neptune 1989-08-25, V1 heliopause 2012-08-25, V2 heliopause 2018-11-05, etc.).

**Given** the Pale Blue Dot chapter,
**When** I inspect `web/src/chapters/specs/pale-blue-dot.ts`,
**Then** the spec exists as a placeholder pointing to its dedicated Epic 5 module (no PBD-specific behavior is wired in this story; the spec contains anchor ET = 1990-02-14 00:00 UT, slug `pale-blue-dot`, marker label `PBD`),
**And** the placeholder is sufficient for chapter-marker rendering (Story 2.2) and URL routing (Story 2.4) without coupling to PBD content.

**Given** the chapter registry,
**When** I import `web/src/chapters/registry.ts`,
**Then** it exposes `ALL_CHAPTERS: ChapterSpec[]` as a single ordered array of all 11 specs in chronological order by anchor ET,
**And** consumers (scrubber markers, chapter index, URL router) read from this single registry — no parallel lists.

**Given** the ChapterDirector is running,
**When** I unit-test it with a fixture of ETs crossing window boundaries,
**Then** each chapter transitions through `out → entering → held → exiting → passed` exactly once per forward traversal,
**And** scrubbing backwards reverses the state machine through `passed → exiting → held → entering → out`,
**And** no chapter transitions are skipped under rapid scrubs (state machine is event-driven on ET crossings, not time-delta-driven).

---

### Story 2.2: Chapter Markers on Mission Scrubber (Vertebrae)

As a visitor,
I want to see all 11 chapters as discrete labeled pins along the timeline so that I can perceive the mission's beats at a glance and jump to any of them with one gesture,
So that the timeline-as-spine commitment is visually reinforced and FR4 (partial), FR5, UX-DR34 are operational.

**Acceptance Criteria:**

**Given** `<v-timeline-scrubber variant="mission">` from Story 1.9 with the chapter registry from Story 2.1,
**When** the scrubber renders,
**Then** 11 chapter markers are drawn as 2px-wide × 18px-tall vertical pins positioned along the track at horizontal positions corresponding to each chapter's `anchorEt`,
**And** the inactive marker uses `--v-color-fg-muted`,
**And** the marker corresponding to the current chapter (determined by `ChapterDirector` state) uses `--v-color-accent`,
**And** each marker has a 2–4 character monospace label above it (V1L, V2L, V1J, V2J, V1S, V2S, V2U, V2N, PBD, V1H, V2H) in `--v-color-fg-muted` at `--v-size-hud-mono-sm` with `text-transform: uppercase`.

**Given** the markers are in the DOM,
**When** I tab through the document,
**Then** each marker is individually keyboard-focusable in left-to-right (chronological) DOM order,
**And** each marker has `role="button"` (or wraps a native `<button>`) with `aria-label="<full-chapter-name> — <ISO-8601-anchor-date>"`,
**And** focused marker renders the global `:focus-visible` ring from Story 1.7.

**Given** I hover a marker with a pointer,
**When** the hover dwell exceeds 200ms,
**Then** a quiet tooltip appears showing the full chapter name (e.g., "V2 Neptune") in `--v-color-accent`,
**And** the tooltip disappears immediately on hover-out,
**And** on touchscreen (no hover), the marker labels are always visible (per Tier 2 strategy from UX-DR22 / responsive section).

**Given** a marker is activated by pointer click or `Enter` key,
**When** the activation fires,
**Then** the simulation jumps paused to the chapter's `anchorEt`,
**And** the URL updates via `pushState` to the chapter's deep-link form (the full URL contract is implemented in Story 2.4; this story only requires that the scrubber emits a `chapter-jump` event with the chapter slug, which the router from Story 2.4 will subscribe to — this story's AC is satisfied if the simulation jumps to the anchor ET and the marker becomes the active marker).

**Given** I am scrubbing the mission timeline,
**When** the current ET crosses a chapter window boundary,
**Then** the corresponding marker becomes the active marker (`--v-color-accent`) and the previously-active marker reverts to inactive,
**And** at most one marker is active at any time (handled by the `ChapterDirector` `held` state).

---

### Story 2.3: `<v-chapter-index>` Listbox and Chapter Jump Keyboard Shortcuts

As a returning visitor (Maya, J2),
I want a chapter index I can open from a top-right icon and navigate via keyboard to jump directly to any chapter,
So that I can find the moment I want to share without scrubbing through the mission, fulfilling FR4, UX-DR13, UX-DR16 (focus-trap), UX-DR27 (`M`, `1`–`9`), UX-DR23.

**Acceptance Criteria:**

**Given** the top-right corner of the viewport above the HUD,
**When** the app is rendered,
**Then** a `<v-chapter-index>` toggle button renders as a 32×32px hit-target native `<button>` with a three-line hamburger glyph (≡),
**And** the button exposes `aria-label="Open chapter index"`, `aria-expanded="false"`, `aria-controls="chapter-index-panel"`,
**And** the button uses the same visual rules as `<v-play-button>` (no background, hover → accent, focus-visible ring).

**Given** the index is closed,
**When** I click the toggle icon or press the `M` keyboard shortcut from anywhere in the document (except when a text input has focus),
**Then** the panel slides in from the right edge over 200ms with the overlay scrim fading in,
**And** under `prefers-reduced-motion: reduce` the slide is instant,
**And** `aria-expanded` becomes `"true"`.

**Given** the panel is open,
**When** I inspect the DOM,
**Then** it renders `<div role="listbox" id="chapter-index-panel" aria-label="Mission chapters">` containing 11 `<div role="option">` children — one per chapter from `ALL_CHAPTERS`,
**And** each option shows the editorial chapter name (Inter, `--v-color-fg`) on the left and the chapter date in ISO-8601 short form (mono, `--v-color-fg-muted`) right-aligned,
**And** the option matching the current `ChapterDirector` `held` chapter has `aria-selected="true"` and `aria-current="true"` with a `▸` prefix indicator and `--v-color-accent` text.

**Given** the panel is open and focus is contained,
**When** I press `↑/↓`,
**Then** focus moves to the previous/next option in the list,
**And** `Home`/`End` jumps focus to the first/last option,
**And** `Enter` activates the focused option — the simulation jumps paused to that chapter's anchor ET, the URL updates via `pushState` (Story 2.4 wires this), and the panel closes,
**And** `Esc` closes the panel without activation,
**And** clicking outside the panel closes it.

**Given** focus management uses the `focus-trap` library,
**When** the panel opens,
**Then** focus is automatically moved into the panel (first option),
**And** tabbing cycles only within the panel options + close affordance until `Esc` or activation,
**And** on close, focus is restored to the toggle button.

**Given** keyboard shortcuts globally,
**When** I press `1`, `2`, `3`, …, `9` from anywhere in the document (no text input focused),
**Then** the simulation jumps paused to chapter N from the chronologically-ordered registry where N is the digit pressed,
**And** the URL updates,
**And** chapters 10 and 11 are reachable only via the chapter index or the markers — there is no `0` shortcut.

---

### Story 2.4: Per-Chapter URL Slug Scheme and `pushState` Navigation

As a sharing visitor (Maya, J2; Hanno, J4),
I want every chapter to have a stable, human-readable URL that I can copy from the address bar and that my recipients land on paused at the exact moment,
So that the artifact becomes a communication vector and curators can build kiosk URL contracts on a stable scheme, fulfilling FR37, FR38, FR41.

**Acceptance Criteria:**

**Given** the URL scheme contract,
**When** the router boots,
**Then** the app recognizes two route shapes: `/` (homepage at mission start unless `?t=` overrides) and `/c/<chapter-slug>` (chapter route),
**And** the chapter slugs are exactly: `launch-v1`, `launch-v2`, `v1-jupiter`, `v2-jupiter`, `v1-saturn`, `v2-saturn`, `v2-uranus`, `v2-neptune`, `pale-blue-dot`, `v1-heliopause`, `v2-heliopause` (per ADR-0001 frozen URL contract),
**And** unknown slugs render a 404-equivalent (redirect to `/` with a console warning; per NFR-S7 strict typed parameters, malformed input is rejected silently in user-facing behavior).

**Given** a user opens `voyager.app/c/v2-neptune?t=1989-08-25T09:23:00Z` from a cold cache,
**When** the app boots,
**Then** the router parses both segments: the chapter slug is resolved to the `v2-neptune` spec from `ALL_CHAPTERS`, the `?t=` parameter is parsed as an ISO-8601 UTC timestamp via the well-tested `iso8601-to-et` function,
**And** the simulation initializes paused at the parsed ET,
**And** if `?t=` is missing, the simulation initializes paused at the chapter's `anchorEt`,
**And** if the parsed `?t=` is outside the chapter's `[windowStartEt, windowEndEt]` range, the simulation still initializes at the requested ET but `ChapterDirector` will recompute the active chapter based on `currentEt` (no error UI).

**Given** the user is anywhere in the app,
**When** chapter activation occurs via marker click (Story 2.2), chapter index selection (Story 2.3), or `1`–`9` shortcut,
**Then** the URL updates via `history.pushState` to `/c/<slug>?t=<anchorEt-as-ISO>`,
**And** the browser's back button returns to the prior route (homepage or prior chapter),
**And** during free scrubbing within a chapter, the `?t=` query parameter updates via `history.replaceState` (throttled at 250ms as in Story 1.9) — no history pollution during scrubs.

**Given** the URL writeback,
**When** the user crosses a chapter window boundary mid-scrub,
**Then** the URL path updates from `/c/<old-slug>` to `/c/<new-slug>` via `replaceState` (not `pushState` — boundary-crossing mid-scrub is not a back-button-able event),
**And** when the simulation enters a cruise period outside any chapter, the URL reverts to `/?t=<currentEt-as-ISO>` (homepage form with timestamp).

**Given** the URL contract is part of the public API surface,
**When** I inspect `docs/url-contract.md`,
**Then** the document records the canonical slug list, the `?t=` ISO-8601 parameter format, the `?embed=true` parameter (Story 2.5), and a stability commitment: chapter slugs and the `?t=` shape will not change in any non-major release,
**And** the About page from Story 2.7 links to or summarizes this contract.

---

### Story 2.5: `?embed=true` Chrome-less Mode

As a museum curator (Hanno, J4),
I want any chapter URL to render chrome-less when I append `?embed=true` so I can embed deep-linked moments in kiosk software without a bespoke build,
So that institutional adoption is friction-free, fulfilling FR40, NFR-S7 (strict-boolean parse), and the AR15 / Step 6c contract.

**Acceptance Criteria:**

**Given** the boot sequence parses URL parameters,
**When** the URL contains `?embed=true` (literal lowercase `true` only),
**Then** an `EmbedModeState` singleton is set to `{ enabled: true }` at boot,
**And** any other value (`?embed=1`, `?embed=yes`, `?embed=TRUE`, `?embed=on`) parses as `enabled: false` (strict-boolean per NFR-S7),
**And** `EmbedModeState` is immutable for the session — toggling at runtime is not possible.

**Given** `EmbedModeState.enabled === true`,
**When** the app renders,
**Then** the following chrome elements are not added to the DOM (not merely hidden via CSS): site logo, footer, share button, chapter-index toggle button, About-page link, methodology link, help-overlay toggle icon,
**And** the canvas, `<v-hud>`, `<v-chapter-copy>`, `<v-timeline-scrubber>`, `<v-play-button>`, `<v-speed-multiplier>`, and `<v-audio-toggle>` continue to render normally (these are the simulation, not chrome),
**And** each chrome Web Component reads `EmbedModeState` via constructor injection and short-circuits its render method when embed mode is enabled.

**Given** embed mode is enabled,
**When** a screen reader user navigates the page,
**Then** ARIA labels, `aria-live` regions, and focus management still function on the remaining elements (HUD, scrubber, play button, speed multiplier),
**And** all keyboard shortcuts (`Space`, `←/→`, `Home/End`, `+/-`, `H`) still work,
**And** the `M` (chapter index), `A` (About), and `?` (help) shortcuts are no-ops because those elements are not in the DOM.

**Given** the embed contract is documented,
**When** I inspect `docs/url-contract.md` and the About page's "Embed contract" section (Story 2.7),
**Then** both surfaces document the `?embed=true` parameter, the strict-boolean parse, and the explicit list of stripped chrome elements,
**And** the URL contract commits to stability of this list for kiosks built against the v1 contract.

**Given** I open `voyager.app/c/pale-blue-dot?t=1990-02-14T00:00Z&embed=true` in a borderless browser window,
**When** the page renders,
**Then** no logo, footer, share button, chapter-index button, About link, methodology link, or help icon is visible,
**And** the canvas + HUD + scrubber + chapter copy fill the viewport,
**And** the touchscreen scrubber drag still works correctly (Tier 2 touch parity from Story 1.9).

---

### Story 2.6: Pre-rendered Open Graph Cards per Chapter

As a sharing visitor (Maya, J2),
I want pasting a chapter URL into iMessage, Slack, Twitter, or Discord to show a preview image of the exact scene the link points to,
So that the OG card is a communication vector that propagates the artifact through messaging apps, fulfilling FR39.

**Acceptance Criteria:**

**Given** a post-build script `web/scripts/og-cards.ts`,
**When** CI runs it after `npm run build`,
**Then** it boots a Playwright headless Chromium against the built `web/dist/` site served by a local static file server,
**And** for each chapter in `ALL_CHAPTERS`, it navigates to `/c/<slug>?t=<anchorEt-as-ISO>` (omitting PBD if Epic 5 hasn't filled the dedicated module — placeholder OG card is acceptable in this story; PBD's real OG card is generated in Epic 5),
**And** captures a 1200×630 PNG screenshot at the chapter's anchor instant,
**And** saves to `web/dist/og/<chapter-slug>.<hash>.png`.

**Given** the built site's HTML,
**When** I inspect each chapter route's served HTML,
**Then** the `<head>` includes per-chapter Open Graph meta tags: `og:image` pointing to the chapter's content-hashed OG PNG, `og:title` (chapter editorial name + " — Voyager"), `og:description` (one-sentence chapter summary), `og:url` (canonical chapter URL), `og:type` `website`,
**And** Twitter Card meta tags are present: `twitter:card summary_large_image`, `twitter:image`, `twitter:title`, `twitter:description`,
**And** the homepage `/` carries default OG metadata (V1 turn-around frame from PBD is the suggested default per the PRD's HN-submission scenario, but any v1-launch scene is acceptable as a placeholder until Epic 5).

**Given** CI verifies OG card completeness,
**When** the build step finishes,
**Then** a CI assertion fails if any chapter's OG card PNG is missing from `web/dist/og/`,
**And** the assertion counts exactly 11 PNGs (matching `ALL_CHAPTERS.length`).

**Given** an OG card is requested by a social platform crawler,
**When** I `curl -A "facebookexternalhit/1.1" https://voyager.app/c/v2-neptune` and parse the response HTML,
**Then** the meta tags resolve to the correct content-hashed OG PNG URL,
**And** the PNG itself returns HTTP 200 with `Cache-Control: public, max-age=31536000, immutable`.

---

### Story 2.7: `<v-about-page>` and `<v-attribution-panel>`

As a curious visitor (any persona),
I want a discoverable About / Methodology page that explains the data sources, validation tolerances, and embed contract, plus a clear attribution surface for every third-party asset,
So that scientific honesty is surfaced as a register (not as caveats) and curators can audit attribution before institutional embedding, fulfilling FR47, FR48 (UI surface), UX-DR18, UX-DR19.

**Acceptance Criteria:**

**Given** the `/about` route is registered in the router from Story 2.4,
**When** I navigate to `voyager.app/about`,
**Then** `<v-about-page>` renders a Light-DOM editorial layout in a single column with `max-width: 60ch`, centered horizontally, generous vertical spacing,
**And** the typography uses `--v-font-sans` (Inter) for headings — `<h1>` at `--v-size-about-heading-lg` weight 400, `<h2>` at `--v-size-about-heading` weight 500, `<h3>` at `--v-size-about-heading-sm` — and `--v-font-serif` (Source Serif 4) for body at `--v-size-about-body` with line-height 1.55.

**Given** the page content structure,
**When** I read the page top to bottom,
**Then** the sections appear in this order: H1 "Voyager — About"; H2 "About the project" (~200 words of editorial prose); H2 "Data sources" (table or list listing NAIF SPICE kernels, PDS Rings Node CK products, NASA 3D Resources, USGS Astrogeology, Björn Jónsson planetary textures, NASA Photojournal, Voyager Golden Record); H2 "Validation" (tolerance table: trajectory max ≤ 20 km / RMS ≤ 5 km, attitude ≤ 1 mrad, frame rate ≥ 60 FPS); H2 "Attribution" (embedded `<v-attribution-panel>`); H2 "Embed contract" (documents `?embed=true` parameter, the URL slug list, and the stability commitment from Story 2.4 / 2.5); H2 "Methodology" (links to underlying technical research document and GitHub repo if public),
**And** inline code / URLs use `--v-font-mono` in `--v-color-accent`.

**Given** `<v-attribution-panel>` rendered inside the About page,
**When** I inspect the DOM,
**Then** it is a `<dl>` semantic definition list with `<dt>` source-name pairs and `<dd>` license/usage statements,
**And** the entries are: "NAIF SPICE kernels" (NASA public domain, trajectory + attitude data from naif.jpl.nasa.gov), "PDS Rings Node CK products" (public domain, SETI's PDS Rings Node with Mitch Gordan QMW SEDR credit), "NASA 3D Resources — Voyager spacecraft model" (NASA public domain), "Björn Jónsson planetary textures" (attribution required; per-asset license terms documented in `THIRD_PARTY.md`), "USGS Astrogeology — planetary base maps" (public domain), "Voyager Golden Record audio" (NASA public domain), "NASA Planetary Photojournal — Pale Blue Dot composite plates" (public domain),
**And** each source name links to its canonical URL where applicable.

**Given** the homepage,
**When** I render the footer (in non-embed mode),
**Then** a small "Attributions" link at the footer routes to `/about#attribution`,
**And** the link is keyboard-tab-focusable and uses the global focus ring.

**Given** the About page's accessibility,
**When** I run axe-core against `/about`,
**Then** zero `critical` or `serious` violations are reported,
**And** heading hierarchy is correctly nested (no skipped levels),
**And** tables within "Data sources" and "Validation" have proper `<caption>`, `<thead>`, `<th scope>` semantics.

---

### Story 2.8: `<v-help-overlay>` Modal with Full Keyboard Shortcut Inventory

As any visitor,
I want to press `?` and see the complete keyboard shortcut inventory in a modal dialog,
So that keyboard discoverability is opt-in (not pushed), fulfilling UX-DR16, UX-DR27, UX-DR23, FR45.

**Acceptance Criteria:**

**Given** the top-right corner of the viewport,
**When** the app is rendered (non-embed mode),
**Then** a small `<button>` icon (quieter than the chapter-index icon) is visible with `aria-label="Open keyboard shortcuts help"`, `aria-expanded="false"`, `aria-controls="help-overlay"`,
**And** pressing the global `?` keyboard shortcut from anywhere (no text input focused) opens the same overlay,
**And** in embed mode (Story 2.5) the icon is not rendered but the `?` shortcut still works (or is disabled — implementation choice, AC: behavior is consistent with the embed contract; current decision: `?` is a no-op in embed mode because the chrome icon is gone).

**Given** the overlay opens,
**When** I inspect the DOM,
**Then** it implements WAI-ARIA Dialog (Modal) pattern: `<div role="dialog" aria-modal="true" aria-labelledby="help-title">` with the scrim using `--v-color-overlay-scrim`,
**And** the dialog renders centered with ~480px width, near-bg fill (`#0f1419`), thin 1px `--v-color-fg-quiet` border,
**And** the open animation is a 200ms scrim fade-in + 0.96 → 1.0 scale on the dialog (instant under reduced motion).

**Given** the overlay content,
**When** I read it,
**Then** four sections render: H2 "Playback" (`Space` = play/pause, `←/→` = scrub by 1 unit, `Shift+←/→` = scrub by 10, `Home/End` = mission start/end), H2 "Navigation" (`1–9` = jump to chapter N, `M` = open chapter index, `A` = open About page), H2 "Speed" (`+/-` = adjust by decade-stop, `Shift+/-` = adjust by 5%, `1×` reset to real-time — note: `1×` reset is a placeholder convention; if not implemented, the help text accurately reflects what works), H2 "Display" (`H` = toggle HUD, `G` = toggle Golden Record audio, `?` = this help, `Esc` = close any overlay),
**And** shortcut keys are rendered in mono inside subtle 1px-bordered boxes; descriptions are sans `--v-color-fg-muted`.

**Given** focus is contained via the `focus-trap` library,
**When** the overlay opens,
**Then** initial focus is on the close button at bottom-right,
**And** tab cycles only within the overlay,
**And** `Esc` closes the overlay and restores focus to the triggering element (icon or implicit body if opened via `?`).

**Given** the `A` keyboard shortcut,
**When** I press `A` from anywhere (no text input focused, no overlay open),
**Then** the router navigates to `/about` via `pushState`.

---

### Story 2.9: Heliopause Text-Cards and Instrument-Shutoff HUD Integration

As a visitor scrubbing through the long cruise,
I want the V1 (2012-08-25) and V2 (2018-11-05) heliopause crossings to appear as text-card chapters with explanatory copy, and the HUD to reflect the historical instrument-shutoff schedule as instruments go offline across the decades,
So that the bass-note elegy is felt and FR29, FR30 (text-card content), FR35 are operational.

**Acceptance Criteria:**

**Given** the chapter copy infrastructure from `<v-chapter-copy>` (a Light DOM right-side panel — full implementation deferred to Epic 4, but the Story 2.1 chapter system can already drive content rendering),
**When** the simulation enters the V1 heliopause window (around 2012-08-25),
**Then** a text-card chapter copy appears with the lede "V1 heliopause." followed by ~80–120 words of hand-written prose describing the cosmic-ray spike and solar-wind drop signatures that mark the boundary crossing (per `MISSION_FACTS.md` sourcing),
**And** the same behavior applies for V2's 2018-11-05 heliopause,
**And** the trajectory line continues past the boundary unchanged (no special visualization — the chapter copy provides the meaning, not a 3D effect),
**And** under `prefers-reduced-motion: reduce`, the copy appears as an instant cut (per Story 1.7 token rules).

**Given** `MISSION_FACTS.md` is committed,
**When** I open it,
**Then** the file documents primary-source citations for: V1 launch date (1977-09-05), V2 launch date (1977-08-20), all six encounter closest-approach datetimes, both heliopause crossing datetimes, and the historical instrument shutoff dates per spacecraft (ISS, UVS, PLS, LECP),
**And** each fact has a source citation (NASA press release, NAIF documentation, or peer-reviewed publication).

**Given** `<v-hud-instruments>` was a placeholder in Story 1.11,
**When** the simulation is at any ET,
**Then** the component reads the per-spacecraft instrument-shutoff schedule from a module that mirrors `MISSION_FACTS.md`,
**And** renders two rows: "V1 ISS · UVS · PLS · LECP" and "V2 ISS · UVS · PLS · LECP",
**And** active instruments use `--v-color-fg-muted`,
**And** instruments shut off at the current ET render with `text-decoration: line-through` in `--v-color-fg-quiet`,
**And** as the simulation crosses each instrument's historical shutoff date, the corresponding instrument visibly transitions from active to strikethrough (the bass-note elegy made legible).

**Given** the heliopause chapters are markers on the scrubber from Story 2.2,
**When** I click the V1H or V2H marker,
**Then** the simulation jumps paused to the heliopause anchor date,
**And** the chapter copy text-card appears,
**And** the URL updates to `/c/v1-heliopause` or `/c/v2-heliopause`.

**Given** the heliopause chapters have no body-centered camera framing or 3D-scene change (necessarily textual per PRD),
**When** the simulation crosses the boundary at any speed,
**Then** the existing heliocentric camera framing is preserved,
**And** no view-frame transition fires (those are Epic 4's encounter machinery),
**And** the chapter copy fades in/out at the window boundaries per the `<v-chapter-copy>` infrastructure.

---

## Epic 3: Attitude Reconstruction — the Differentiator

At every moment of the mission, each spacecraft's orientation is reconstructed: CK-driven during encounter windows (sub-milliradian), synthesized Earth-pointing HGA during cruise — with a quiet "ATT CK reconstructed" / "ATT Synthesized" HUD indicator that never lies about the substrate. The scan platform physically articulates and the narrow-angle boresight cone is visible whenever a CK window is in view.

### Story 3.1: CK Kernel Bake Pipeline and Sign-Flip Walk Pre-Bake

As the project maintainer,
I want the Phase 0 CK kernels extracted into deterministic VTRJ attitude binaries with quaternion sign-flip discontinuities pre-walked into a continuous representation,
So that the web-side `AttitudeService` can SLERP-interpolate without artifacts at sample knots and Story 3.7's L2 validation gate has bake outputs to compare against, fulfilling FR20 baseline and producing the artifacts that FR15/16/17 consume.

**Acceptance Criteria:**

**Given** the kernels from Story 1.3 (`vgr1_super_v2.bc`, `vgr2_super_v2.bc`, PDS Rings Node supplements, FK frame kernels),
**When** I run `just bake-attitude` (or it runs as part of `just bake` from Story 1.4),
**Then** `bake/src/ck_sample.py` samples bus quaternions and scan-platform quaternions for each spacecraft via SpiceyPy `ckgp` over a deterministic ET grid covering all documented CK windows from `docs/kernels/ckbrief-inventory.md`,
**And** the grid cadence matches the encounter cadence schedule. **Amended 2026-05-21 (Story 3.1 slow-tier calibration):** uniform 5-second cadence across closest_approach ±2 days, single band per encounter file. The original wording ("1-minute during flyby ±2 days; 10-second during closest approach ±1 hour; daily during CK-covered cruise segments") was inadequate — real CK content at V2 Uranus Miranda imaging (~4 hr pre-CA) drives the scan platform faster than 1 mrad/min, so the outer 1-min band breached NFR-P10 by 32× when first measured against real kernels. Cruise-period attitude is synthesized (Story 3.2 HGA-Earth-pointing), NOT baked from CK, so daily cruise samples are correctly excluded from encounter files. See voyager-skill-rules.md Rule 5 (planning artifacts amended in place) and ADR-0004 § Body Layout per Kind for the canonical schema.,
**And** outputs are written as VTRJ files: `bake/out/v1_bus_attitude.<window>.bin.br`, `bake/out/v1_platform_attitude.<window>.bin.br`, `bake/out/v2_bus_attitude.<window>.bin.br`, `bake/out/v2_platform_attitude.<window>.bin.br`, one file per `(spacecraft × CK window × kind)` tuple per AR6.

**Given** raw CK output may contain quaternion sign flips (where consecutive samples have opposite signs representing the same rotation),
**When** the sign-flip walk pre-bake runs,
**Then** the bake module `bake/src/quat_continuity.py` traverses each quaternion stream in time order and negates samples whose dot product with the prior sample is negative,
**And** the walked output guarantees `dot(q[i], q[i+1]) >= 0` for every consecutive pair (continuous representation suitable for SLERP),
**And** a unit test in `bake/tests/test_quat_continuity.py` verifies this property on a synthetic adversarial sign-flipping input.

**Given** the attitude bake completes,
**When** I inspect `bake/out/manifest.json`,
**Then** the manifest's `bodies[].files` array now includes per-window entries for `kind: "bus_attitude"` and `kind: "platform_attitude"` alongside the `kind: "trajectory"` entries from Story 1.4,
**And** each entry records `etStart`, `etEnd`, `cadenceSeconds`, `url`, and `provenance: "ck"`,
**And** the VTRJ binary headers use the same 40-byte layout as Story 1.4 trajectory files, with the body-id field encoding the (spacecraft, kind) tuple.

**Given** the bake is deterministic (NFR-R4 inherited),
**When** I run `just bake-attitude` twice on identical inputs,
**Then** every output `.bin.br` file has byte-identical SHA-256,
**And** the bake-determinism CI gate from Story 1.14 covers attitude binaries (extend the check to include the attitude file set).

**Given** the L1 Python harness from Story 1.4 has been extended to attitude,
**When** `just validate` runs,
**Then** it now also validates that interpolating the baked attitude binaries via SciPy SLERP at random in-bounds ETs matches direct SpiceyPy `ckgp` queries to within ≤ 0.05° (≤ 1 mrad) per NFR-P10,
**And** the validation report adds an "Attitude accuracy" section per spacecraft per CK window.

---

### Story 3.2: AttitudeService SLERP Interpolation and Synthesized HGA Cruise Attitude

As a visitor at any ET in the mission,
I want the simulation to always know how each spacecraft is oriented — CK-driven during encounter windows, synthesized Earth-pointing during cruise — without silent fallback,
So that the per-frame render loop (Story 3.4) and provenance indicator (Story 3.6) have a single trusted source, fulfilling FR15, FR18, FR19 (data layer), FR20.

**Acceptance Criteria:**

**Given** the asset manifest from Story 1.6 now includes the attitude file entries from Story 3.1,
**When** `web/src/services/attitude-service.ts` boots,
**Then** it consumes attitude VTRJ chunks via the same `ManifestLoader` + brotli-decode + DataView path as `EphemerisService`,
**And** exposes the API: `getBusQuat(spacecraftId, et): Quaternion`, `getPlatformQuat(spacecraftId, et): Quaternion`, `getAttitudeProvenance(spacecraftId, et): 'ck' | 'synthesized'`,
**And** all returned quaternions use a branded TypeScript `Quaternion` type to enforce unit-safety at API boundaries.

**Given** the current ET falls inside a CK coverage window per the manifest,
**When** `getBusQuat(spacecraftId, et)` or `getPlatformQuat(spacecraftId, et)` is called,
**Then** the service performs SLERP interpolation between the two nearest sample points from the pre-walked CK binary (Story 3.1 guarantees `dot(q[i], q[i+1]) >= 0`),
**And** `getAttitudeProvenance(spacecraftId, et)` returns `'ck'`.

**Given** the current ET falls outside any CK coverage window for a spacecraft,
**When** `getBusQuat(spacecraftId, et)` is called,
**Then** the service synthesizes Earth-pointing HGA attitude: compute Sun→S/C vector and S/C→Earth vector via `EphemerisService.getPosition`, construct an orientation matrix where the HGA boresight (defined by the FK frame rotation from `vg1_v02.tf` or `vg2_v02.tf`, hardcoded in `web/src/services/fk-constants.ts` per Phase 0 inspection from Story 1.3) is aligned with the S/C→Earth direction, with the secondary axis constrained by the solar panel orientation,
**And** `getPlatformQuat(spacecraftId, et)` returns the platform's resting orientation relative to the bus (a fixed quaternion captured during Phase 0; no articulation during cruise),
**And** `getAttitudeProvenance(spacecraftId, et)` returns `'synthesized'`.

**Given** the FK rotation constants and boresight definitions,
**When** I inspect `web/src/services/fk-constants.ts`,
**Then** the file exports the FK frame IDs (e.g., `VG1_HGA`, `VG1_SC_BUS`, `VG1_NA_CAMERA`) and the rotation values relative to the parent frame, copied verbatim from the FK kernels with inline comments citing the kernel filename and line number,
**And** each constant is marked `as const` and the file is type-safe.

**Given** synthesized cruise attitude must transition seamlessly into CK windows,
**When** the simulation scrubs across a CK window boundary,
**Then** the service does not silently substitute synthesized data when CK data is available,
**And** at the boundary instant, the provenance flips from `'synthesized'` to `'ck'` exactly when the manifest declares the boundary (no smoothing across the regime change — the indicator in Story 3.6 announces the transition).

**Given** the service is unit-tested,
**When** I run `npm test -- attitude-service`,
**Then** Vitest tests cover: SLERP interpolation correctness against ground-truth quaternions, synthesized-attitude orthonormality of the constructed orientation matrix, provenance correctness at CK window boundaries (including the boundary instant itself), and behavior at ETs outside the mission window (graceful return of synthesized attitude or a documented error).

---

### Story 3.3: Articulated Spacecraft GLB with Scan-Platform Node

As a visitor inspecting either spacecraft up close,
I want the Voyager 3D model to have a named scan-platform node that can be independently rotated relative to the bus, and a 4-level LOD chain so the model holds together from sub-meter inspection to cruise-scale silhouette,
So that Story 3.4 has rigging to apply attitude data to, and rendering performance is preserved across zoom levels, fulfilling FR16 (rigging foundation) and replacing Story 1.12's placeholder single-LOD model.

**Acceptance Criteria:**

**Given** the NASA 3D Resources Voyager model (or a properly-licensed equivalent) is the basis,
**When** I inspect `web/public/models/voyager.glb`,
**Then** the model is glTF 2.0 with a named hierarchy: `BUS` is the root node, `SCAN_PLATFORM` is a direct child of `BUS` with its pivot at the historical scan-platform articulation axis, `HGA` is a child of `BUS` rotated per FK to point at the spacecraft's nominal +Z (Earth-pointing reference),
**And** the model's metric scale matches reality (the spacecraft's longest dimension is ~3.7 m, encoded as 0.0037 km in render-space at SCALE=1),
**And** textures use KTX2 compression via `toktx`.

**Given** the asset pipeline,
**When** I inspect `bake/scripts/build_glb.ts` (or the equivalent under `web/scripts/`),
**Then** the script uses `gltf-transform` to produce the final GLB from the upstream NASA model: validates the node hierarchy, applies KTX2 texture compression, strips animation tracks not needed for v1, optimizes the mesh (deduplicate, weld),
**And** outputs four LOD variants — `voyager-lod0.<hash>.glb` (highest detail, ≤ 2 MB), `voyager-lod1.<hash>.glb`, `voyager-lod2.<hash>.glb`, `voyager-lod3.<hash>.glb` (lowest, simplified silhouette ≤ 100 KB),
**And** each LOD preserves the named `BUS`, `SCAN_PLATFORM`, and `HGA` nodes so attitude application works at any LOD level.

**Given** Three.js `LOD` integration,
**When** the app loads and adds each spacecraft to the scene,
**Then** a `Three.LOD` object wraps the 4-level LOD variants with distance thresholds tuned during this story (e.g., LOD0 within 1 km of camera, LOD1 1–100 km, LOD2 100 km–1 AU, LOD3 beyond 1 AU — final thresholds determined by performance measurement and documented in a code comment with rationale),
**And** the LOD swap is seamless (no popping at thresholds; if popping is visible, the thresholds are widened or a brief cross-fade is implemented),
**And** Story 1.12's single-LOD spacecraft model is replaced — there is now exactly one canonical GLB pipeline per spacecraft.

**Given** the asset manifest now references the LOD GLB set,
**When** the app boots,
**Then** the manifest entry for `voyager-1` and `voyager-2` 3D models lists all four LOD URLs and the canonical pivot/scale metadata,
**And** the loader fetches LOD0 eagerly (for first-paint of nearby cruise) and other LODs on demand as the LOD distance crosses thresholds.

**Given** the model's articulation rigging is intact,
**When** I rotate `SCAN_PLATFORM` programmatically in a developer console test,
**Then** the platform visibly rotates relative to the static `BUS` without any unintended deformation of the rest of the model,
**And** the rotation pivot is at the historically-correct articulation axis (not the platform's geometric center).

---

### Story 3.4: Apply Attitude Per Frame to Both Spacecraft (Bus + Scan Platform)

As a visitor at any moment in the mission,
I want each spacecraft's `BUS` and `SCAN_PLATFORM` to physically articulate per the `AttitudeService` output every frame,
So that the differentiator becomes visible: the scan platform turns during encounters, the bus rotates to maintain Earth-pointing during cruise, and FR15, FR16, FR18, FR20 are operational.

**Acceptance Criteria:**

**Given** the `RenderEngine` per-frame update from Story 1.5,
**When** each frame begins,
**Then** for each spacecraft in `{v1, v2}` the engine calls `AttitudeService.getBusQuat(spacecraftId, currentEt)` and assigns the result to `spacecraftModel.getObjectByName('BUS').quaternion`,
**And** calls `AttitudeService.getPlatformQuat(spacecraftId, currentEt)` and assigns the result to `spacecraftModel.getObjectByName('SCAN_PLATFORM').quaternion`,
**And** the assignment happens after position update from Story 1.12 and before the boresight cone update from Story 3.5.

**Given** the simulation is at ET corresponding to V1 Jupiter encounter (1979-03-05 11:30 UT, inside CK coverage),
**When** I observe the spacecraft model,
**Then** the `SCAN_PLATFORM` is visibly articulated away from its resting position (different orientation from cruise),
**And** scrubbing forward 1 simulated hour at 100× speed shows the platform rotating progressively as historical pointing changes (e.g., tracking Io across the field of view),
**And** no quaternion sign-flip discontinuities are visible at CK sample boundaries (validated by the absence of jumps / flicker; FR20 enforced).

**Given** the simulation is in a cruise period outside CK coverage (e.g., 1995-01-01 between Saturn and the heliopause),
**When** I scrub forward at 10,000× speed,
**Then** the `BUS` is observably rotating to maintain HGA Earth-pointing as Earth's position relative to the spacecraft changes,
**And** the rotation is slow enough at 1× to be sub-perceptual but clearly tracking Earth at high time-warp,
**And** the `SCAN_PLATFORM` stays at its resting orientation during synthesized cruise (no articulation).

**Given** the regime transition between synthesized cruise and CK-covered encounter,
**When** the simulation scrubs into a CK window,
**Then** the spacecraft's orientation may snap to the CK-derived value if synthesized and CK regimes differ at the boundary (no smoothing across the regime change — the indicator from Story 3.6 announces the transition; per the Step 4 / honesty commitment, we do not silently smooth synthesized into CK),
**And** if the snap is visually jarring at 1× during specific encounters, the chapter spec may include a brief blend-in of duration ≤ 200ms documented in an ADR — this is acceptable customization; the default behavior is "snap at boundary."

**Given** the per-frame attitude application,
**When** I run a 30-minute browser session per NFR-R5,
**Then** the WebGL resource leaks do not accumulate to cause >5% frame rate degradation,
**And** quaternion objects are reused via a per-frame scratch pool, not allocated per call (verified by Chrome DevTools memory profiler showing flat heap during sustained playback).

---

### Story 3.5: Narrow-Angle Camera Boresight Cone

As a visitor watching an encounter,
I want a wireframe cone extending from the scan platform's narrow-angle camera, oriented per the reconstructed attitude, so I can see what the camera was pointed at moment-to-moment,
So that "see what Voyager saw" becomes visually literal during encounters, fulfilling FR17.

**Acceptance Criteria:**

**Given** the scan-platform node `SCAN_PLATFORM` exists in each spacecraft GLB from Story 3.3,
**When** Story 3.4's per-frame update applies the platform quaternion,
**Then** a `THREE.ConeGeometry` wrapped in a wireframe `LineSegments` material is parented to `SCAN_PLATFORM` for each spacecraft,
**And** the cone's apex sits at the historical narrow-angle camera position (relative to `SCAN_PLATFORM`'s pivot, captured from FK or model metadata during Phase 0; hardcoded with citation in the spacecraft model loader),
**And** the cone's axis is rotated by the `camera-FK-fixed-rotation` constant from `web/src/services/fk-constants.ts` (Story 3.2) so it points along the NA camera's actual boresight direction relative to the platform.

**Given** the cone's geometric parameters,
**When** I inspect the rendered cone,
**Then** its half-angle is 0.21° (matching NA FOV 0.42° × 0.42° per the PRD),
**And** its length is long enough to clearly extend past the spacecraft model at default cruise zoom (e.g., 1000 km in render space) but does not occlude celestial bodies at encounter scale (verified visually in this story),
**And** the visual register is restrained: thin wireframe, low-saturation `--v-color-accent` at low alpha (~0.5), semi-transparent — present but never competing with the canvas.

**Given** the cone is rendered for both V1 and V2,
**When** I scrub to V1 Jupiter encounter (1979-03-05) at 1×,
**Then** I observe the cone aimed at Io as the historical CK data indicates the camera was pointed at Io,
**And** as the encounter progresses (e.g., 1979-03-05 09:00 UT through 13:00 UT), the cone sweeps from Io to Europa to Ganymede to Callisto in 48 simulated hours,
**And** the cone's orientation matches the L2 fixture from Story 3.7 to within 1 mrad.

**Given** the cone during cruise (synthesized attitude regime),
**When** the simulation is at any ET outside CK coverage,
**Then** the cone still renders (it is always parented to `SCAN_PLATFORM` regardless of provenance),
**And** because `SCAN_PLATFORM` is at its resting orientation during synthesized cruise (per Story 3.2), the cone points in a fixed direction relative to the spacecraft body (no historical tracking is implied during cruise — the synthesized regime is honest about not knowing).

**Given** the wide-angle camera is explicitly out of v1 scope per the PRD,
**When** I inspect the model and rendering code,
**Then** only the NA camera boresight cone is rendered,
**And** an ADR (added to the catalogue from Story 1.2) records the wide-angle deferral to v1.1 with the FOV 3.17° × 3.17° parameters noted for future implementation.

---

### Story 3.6: `<v-attitude-indicator>` HUD Provenance Element

As any visitor,
I want a quiet, persistent HUD indicator that tells me whether the spacecraft attitude I'm seeing is CK-reconstructed or synthesized,
So that scientific honesty is felt as register (not as caveats) and FR19, UX-DR10 are operational.

**Acceptance Criteria:**

**Given** the top-right HUD region from Story 1.11,
**When** the app renders (non-embed mode),
**Then** `<v-attitude-indicator>` is rendered inline with `<v-hud-date>`,
**And** the component reads `AttitudeService.getAttitudeProvenance(activeSpacecraftId, currentEt)` per frame.

**Given** the active spacecraft is determined by camera framing,
**When** the camera is in heliocentric view (default cruise),
**Then** the active spacecraft defaults to V1 (the chronological lead),
**And** when the camera enters body-centered framing during an encounter (Epic 4 wires this), the active spacecraft becomes the one owning that encounter (V1 for V1J/V1S/PBD/V1H, V2 for V2J/V2S/V2U/V2N/V2H),
**And** during the V1 launch and V2 launch chapter windows, the active spacecraft is the launching spacecraft,
**And** an event-emitter pattern (`activeSpacecraftChanged`) lets Epic 4's `ChapterDirector`/`ViewFrame` signal which spacecraft the indicator should reflect; this story implements the signal stub with a sensible default and the wiring is completed in Epic 4.

**Given** the provenance is `'ck'`,
**When** the indicator renders,
**Then** it displays "ATT" as a small `--v-color-fg-quiet` uppercase mono label followed by "CK reconstructed" as the value in `--v-color-ck` (muted forest-green),
**And** an optional small filled-circle dot precedes the value in the same color,
**And** the value text is fully readable independently of color (per FR49 / UX-DR no-color-only encoding).

**Given** the provenance is `'synthesized'`,
**When** the indicator renders,
**Then** it displays "ATT" label + "Synthesized (HGA Earth-pointing)" value in `--v-color-synth` (warm gold),
**And** the dot uses the same warm-gold color,
**And** the text "Synthesized" makes the construction explicit without apology.

**Given** the simulation crosses a CK window boundary,
**When** the provenance flips,
**Then** the indicator updates within one frame,
**And** the `aria-live="polite"` region announces the change to screen readers on scrub-stop (per Story 1.11's announcement throttling rules),
**And** the visual transition uses `--v-duration-base` (200ms; 0ms under reduced motion) — color shift only, no flashing or attention-grabbing motion.

**Given** the component's accessibility,
**When** I inspect the DOM,
**Then** it renders `<output aria-label="Attitude data provenance">CK reconstructed</output>` (or "Synthesized (HGA Earth-pointing)"),
**And** axe-core reports zero violations on the indicator in both states.

---

### Story 3.7: L2 JS-vs-SPICE Attitude Consistency Validation in CI

As the project maintainer,
I want a CI gate that asserts the JavaScript `AttitudeService` produces quaternions consistent with SpiceyPy ground truth at fixed-seed sample points inside every CK coverage window,
So that the differentiator's accuracy is gated mechanically and FR55 (L2), NFR-P10 are operational.

**Acceptance Criteria:**

**Given** the Python L2 fixture generator,
**When** `bake/src/l2_attitude_validation.py` runs (as part of `just bake` or its own `just gen-l2-fixture`),
**Then** it samples a fixed-seed set of `(spacecraft, et)` pairs — at least 500 pairs per spacecraft distributed across every CK coverage window from `docs/kernels/ckbrief-inventory.md`,
**And** for each pair, it computes ground-truth bus quaternion via SpiceyPy `pxform` from the spacecraft body frame to J2000 (or equivalent reference frame consistent with the JS service), and ground-truth platform quaternion via `ckgp` for the scan-platform frame,
**And** writes `bake/out/l2-attitude-fixture.json` containing the sample list with `{spacecraftId, et, ground_truth_bus_quat, ground_truth_platform_quat}` records,
**And** the fixture is deterministic across reruns (fixed RNG seed; sorted records).

**Given** the corresponding Vitest test,
**When** I run `npm test -- attitude-l2` in `web/`,
**Then** the test loads `bake/out/l2-attitude-fixture.json` (committed to the repo as test data, or fetched from `bake/out/` in the CI workflow before the test stage),
**And** for each fixture record, calls `AttitudeService.getBusQuat(spacecraftId, et)` and `AttitudeService.getPlatformQuat(spacecraftId, et)`,
**And** computes the angular difference between the JS-returned quaternion and the ground-truth quaternion (via `2 * acos(|dot(q_js, q_truth)|)`),
**And** asserts that every angular difference is ≤ 1 milliradian (0.05°, 100 NA-pixel error) per NFR-P10,
**And** the test fails with a descriptive message listing the worst-case sample's spacecraft, ET, and angular error if any threshold is exceeded.

**Given** the CI workflow from Story 1.14,
**When** the workflow runs,
**Then** the L2 attitude validation is added as a CI step after L1 and L3 (per the Story 1.14 graph) and before build,
**And** the workflow fails on any L2 assertion failure,
**And** the total wall-clock time for L1 + L2 + L3 remains ≤ 5 minutes (NFR-M4 budget preserved).

**Given** the fixture must regenerate when CK kernels change,
**When** Epic 7's kernel-drift report workflow detects an attitude binary change,
**Then** the drift report flow includes a recommendation to regenerate the L2 fixture (and Epic 7 may automate this),
**And** the fixture's deterministic regeneration is documented in `docs/kernels/README.md` and in the L2 validation script's docstring.

**Given** the L2 fixture as committed test data,
**When** I inspect its size,
**Then** the JSON is ≤ 2 MB committed (or stored in Git LFS if larger),
**And** the validation script avoids committing redundant data by deduplicating identical ETs across multiple spacecraft.

---

## Epic 4: Encounter Chapters — All Six Gas-Giant Flybys

A visitor can scrub to any of the six encounters (V1/V2 Jupiter, V1/V2 Saturn, V2 Uranus, V2 Neptune) and experience body-centered cinematic framing, smooth view-frame transitions, accurate gravity-assist bends, hand-written chapter copy, and the detail-scrubber sliding in for fine-grained control. The V2 post-Neptune trajectory visibly bends south of the ecliptic plane.

### Story 4.1: ViewFrame Service and Translation-Only Smoothstep Blend

As a visitor scrubbing into an encounter,
I want the camera origin to smoothly transition from heliocentric to body-centered framing over a ±2-day window with no rotation flips,
So that the entry feels cinematic and FR31 has its substrate, fulfilling AR11 and the Pattern-4 commitment from the PRD.

**Acceptance Criteria:**

**Given** the service module,
**When** I inspect `web/src/services/view-frame.ts`,
**Then** it exposes `getTransform(et: ET, activeChapter: ChapterSpec | null): ViewFrameTransform` returning the J2000 → render-space origin offset (a translation-only `Vector3`),
**And** during cruise (no active chapter window or chapter is a non-encounter), the transform returns an identity-shifted-by-camera origin (preserving the heliocentric frame),
**And** during the `entering`/`exiting` substates of an encounter chapter, the transform applies a smoothstep alpha [0,1] over the ±2-day blend window where alpha=0 at window edge and alpha=1 at the inner boundary (then constant at alpha=1 during the `held` substate),
**And** the blend origin lerps between heliocentric (Sun-centered after floating-origin) and body-centered (encounter's target body — Jupiter for V1J/V2J, Saturn for V1S/V2S, Uranus for V2U, Neptune for V2N).

**Given** the per-frame render loop from Story 1.5,
**When** each frame begins,
**Then** the `RenderEngine` calls `ViewFrame.getTransform(currentEt, ChapterDirector.activeChapter)` and applies the returned origin offset to the floating-origin computation (before `WorldGroup.position = -cameraWorldPos / SCALE`),
**And** the camera's transform itself is unchanged by this story — only the world-space origin shifts.

**Given** the blend is translation-only,
**When** the simulation scrubs across an encounter boundary,
**Then** no quaternion rotation blend is applied (rotation-blend deferred per AR11),
**And** an ADR exists in the catalogue documenting the deferred rotation-blend decision with the explicit revisit trigger: "if Jupiter's tilt feels off in playtesting, revisit with quaternion rotation-blend in v1.1".

**Given** the smoothstep alpha,
**When** I unit-test the `ViewFrame` service with a fixture of ETs crossing the V1 Jupiter encounter window,
**Then** alpha=0 at `windowStartEt - 2*DAY`, alpha rises smoothly via `smoothstep(0,1,t)` to alpha=1 at `windowStartEt`, holds at alpha=1 throughout the `held` substate, and reverses symmetrically on exit,
**And** the lerp is continuous (no jumps at substate boundaries).

**Given** the ChapterDirector from Story 2.1,
**When** scrubbing crosses ±2 days from an encounter's window boundary,
**Then** the director transitions the chapter to `entering` (or `exiting` when leaving), and the `ViewFrame` smoothstep is keyed off the substate timing,
**And** under reduced motion the blend collapses to an instant cut at the window boundary (per the global duration-collapse rule from Story 1.7).

---

### Story 4.2: VoyagerCameraController — Manual Override and Restore Default

As a visitor exploring an encounter,
I want to orbit, pan, and zoom the camera freely and snap back to the chapter's cinematic framing with one action,
So that I can inspect what I want without losing the curated view, fulfilling FR32, FR33, and FR13 (zoom range enforced).

**Acceptance Criteria:**

**Given** a custom camera controller,
**When** I inspect `web/src/render/voyager-camera-controller.ts`,
**Then** it is a hand-rolled controller (not `THREE.OrbitControls`) implementing per AR / Decision 3c: zoom range 1 m to 200 AU enforced as hard clamps; no free roll without an explicit modifier (e.g., `Shift+drag`),
**And** pointer-drag = orbit around the camera's current target (the active body in body-centered framing, or the Sun in heliocentric),
**And** wheel / pinch = zoom (log-scale step per notch),
**And** right-drag (desktop) or two-finger drag (touch) = pan,
**And** Pointer Events API is used via `primitives/pointer-events.ts` for unified mouse + touch + pen.

**Given** the user takes manual camera control,
**When** any orbit/pan/zoom gesture fires on the camera (not on the scrubber or HUD),
**Then** the controller sets `RenderEngine.manualCameraActive = true`,
**And** `ViewFrame.getTransform` continues to compute the world-origin offset, but the camera's transform (`camera.position`, `camera.quaternion`) is now owned by the controller, not by chapter-driven framing,
**And** the cursor changes to `grabbing` during the drag.

**Given** manual camera control is active,
**When** I press `R` from anywhere (no text input focused) or click a small "↺" affordance positioned bottom-right adjacent to `<v-speed-multiplier>`,
**Then** the controller animates the camera back to the active chapter's default framing over `--v-duration-slow` (400ms; 0ms under reduced motion),
**And** on animation completion, `RenderEngine.manualCameraActive = false` and chapter-driven framing resumes (so subsequent chapter transitions auto-frame normally),
**And** if there is no active chapter (cruise), `R` restores to the default heliocentric framing (Sun-centered, distance tuned to show both V1 + V2 + the inner planets).

**Given** the restore affordance,
**When** I inspect the DOM,
**Then** the affordance renders as a native `<button aria-label="Restore default camera framing">` with a ↺ glyph, visible only when `manualCameraActive === true`,
**And** the button is hidden via display:none (not opacity) when manual mode is inactive (no DOM cost during cruise),
**And** in embed mode the affordance still renders (it controls the simulation, not the chrome — distinct from chapter-index/About/help icons).

**Given** the zoom range,
**When** I zoom in past the lower bound or out past the upper bound,
**Then** the camera distance clamps at 1 m (inner) and 200 AU (outer) without breaking the controller,
**And** the FR13 sub-meter inspection through 165 AU range is fully covered with margin,
**And** reverse-Z (Story 1.5) keeps the rendering precision stable across the entire range.

---

### Story 4.3: Cadence-Shift Trajectory Chunks and 4k→8k Texture Upgrade

As a visitor scrubbing into an encounter,
I want the simulation's trajectory cadence to silently refine from daily (cruise) through 10-second (closest approach) and the gas-giant texture to upgrade from 4k to 8k, without ever seeing a loading UI,
So that the chapter feels seamlessly more detailed and FR7 / NFR-P6 invisible-loading hold, supported by AR13 MissionPhaseFSM.

**Acceptance Criteria:**

**Given** the bake pipeline from Story 1.4,
**When** I run `just bake`,
**Then** the cadence-refined chunk strategy from AR5 / AR6 is implemented: cruise baseline at daily cadence; per-encounter window produces additional chunks at hourly cadence (±30 days from closest approach), 1-minute cadence (±2 days), and 10-second cadence (±1 hour),
**And** `bake/out/manifest.json` indexes each chunk per AR6 as one VTRJ file per `(body × time-window × kind)` tuple,
**And** the chunks overlap by one sample at boundaries so the runtime interpolation never has a gap.

**Given** the runtime `EphemerisService` from Story 1.6,
**When** scrubbing approaches the boundary of the currently-loaded chunk,
**Then** chunk-prefetch fires no later than the last 10% of the current chunk's time window (NFR-P6),
**And** the next chunk loads via fetch + brotli-decode + DataView in the background,
**And** at the boundary, the service transparently switches to the new chunk; if the new chunk is not yet loaded when the simulation reaches the boundary, speed auto-caps to 0 per Story 1.10's contract until loading completes.

**Given** the `MissionPhaseFSM` module (separate concern from `ChapterDirector` per AR13),
**When** I inspect `web/src/services/mission-phase-fsm.ts`,
**Then** it tracks per-body SOI (sphere-of-influence) entry/exit for each gas-giant encounter,
**And** emits `soiEntered(bodyId)` events that `RenderEngine.upgradePlanetTexture(bodyId)` subscribes to,
**And** also tracks the instrument-shutoff schedule (data already wired in Story 2.9; FSM is the canonical source of the active/shutoff state per ET) — concerns are kept separate from chapter copy and from view-frame.

**Given** an SOI entry fires (e.g., entering Jupiter SOI before V1J encounter),
**When** `RenderEngine.upgradePlanetTexture(bodyId)` runs,
**Then** the 8k KTX2 texture for that body is async-loaded from the asset manifest,
**And** on load completion, the body's material is atomically swapped (no flicker, no visible blend),
**And** if GPU memory probe (Story 1.5) reports insufficient memory for the 8k texture, the upgrade is silently skipped per NFR-C6 and the 4k texture remains active (no lazy upgrade later in the session).

**Given** moon textures for encounter targets,
**When** the simulation enters an encounter window,
**Then** 2k textures for the relevant moons (Io, Europa, Ganymede, Callisto for V1J/V2J; Titan, Iapetus, Hyperion for V1S/V2S; Miranda, Ariel, Umbriel, Titania, Oberon for V2U; Triton for V2N) load lazily and are added to the scene with their SPICE-derived positions,
**And** outside encounter windows the moon meshes are removed from the scene (or rendered at LOD3 silhouette only) to preserve performance.

**Given** the loading discipline,
**When** I scrub through an encounter at any speed,
**Then** no spinner, no progress bar, no "loading…" text appears anywhere in the UI (UX-DR32 invisible loading),
**And** the only user-visible signal of loading is the speed multiplier auto-capping briefly if a chunk is not ready (per Story 1.10).

---

### Story 4.4: `<v-timeline-scrubber variant="detail">` Detail-Scrubber Variant

As a visitor inside an encounter window,
I want a second, finer-grained scrubber to slide into view above the mission scrubber so I can scrub the encounter at chapter-scale cadence without losing the mission-wide spine,
So that the dual-scrubber pattern from UX-DR31 is operational and FR1 sub-day scrub during encounters is enabled.

**Acceptance Criteria:**

**Given** the existing `<v-timeline-scrubber>` component from Story 1.9,
**When** I render the same component with `variant="detail"` and `range-start`/`range-end` set to a chapter's window,
**Then** the visual treatment matches the detail anatomy from the UX spec: 4px-tall track with background `rgba(212,160,23,0.18)`, 10px solid `--v-color-accent` circle thumb (no border ring),
**And** the chapter's date-range labels render at the track ends as uppercase mono in `--v-color-accent` (e.g., "Feb 28" left, "Mar 12, 1979" right; year shown only on the right label to avoid redundancy).

**Given** the `ChapterDirector` enters the `entering` substate of any encounter chapter at ±5 days from closest approach,
**When** the substate change fires,
**Then** the detail scrubber slides into view above the mission scrubber over `--v-duration-slow` (400ms ease-out; 0ms under reduced motion),
**And** the detail scrubber's range matches the chapter's `[windowStartEt, windowEndEt]`,
**And** on `exiting → passed` transition, the detail scrubber slides out symmetrically (or instant under reduced motion).

**Given** both scrubbers are visible,
**When** I start a drag on the mission scrubber and cross into an encounter window mid-drag,
**Then** the detail scrubber slides in without hijacking the pointer-capture (UX-DR31: "mid-drag scrubber transitions never hijack pointer-capture"),
**And** the user's pointer remains bound to the mission scrubber until release,
**And** after release, the detail scrubber becomes the active drag surface by default for subsequent gestures inside the window.

**Given** the detail scrubber accepts independent input,
**When** I drag the detail scrubber thumb,
**Then** the simulation scrubs at chapter cadence within the encounter window,
**And** the mission scrubber's thumb position updates simultaneously to reflect the new ET (the two scrubbers always show consistent state),
**And** the URL writeback throttling from Story 1.9 applies (250ms `replaceState`).

**Given** the detail scrubber implements WAI-ARIA Slider,
**When** I tab to it and press `←/→`,
**Then** the keyboard step size is cadence-aware: 1-hour during cruise refinement (±30 days), 1-minute during ±2 days, 10-second during ±1 hour of closest approach,
**And** `aria-label="<chapter name> encounter timeline"` (e.g., "V1 Jupiter encounter timeline"),
**And** `aria-valuetext` exposes the human-readable date "1979-03-05 11:42 UT" per Story 1.9,
**And** the focus ring renders per the global `:focus-visible` rule.

**Given** the mission scrubber's highlight band per UX-DR31,
**When** the detail scrubber is open,
**Then** the mission scrubber renders a subtle highlight band marking the chapter's `[windowStartEt, windowEndEt]` extent in `--v-color-accent` at low alpha,
**And** the band visually connects to the detail scrubber's extent (positionally aligned).

---

### Story 4.5: V1 Jupiter Encounter (1979-03-05) with Body-Centered Framing

As a visitor scrubbing to 1979-03-05,
I want V1's Jupiter encounter rendered with body-centered cinematic framing, articulated scan platform, NA boresight cone aimed at the historical targets, and hand-written chapter copy,
So that the differentiator's first encounter validation lands per the Step 4 success criteria, fulfilling FR21 and the V1 Jupiter portion of FR30.

**Acceptance Criteria:**

**Given** the chapter spec at `web/src/chapters/specs/v1-jupiter.ts`,
**When** I inspect it,
**Then** the spec's fields are populated: `slug: "v1-jupiter"`, `name: "V1 Jupiter"`, `markerLabel: "V1J"`, `anchorEt` = ET corresponding to 1979-03-05 12:05 UT, `windowStartEt` = anchor − 5 days, `windowEndEt` = anchor + 5 days, `spacecraft: "v1"`, `targetBody: "jupiter"` (consumed by `ViewFrame`),
**And** the chapter copy field exports a TypeScript template-literal string of 80–120 words of hand-written prose covering the Io volcano discovery, the 48-hour sweep across Amalthea/Europa/Ganymede/Callisto, and the ring discovery (per the PRD encounter coverage table),
**And** every cited fact has a source citation in `MISSION_FACTS.md` (no invented values).

**Given** the V1 Jupiter window is active,
**When** the camera enters body-centered framing,
**Then** `ViewFrame.getTransform` returns a Jupiter-centered origin offset (smoothstep blended per Story 4.1),
**And** the `VoyagerCameraController` default framing is tuned to show V1 and Jupiter together with Io visible during closest approach (default zoom level chosen per visual review, documented in the spec),
**And** scrubbing forward at 100× shows V1 swinging around Jupiter with the gravity-assist bend visible on the trajectory line (FR11 visual validation in Story 4.8).

**Given** Epic 3's attitude system is operational,
**When** scrubbing through 1979-03-05 09:00 UT through 13:00 UT at 1×,
**Then** the scan platform on the V1 model visibly articulates,
**And** the NA boresight cone sweeps from Io to Europa to Ganymede to Callisto in the historical sequence (validated against `ckbrief` inventory for V1J coverage),
**And** the `<v-attitude-indicator>` shows "ATT CK reconstructed" throughout the encounter window.

**Given** `<v-chapter-copy>` infrastructure from Story 2.9,
**When** the V1J window is active,
**Then** the chapter copy panel renders the V1 Jupiter prose anchored to the right side of the viewport,
**And** the lede ("V1 Jupiter.") uses serif `--v-size-chapter-copy-lg` weight 400,
**And** the body uses serif `--v-size-chapter-copy` weight 350 in `--v-color-fg-muted` with max-width 32ch,
**And** the panel fades in/out at window entry/exit per the chapter-copy fade rules (Story 2.9 / UX spec; instant under reduced motion).

**Given** the detail scrubber from Story 4.4,
**When** scrubbing into the V1J window,
**Then** the detail scrubber slides in with date-range labels "Feb 28" / "Mar 12, 1979",
**And** the active marker on the mission scrubber is V1J in `--v-color-accent`.

---

### Story 4.6: V2 Jupiter, V1 Saturn (Titan Slingshot), and V2 Saturn Encounters

As a visitor,
I want V2 Jupiter (1979-07-09), V1 Saturn (1980-11-12 with the Titan slingshot), and V2 Saturn (1981-08-26) all rendered with body-centered framing and hand-written chapter copy, with V1's post-Saturn trajectory visibly bent out of the ecliptic by the Titan flyby,
So that the gas-giant tour progresses chronologically and FR22, FR23, FR24, FR30, FR11 (V1S slingshot) are fulfilled.

**Acceptance Criteria:**

**Given** three chapter specs at `web/src/chapters/specs/v2-jupiter.ts`, `v1-saturn.ts`, `v2-saturn.ts`,
**When** I inspect them,
**Then** each spec has the full structure from Story 4.5's spec template (slug, name, markerLabel, anchorEt, window bounds, spacecraft, targetBody),
**And** anchor ETs match `MISSION_FACTS.md`: V2J = 1979-07-09 22:29 UT, V1S = 1980-11-12 23:46 UT, V2S = 1981-08-26 (time per primary source),
**And** marker labels are "V2J", "V1S", "V2S".

**Given** chapter copy is hand-written per spec,
**When** I read each chapter's copy,
**Then** V2 Jupiter covers the Callisto / Ganymede / Europa / Amalthea sequence (per PRD encounter table) in 50–150 words,
**And** V1 Saturn covers the Titan close flyby at 6,490 km and the slingshot that ends V1's planetary tour in 50–150 words,
**And** V2 Saturn covers the Iapetus / Hyperion / Titan flybys in 50–150 words,
**And** every cited distance, date, and target body is sourced from `MISSION_FACTS.md`.

**Given** V1's post-Saturn trajectory after the Titan slingshot,
**When** I scrub to a date after 1980-11-12 in any view,
**Then** V1's future-trajectory line visibly arcs upward (away from the ecliptic plane) in heliocentric framing (gravity-assist bend out of the ecliptic),
**And** this is validated in Story 4.8's gravity-assist visual validation document with an annotated screenshot,
**And** the bend matches the SPICE-derived trajectory within the NFR-P9 tolerance (≤ 20 km max position error).

**Given** Epic 3 attitude is operational,
**When** scrubbing through each encounter at 1×,
**Then** the scan platform articulates per CK data and `<v-attitude-indicator>` shows "ATT CK reconstructed" throughout each encounter's CK-covered window,
**And** the body-centered camera framing centers on Jupiter (V2J) or Saturn (V1S, V2S) per `ViewFrame`.

**Given** the detail scrubber, chapter markers, chapter copy panel, and URL routing,
**When** I click V2J, V1S, or V2S markers / select from chapter index,
**Then** the simulation jumps paused to the chapter's anchor ET,
**And** the URL updates to `/c/v2-jupiter`, `/c/v1-saturn`, or `/c/v2-saturn` via `pushState`,
**And** the chapter copy panel and detail scrubber render as Story 4.5.

---

### Story 4.7: V2 Uranus and V2 Neptune Encounters (Triton Bend FR12)

As a visitor,
I want V2 Uranus (1986-01-24 with Miranda flyby) and V2 Neptune (1989-08-25 with Triton flyby) rendered with body-centered framing and chapter copy, with V2's post-Neptune trajectory visibly bent sharply south of the ecliptic by Triton's gravity,
So that the gas-giant tour completes and FR25, FR26, FR12, FR30 are fulfilled.

**Acceptance Criteria:**

**Given** chapter specs at `web/src/chapters/specs/v2-uranus.ts` and `v2-neptune.ts`,
**When** I inspect them,
**Then** each spec follows the Story 4.5 template,
**And** V2 Uranus anchor ET = 1986-01-24 (time per primary source from `MISSION_FACTS.md`), marker label "V2U",
**And** V2 Neptune anchor ET = 1989-08-25 (time per primary source), marker label "V2N".

**Given** hand-written chapter copy,
**When** I read each chapter,
**Then** V2 Uranus covers the Miranda flyby at 29,000 km, the Ariel / Umbriel / Titania / Oberon flybys, and the 11 new moons discovered (per PRD encounter table) in 50–150 words,
**And** V2 Neptune covers the Triton flyby at 39,800 km in 50–150 words,
**And** distances and counts trace to `MISSION_FACTS.md`.

**Given** V2's post-Neptune trajectory after the Triton flyby,
**When** I scrub to any date after 1989-08-25 in heliocentric framing,
**Then** V2's future-trajectory line visibly bends sharply south of the ecliptic plane (FR12),
**And** the bend is observable from a default heliocentric camera view at the end of the mission (2030),
**And** this is validated in Story 4.8 with an annotated screenshot,
**And** the bend's magnitude matches the SPICE-derived trajectory within NFR-P9 tolerance.

**Given** the encounter machinery (view-frame, camera, detail scrubber, attitude, chapter copy, URL routing, OG cards, L4 regression),
**When** I navigate to V2U or V2N via marker click, chapter index, `1`–`9` shortcut, or deep-link URL,
**Then** all surfaces operate as for prior encounters (Story 4.5 / 4.6),
**And** the scan platform articulates per CK data for the windows where CK coverage exists,
**And** the detail-scrubber date labels render correctly for each encounter's window range.

**Given** V2 Uranus is V2's first outer-planet encounter at non-trivial distance from Earth,
**When** scrubbing the encounter,
**Then** the synthesized-attitude provenance label flickers between "CK reconstructed" and "Synthesized (HGA Earth-pointing)" only if the CK kernel coverage gaps exist per `docs/kernels/ckbrief-inventory.md`,
**And** the indicator never lies about which regime is active.

---

### Story 4.8: Gravity-Assist Trajectory Visual Validation

As the project maintainer,
I want a documented visual validation that the gravity-assist mechanism at each of the six encounters is *visually legible* — a layperson can see the planet pulling and redirecting the spacecraft,
So that FR11 is verified beyond the numerical-accuracy gate from NFR-P9, and the V1 Saturn ecliptic-exit and V2 Triton-bend dramatic moments land.

**Acceptance Criteria:**

**Given** a manual review pass at each of the six encounter ETs,
**When** I open the simulation in dev mode at each encounter's anchor ET, in heliocentric framing,
**Then** the trajectory line clearly shows the spacecraft swinging around the planet — accelerating into the gravity well, redirected outward at a new angle,
**And** for each encounter I capture an annotated screenshot showing the inbound trajectory, the bend at closest approach, and the outbound trajectory at sufficient zoom to make the geometry legible.

**Given** the validation document,
**When** I open `docs/visual-validation/gravity-assists.md`,
**Then** the document contains six sections (one per encounter: V1J, V2J, V1S, V2S, V2U, V2N) with the annotated screenshots and brief commentary on what makes the bend visible,
**And** V1S explicitly documents the Titan slingshot bending V1 out of the ecliptic plane (referenced from Story 4.6),
**And** V2N explicitly documents the Triton flyby bending V2 sharply south of the ecliptic (referenced from Story 4.7),
**And** every dated, distanced, or named fact in the commentary cites `MISSION_FACTS.md` for primary-source provenance.

**Given** any encounter whose bend is not visually apparent at default chapter framing,
**When** I identify the issue (e.g., camera zoom too tight, line color too quiet, framing centered on wrong axis),
**Then** I iterate on the chapter spec's default framing or trajectory-line styling until the gravity-assist mechanism is visually legible to a layperson,
**And** the iteration is committed and the validation document is updated.

**Given** the visual validation document is a living artifact,
**When** Epic 7's friendly-user testing (or earlier feedback) flags an encounter whose bend reads ambiguously,
**Then** this story's iteration loop is re-entered (the document is the canonical reference for "is the gravity-assist legible at this encounter").

---

### Story 4.9: L4 Playwright Visual Regression at Six Encounter Scenes + Launch + PBD Stub

As the project maintainer,
I want a CI-gated Playwright visual-regression suite at eight pinned scenes so any unintended change to the rendered output is caught before merge,
So that FR55 (L4) is operational and PRD §Layer-4 commitment is met.

**Acceptance Criteria:**

**Given** the Playwright test suite at `web/tests/visual/`,
**When** I inspect the suite,
**Then** the suite registers eight pinned scenes at 1280×720: V1 launch anchor (1977-09-05), V2 launch anchor (1977-08-20), V1J closest approach (1979-03-05 12:05 UT), V2J (1979-07-09 22:29 UT), V1S (1980-11-12 23:46 UT), V2S (1981-08-26), V2U (1986-01-24), V2N (1989-08-25), PBD anchor (1990-02-14 — stub baseline this story; Epic 5 updates the real baseline once the dedicated module is in),
**And** each test navigates to the corresponding deep-link URL on the locally-served built site (`web/dist/` served by a static file server in the Playwright fixture),
**And** waits for the simulation to reach a stable frame (no in-flight asset loads, no animating chapter-copy fade) before screenshot capture.

**Given** the regression suite's tolerance,
**When** each test runs,
**Then** the captured screenshot is compared against the baseline image stored at `web/tests/visual/__snapshots__/<scene-name>.png`,
**And** the per-pixel tolerance is tuned to avoid flakiness from font rendering / anti-aliasing differences (initial threshold ~0.1% pixel diff; refined per observed flake rates in this story),
**And** the test fails if the diff exceeds threshold, printing the diff image path for inspection.

**Given** the CI workflow from Story 1.14 / Story 3.7,
**When** the workflow runs after build,
**Then** the L4 Playwright visual-regression suite executes as a CI stage,
**And** any unintended diff fails the workflow,
**And** the L4 + L5 (Epic 7) total wall-clock time is ≤ 15 minutes (NFR-M4).

**Given** intentional visual changes are part of normal development,
**When** I make an intentional visual change (e.g., adjusting chapter framing in Story 4.5),
**Then** I update baselines via `npx playwright test --update-snapshots` and commit the new baselines in the same PR,
**And** the PR description references the intentional change and includes before/after screenshots for review.

**Given** the PBD stub baseline,
**When** Epic 5 Story 5.4 lands the dedicated PBD module,
**Then** the PBD baseline image is intentionally updated as part of that PR (not in this story).

**Given** the Playwright fixture configuration,
**When** I inspect `playwright.config.ts`,
**Then** the browser is locked to Chromium at a specific version (pinned via `playwright install chromium@<version>` in CI setup),
**And** the viewport is fixed at 1280×720,
**And** the device pixel ratio is 1 (no Retina rendering ambiguity),
**And** the locale and timezone are fixed (`en-US`, `UTC`) so date rendering is deterministic.

---

## Epic 5: Pale Blue Dot — the Hero Scene

A visitor reaches 1990-02-14; the spacecraft physically turns toward the inner solar system; the narrow-angle camera frustum sweeps Venus → Earth → Jupiter → Saturn → Uranus → Neptune in historical sequence; original NASA photo plates composite into the scene at the corresponding instants. The visitor pauses for thirty seconds — the success criterion.

### Story 5.1: PBD Dedicated Module and Internal Substates

As the project maintainer,
I want the Pale Blue Dot chapter implemented as a dedicated module (not a declarative spec) with its own substate machine that integrates with `ChapterDirector`,
So that the choreographed turn, frustum sweep, and photo-plate composites of subsequent stories have a coherent timeline-driven container, fulfilling AR10 and the PBD portion of FR30.

**Acceptance Criteria:**

**Given** the chapter module location,
**When** I inspect `web/src/chapters/pale-blue-dot/`,
**Then** the directory contains at least `index.ts` (module entry point and `ChapterSpec`-compatible export), `substates.ts` (substate enum + timestamp anchors), `copy.ts` (chapter copy template literal), and supporting modules for turn choreography (Story 5.2) and composite pipeline (Story 5.3),
**And** the placeholder spec from Story 2.1 (`web/src/chapters/specs/pale-blue-dot.ts`) re-exports from this module so `ALL_CHAPTERS` registry semantics are preserved.

**Given** the substate machine,
**When** I inspect `substates.ts`,
**Then** the substate enum declares the substates in chronological order: `idle`, `turning`, `sweeping_venus`, `sweeping_earth`, `sweeping_jupiter`, `sweeping_saturn`, `sweeping_uranus`, `sweeping_neptune`, `composite_active`, `composite_decay`, `passed`,
**And** each `sweeping_<body>` substate has anchor ETs (start, peak, end) timestamped against the historical PBD sequence on 1990-02-14 — sourced from `MISSION_FACTS.md` with primary-source citations,
**And** the module exposes `PaleBlueDot.update(currentEt)` called once per frame by `ChapterDirector` during the PBD window, returning the active substate.

**Given** `ChapterDirector` lifecycle integration,
**When** the simulation crosses the PBD `windowStartEt`,
**Then** the director hands per-frame control of camera/attitude/composite layer to `PaleBlueDot.update(currentEt)` during the PBD window,
**And** outside the window, the dedicated module is inactive and `ChapterDirector` resumes standard behavior,
**And** the special-case integration is documented in an inline code comment and in `docs/adr/` (the ADR for AR10 records why PBD is a dedicated module and how it integrates).

**Given** the chapter copy,
**When** I open `copy.ts`,
**Then** it exports a hand-written 80–120-word prose body plus a lede sentence "Pale Blue Dot.",
**And** the prose references the act of *turning back to take the photograph* (per the J1 climax in the PRD — the user "noticed the camera being aimed at it"),
**And** copy is rendered via `<v-chapter-copy>` from Story 2.9 / Story 4.5,
**And** every cited fact (sequence ordering, the 1990-02-14 date, the targets photographed, the distance from Earth at capture) cites `MISSION_FACTS.md`.

**Given** the PBD chapter marker on the mission scrubber,
**When** I click the PBD marker or press `9` (chapter 9 in the chronological registry),
**Then** the simulation jumps paused to the PBD anchor ET,
**And** the URL updates to `/c/pale-blue-dot`,
**And** the chapter copy panel appears with the PBD prose,
**And** the dedicated module's `idle` substate is active (turn choreography fires when playback resumes).

---

### Story 5.2: Choreographed Spacecraft Turn (CK or Synthesized per Coverage)

As a visitor at the PBD chapter,
I want to watch V1 physically turn from cruise orientation to the photography-sequence pointing, with the provenance indicator honestly reflecting whether the turn is CK-driven or synthesized,
So that the differentiator's hero moment lands as recognition (not as spectacle) and FR27, FR19 (provenance honest), AR10 are operational.

**Acceptance Criteria:**

**Given** the Story 1.3 `ckbrief` inventory recorded whether `vgr1_super_v2.bc` covers 1990-02-14,
**When** I inspect `docs/kernels/ckbrief-inventory.md`,
**Then** the PBD-coverage finding is explicit (either "CK coverage confirmed for 1990-02-14" or "no CK coverage; reconstruction synthesizes per-target pointing"),
**And** the PBD module's behavior in this story branches on that finding.

**Given** CK coverage IS present for the PBD window,
**When** the `turning` substate is active,
**Then** the V1 bus and scan-platform quaternions are driven by Story 3.2's `AttitudeService.getBusQuat`/`getPlatformQuat` (CK-derived),
**And** `<v-attitude-indicator>` shows "ATT CK reconstructed" throughout the PBD window,
**And** the visible turn matches the historical CK record (validated by the L2 fixture from Story 3.7 if PBD ETs are in the fixture; if not, the PBD module's behavior is regression-tested in Story 5.4).

**Given** CK coverage is NOT present for the PBD window,
**When** the `turning` substate is active,
**Then** the PBD module synthesizes per-target pointing — at each `sweeping_<body>` substate, the V1 bus is oriented so the NA boresight (FK rotation from Story 3.2's `fk-constants.ts`) aligns with the V1→target vector computed from `EphemerisService.getPosition`,
**And** the synthesized bus quaternion is emitted by the PBD module taking precedence over `AttitudeService` for the duration of the PBD window (the module's per-frame quaternions overwrite the service's),
**And** `<v-attitude-indicator>` shows "ATT Synthesized (PBD reconstruction)" — a variant of the synthesized label that names the reconstruction rather than the cruise default,
**And** the chapter copy in Story 5.1 explicitly acknowledges the reconstruction posture (one sentence noting that the spacecraft's pointing during the photograph sequence is reconstructed from SPK + FK constraints).

**Given** the turn pacing,
**When** the simulation plays the PBD window at 1×,
**Then** the historical sequence (which took several real hours) is sped 50× by the PBD module's internal time mapping so the full turn + frustum sweep + composites read cinematically in approximately 2 minutes at 1× chapter playback,
**And** at any other simulation speed (10×, 100×, …), the chapter's internal time mapping scales accordingly so the choreography stays coherent (it does not break at high time-warp),
**And** under `prefers-reduced-motion: reduce`, the turn becomes an instant cut to the final pointing per substate transition (no continuous animation),
**And** the speed multiplier and detail scrubber remain functional during the PBD window (the user can scrub manually through the substates).

**Given** the platform follows the bus,
**When** the bus turns,
**Then** the scan-platform quaternion is emitted by the PBD module per substate (not by `AttitudeService`) so the boresight cone (Story 3.5) aims precisely at each target body during its `sweeping_<body>` substate,
**And** the cone's orientation transition between substates uses `--v-ease-out` over `--v-duration-slow` (instant under reduced motion).

**Given** the J1 success criterion ("the user notices the spacecraft physically turning"),
**When** the friendly-user testing in Epic 6 runs against the PBD chapter,
**Then** the qualitative test explicitly probes whether the user perceives the turn as the camera being aimed (per the PRD differentiator-validation gate),
**And** Story 6.5's friendly-user session protocol includes PBD-specific prompts on this.

---

### Story 5.3: Photo-Plate Compositing Pipeline at Historical Instants

As a visitor watching the PBD sequence,
I want each NASA Photojournal plate (Venus, Earth, Jupiter, Saturn, Uranus, Neptune) to composite into the scene at the moment the camera frustum sweeps the corresponding target,
So that the historical photographs appear in their actual temporal context and FR28 is operational.

**Acceptance Criteria:**

**Given** the NASA Photojournal source images,
**When** I inspect `web/public/images/pbd/`,
**Then** six PNG files are present (`venus.<hash>.png`, `earth.<hash>.png`, `jupiter.<hash>.png`, `saturn.<hash>.png`, `uranus.<hash>.png`, `neptune.<hash>.png`) — each is the NA-camera frame from the historical PBD sequence sourced from the NASA Planetary Photojournal,
**And** the asset manifest references each plate with content-hashed filename and `Cache-Control: public, max-age=31536000, immutable` (per Story 1.14),
**And** `THIRD_PARTY.md` (Epic 7 Story 7.x) and `<v-attribution-panel>` (Story 2.7) credit NASA Photojournal for each plate.

**Given** the composite layer,
**When** I inspect `web/src/chapters/pale-blue-dot/composite-layer.ts`,
**Then** the module exposes a render-loop subscription that overlays the active substate's plate as a fixed-screen-space layer anchored at the NA boresight cone's center (projected to screen-space per frame),
**And** the plate's screen size matches the apparent narrow-angle frame at the historical capture (small — verified visually against the historical photograph in `docs/visual-validation/pale-blue-dot.md`),
**And** the composite uses additive blending or normal alpha-blend (implementation choice, documented in code; AC: the result reads as the plate appearing in the scene, not as a HUD overlay).

**Given** each `sweeping_<body>` substate from Story 5.1,
**When** the substate begins (at the substate's `start` ET),
**Then** the corresponding plate composites in with opacity 0 → 1 over `--v-duration-base` (200ms; instant under reduced motion),
**And** holds at opacity 1 during the substate's `peak` window,
**And** at the substate's `end` ET, fades to opacity 0 over `--v-duration-base`,
**And** the next substate's plate composites in with the same fade-in once the current substate has decayed (no two plates visible simultaneously).

**Given** the historical sequence,
**When** the PBD chapter plays through,
**Then** the six plates composite in the order Venus → Earth → Jupiter → Saturn → Uranus → Neptune (per the PRD §Pale Blue Dot reconstruction commitment),
**And** the sequence timing matches the historical anchor ETs from Story 5.1's `substates.ts`,
**And** the `composite_active` substate (during the Earth plate) holds long enough at 1× chapter playback for the "thirty-second pause" success criterion to be possible without the user racing the next composite.

**Given** pixel-precise placement,
**When** the Earth plate composites at its `peak` ET,
**Then** the plate's center is positionally aligned with the NA boresight cone's axis projected to screen,
**And** the plate's scale matches the apparent NA-camera frame size,
**And** `docs/visual-validation/pale-blue-dot.md` includes annotated screenshots verifying alignment against the historical NASA photograph.

**Given** the composites are part of the canvas (not chrome),
**When** I render the PBD chapter in embed mode (`?embed=true`),
**Then** the photo composites still render (they are the simulation, not HUD chrome),
**And** the HUD / chapter copy / chapter index button remain hidden per Story 2.5's embed contract.

---

### Story 5.4: PBD L4 Playwright Visual Regression Suite

As the project maintainer,
I want the PBD hero scene gated by Playwright visual regression at every key substate so any unintended drift in the choreographed turn, composite alignment, or trajectory is caught before merge,
So that FR55 (L4 PBD) is operational and the Story 4.9 stub baseline is replaced with full regression coverage.

**Acceptance Criteria:**

**Given** the Playwright test suite from Story 4.9 at `web/tests/visual/`,
**When** I inspect the PBD test file,
**Then** the suite registers at least four PBD test cases at 1280×720 — `pbd-turning` (mid-turn frame at the `turning` substate's peak ET), `pbd-sweeping-earth` (Earth-plate-composited frame at the `sweeping_earth` substate's peak ET — the iconic hero shot), `pbd-sweeping-neptune` (final-plate frame at the `sweeping_neptune` substate's peak ET), `pbd-composite-decay` (post-composite frame after the last plate fades out),
**And** each test navigates to a deep-link URL with a sub-second ET that anchors the simulation at the substate's peak ET (e.g., `/c/pale-blue-dot?t=1990-02-14THH:MM:SSZ`).

**Given** the Story 4.9 stub PBD baseline,
**When** Story 5.4 lands,
**Then** the stub baseline at `__snapshots__/pbd-anchor.png` is replaced (or augmented) by the four new PBD baselines,
**And** the PR introducing Story 5.4 includes before/after screenshots in the description for review.

**Given** the regression suite's tolerance,
**When** each PBD test runs,
**Then** the captured screenshot is compared against the committed baseline with the same 0.1% pixel-diff threshold as Story 4.9,
**And** the test fails if the diff exceeds threshold,
**And** the L4 PBD tests fit within the L4 suite's overall ≤ 15 minute CI budget (NFR-M4).

**Given** the visual validation document,
**When** I open `docs/visual-validation/pale-blue-dot.md`,
**Then** the document contains annotated screenshots from each of the four regression tests with commentary referencing the historical NASA photograph for visual reference,
**And** the document explicitly notes whether the PBD turn is CK-driven or synthesized (per Story 5.2's branch),
**And** if synthesized, the document records the per-target pointing math used so future kernel updates can be reasoned about.

**Given** Epic 7's full L1–L5 harness,
**When** the L4 suite executes against the PBD substates and any unintended diff is detected,
**Then** the CI workflow fails,
**And** intentional changes (e.g., updating a NASA Photojournal plate, adjusting composite alignment) require an explicit `--update-snapshots` PR with reviewer sign-off per Story 4.9's discipline.

---

## Epic 6: Audio, Reduced Motion and Full Accessibility Pass

A visitor with `prefers-reduced-motion: reduce` sees instant cuts; a screen-reader user gets sensible chapter announcements without queue flooding; a forced-colors-mode user gets a usable UI; an opt-in Golden Record audio layer activates gently at the launch, PBD, and heliopause chapter markers. Friendly-user qualitative sessions (5–10 users + at least 1 AT user) validate that the differentiator is perceived — the launch gate per PRD.

### Story 6.1: Golden Record Audio Bundle, `<v-audio-toggle>`, and Chapter-Marker Activation

As a visitor who wants the diegetic Golden Record audio,
I want to toggle it on with the `G` key or a small button next to play/pause, and have it activate gently at the launch, Pale Blue Dot, and heliopause chapter markers — never at any other time and never on by default,
So that the bass-note elegy is available when wanted without ever urging me, fulfilling FR43, FR44, UX-DR15.

**Acceptance Criteria:**

**Given** the Voyager Golden Record source audio is in the NASA public domain,
**When** I inspect `web/public/audio/golden-record/`,
**Then** the directory contains the curated audio assets (~30 MB compressed total, ~90 min content) encoded in a browser-universal codec (Opus or AAC; implementation chooses one; AAC is the safer cross-browser default),
**And** `THIRD_PARTY.md` (Story 7.x) and `<v-attribution-panel>` (Story 2.7) document each track's NASA Photojournal / NASA source and confirm that the specific selections carry no encumbering performance rights (the curation audit is part of this story's deliverable; documented inline in `THIRD_PARTY.md`).

**Given** `<v-audio-toggle>` from the UX inventory,
**When** the app renders (non-embed mode shows the toggle; embed mode also renders it because the toggle controls the simulation, not chrome — per Story 2.5's contract that distinguishes simulation controls from chrome),
**Then** the component is a native `<button>` adjacent to the play button bottom-left with `aria-label="Turn Golden Record audio on"`/`"Turn Golden Record audio off"` reflecting state and `aria-pressed` boolean,
**And** the off state displays a muted-speaker glyph (🔇), the on state displays a speaker glyph (🔊),
**And** `G` keyboard shortcut from anywhere (no text input focused) toggles state.

**Given** the audio is off by default on every fresh session,
**When** the page first loads,
**Then** the toggle reads off,
**And** if the user toggles on, the preference persists in `localStorage` under a stable key (`voyager.audio-toggle`) for the duration of the session,
**And** opening a new tab or returning the next day resets the default to off (UX spec: "preference persists for session, not across sessions" — implementation: clear the `localStorage` key on page-unload OR check a session-id stored at boot — implementation chooses the latter for reliability).

**Given** the audio is toggled on,
**When** the simulation timestamp enters a Golden-Record chapter window — V1 launch, V2 launch, Pale Blue Dot, V1 heliopause, V2 heliopause,
**Then** a curated Golden Record track gently activates with a fade-in over 1500 ms (longer than UI fade durations because audio cross-fade is its own register),
**And** a different curated track plays per chapter (audio curation choices documented in `docs/audio/golden-record-curation.md` with reasoning),
**And** outside Golden-Record chapter windows, the audio is silent (no ambient track plays during cruise, V1J / V2J / V1S / V2S / V2U / V2N encounters, or anywhere else).

**Given** the audio playback,
**When** I scrub through a chapter marker quickly while audio is on,
**Then** the audio still cross-fades cleanly (no abrupt cuts; the fade is timestamp-gated, not real-time-gated, so high time-warp does not cause audio glitches),
**And** the audio playback respects the simulation's playing/paused state (pausing the simulation pauses the audio),
**And** when scrubbing backward across a chapter marker, the audio fades out cleanly — there is no rewind-playback artifact.

**Given** the audio under accessibility preferences,
**When** the user has `prefers-reduced-motion: reduce` set,
**Then** the audio still plays normally (motion preference does not affect audio),
**And** when the user has `prefers-reduced-transparency: reduce` set, audio is also unaffected.

**Given** the audio is diegetic (not narrative),
**When** I review the chapter copy and About page,
**Then** the artifact does not claim the Golden Record audio is narration or voiceover,
**And** the About page's methodology section explicitly distinguishes the diegetic Golden Record from the deferred-to-v1.1 spoken narration.

---

### Story 6.2: `<v-hud>` Dismiss/Restore and Final HUD Compaction Polish

As a visitor wanting an unobstructed view (or a screenshot),
I want to press `H` to dismiss the HUD and `H` (or `Esc`) to restore it, and the HUD must polish gracefully at narrow viewports,
So that the canvas-as-protagonist commitment lets the user clear chrome on demand and FR36 + UX-DR30 narrow-viewport polish are operational.

**Acceptance Criteria:**

**Given** the global keyboard shortcut inventory from Story 2.8,
**When** I press `H` from anywhere (no text input focused),
**Then** the `<v-hud>` container fades to opacity 0 over `--v-duration-base` (200 ms; instant under `prefers-reduced-motion: reduce`),
**And** pressing `H` again restores the HUD with the reverse fade,
**And** `Esc` while the HUD is dismissed also restores it,
**And** `Esc` does not dismiss the HUD when visible (`Esc` is reserved for closing overlays per Story 2.8).

**Given** the HUD is dismissed,
**When** I inspect the DOM,
**Then** the HUD's DOM nodes remain present (not removed),
**And** `aria-live` regions still announce on scrub-stop and chapter change — screen-reader users continue to hear updates even with the visual HUD hidden,
**And** the dismissed state visually hides the HUD via `opacity: 0` plus `pointer-events: none` so the HUD does not intercept pointer events while dismissed.

**Given** narrow viewports per UX-DR30,
**When** the viewport width is `< 1024px` (Tier 2 tablet portrait),
**Then** the `<v-hud-distance>` and `<v-hud-instruments>` sub-components collapse behind an "expand HUD" affordance — a small `⋯` icon that toggles their visibility,
**And** `<v-hud-date>`, `<v-hud-chapter-title>`, and `<v-hud-speed>` remain always-visible because they are the primary readouts,
**And** the `⋯` icon is keyboard-tab-focusable with `aria-label="Expand HUD"` / `"Collapse HUD"` and `aria-expanded` reflecting state.

**Given** narrow viewports for the chapter copy panel,
**When** the viewport width is `< 1024px`,
**Then** `<v-chapter-copy>` becomes a bottom-sheet drawer anchored to `bottom: 0; left: 0; right: 0` above the scrubber,
**And** the default state at this viewport shows the chapter lede + 2 lines of body (partial-expanded),
**And** the user can drag the drawer up to full-height or down to collapse,
**And** under `prefers-reduced-motion: reduce` the drawer state changes are instant cuts,
**And** in landscape on tablet (≥1024 wide), the right-side panel layout from Story 4.5 is preserved.

**Given** the embed mode contract from Story 2.5,
**When** embed mode is active,
**Then** `<v-hud>` is not rendered (per Story 2.5's stripped list),
**And** `H` keyboard shortcut is a no-op in embed mode (no HUD to dismiss).

**Given** the HUD compaction touches Story 1.11's placeholder behavior,
**When** Story 6.2 lands,
**Then** the Story 1.11 acceptance criterion about narrow-viewport HUD compaction (which was deferred to Epic 6 polish) is now fully met,
**And** no other Story 1.11 contract is regressed.

---

### Story 6.3: Full Reduced-Motion Sweep Across All Chapters and Components

As a visitor with `prefers-reduced-motion: reduce` set in OS preferences,
I want every animation, transition, easing, and choreography to become an instant cut while simulation playback at 60 FPS continues unchanged,
So that FR46, NFR-A5, UX-DR6 are operational holistically across every chapter and component.

**Acceptance Criteria:**

**Given** every animation surface added across Epics 1–5 is now in scope for audit,
**When** I run the reduced-motion audit per `docs/accessibility/reduced-motion.md`,
**Then** every transition listed in the audit collapses to 0 ms duration under `prefers-reduced-motion: reduce`, verified individually: title-card dissolve (Story 1.9), chapter-copy fade in/out (Story 2.9 / Story 4.5), chapter-index slide-in/out (Story 2.3), help-overlay open/close (Story 2.8), detail-scrubber slide-in/out (Story 4.4), view-frame smoothstep blend (Story 4.1), PBD turn choreography (Story 5.2), PBD photo-plate composite fades (Story 5.3), Golden Record audio fade (Story 6.1 — audio fade is not motion; documented exception that audio fade remains as-is), HUD dismiss fade (Story 6.2), attitude-indicator color transition (Story 3.6), scrubber drag interactions (no implicit easing on drag — confirmed already instant per Story 1.9).

**Given** the simulation playback itself,
**When** `prefers-reduced-motion: reduce` is active,
**Then** the simulation continues to play at 60 FPS,
**And** the spacecraft positions, scan-platform articulation, planet positions, and trajectory line growth all update per frame normally,
**And** the user can still scrub, play, pause, and adjust speed exactly as without reduced motion (only *additional* motion is reduced, not the simulation itself).

**Given** the reduced-motion contract documentation,
**When** I open `docs/accessibility/reduced-motion.md`,
**Then** the document enumerates every animated surface in the app with its reduced-motion behavior,
**And** the doc explicitly notes the exceptions: simulation playback itself (not reduced), Golden Record audio fade (not motion; not reduced),
**And** the doc records the implementation contract (CSS custom properties for durations at `:root`, `prefers-reduced-motion: reduce` media query overrides them to 0 ms — single source of truth per Story 1.7 / UX-DR6).

**Given** a Playwright fixture for reduced-motion verification,
**When** I run the dedicated reduced-motion test suite,
**Then** the fixture sets `Emulation.setEmulatedMedia` with `prefers-reduced-motion: reduce` before each scene navigation,
**And** screenshots are captured at scenes that would otherwise animate: mid-title-card moment (~1 s after load), mid-chapter-copy-fade moment (~200 ms after window entry), mid-chapter-index-slide moment (~100 ms after icon click), mid-PBD-turn moment,
**And** each screenshot reflects the *final* state (animation collapsed to 0 ms) — not a mid-animation frame,
**And** the suite is added to the L4 CI gate alongside the standard-motion baselines.

**Given** the OS preference is respected at boot and persists during the session,
**When** I toggle `prefers-reduced-motion` in OS settings mid-session,
**Then** the change takes effect on the next CSS reflow (a `matchMedia` listener is not required — the CSS-variable mechanism handles it natively),
**And** no per-component code change is needed because every transition reads duration from `:root` variables (verified by inspecting one component per epic for compliance: `<v-chapter-copy>`, `<v-chapter-index>`, `<v-help-overlay>`, `<v-timeline-scrubber>` detail variant, `<v-hud>`).

---

### Story 6.4: axe-core CI Expansion and Manual Accessibility Test Layer

As the project maintainer,
I want the axe-core CI gate expanded to cover every component state across the inventory plus a documented manual a11y test checklist run before each phase milestone and launch,
So that NFR-A1 conformance is mechanically gated and the cases axe cannot catch (screen-reader experience, color blindness, forced-colors) are caught manually, fulfilling UX-DR35, UX-DR36, NFR-A6.

**Acceptance Criteria:**

**Given** the axe-core CI integration from Story 1.7,
**When** Story 6.4 lands,
**Then** the test suite at `web/tests/a11y/` runs axe-core against every Web Component from the inventory (Stories 1.7–5.4) in default state + each interactive state listed in the component's state table (e.g., scrubber: resting, hovered, focused, dragging, bound; chapter-index: closed, opening, open, item-hovered, item-focused, item-selected),
**And** axe runs against every static route — `/`, `/about`, every `/c/<slug>` (all 11 chapter routes), `/unsupported.html` (all three variants per Story 1.8),
**And** the CI gate fails on any `critical` or `serious` violation,
**And** `moderate` and `minor` violations are reported but do not block the build (logged in CI output for follow-up).

**Given** the manual a11y test checklist,
**When** I open `docs/accessibility/manual-test-checklist.md`,
**Then** the checklist documents these test passes: keyboard-only navigation (disconnect mouse, complete every primary flow — first-paint, scrub, chapter jump, deep-link entry, About page, embed mode); VoiceOver on macOS Safari (announces chapter title on change, HUD updates throttled to scrub-stop, help overlay focus-trap works); NVDA on Windows Firefox (same checks); TalkBack on Android Chrome (Tier 3 best-effort); color blindness simulation under Chrome DevTools deuteranopia/protanopia/tritanopia (no information lost — especially `<v-attitude-indicator>` CK/synthesized colors and past-solid/future-dashed trajectory styling); forced-colors `@media` mode in Windows high-contrast (all interactive elements visible and operable; palette overrides applied per UX-DR25); `prefers-reduced-transparency: reduce` (overlay scrim becomes fully opaque per UX-DR26); reduced-motion validation cross-check against Story 6.3 documentation.

**Given** the checklist is run before each Phase milestone and before launch,
**When** I complete a checklist run,
**Then** results are committed to `docs/accessibility/manual-test-runs/<date>.md` with one section per check, pass/fail status, screenshots where relevant, and remediation issues filed for any failures,
**And** any `critical` or `serious` manual finding blocks the next milestone until remediated.

**Given** photosensitive-epilepsy safety (NFR-A6),
**When** I review every animated surface (including the title-card dissolve, attitude-indicator transition, chapter-copy fade, PBD plate composites),
**Then** no content flashes more than 3 times per second,
**And** no large-area high-contrast strobing occurs at any chapter or transition,
**And** the audit is documented in the manual a11y checklist.

**Given** the axe-core test wall-clock cost,
**When** the expanded CI runs,
**Then** the L3 + a11y test stage completes in ≤ 5 minutes per NFR-M4 (the existing L3 budget; axe-core unit tests are part of L3 by being colocated with component unit tests),
**And** Playwright-based axe checks against deployed routes run as part of the L4/L5 stage within the ≤ 15 minute budget.

---

### Story 6.5: Friendly-User Qualitative Testing — Differentiator-Perception Launch Gate

As the project maintainer (per the PRD launch-gate commitment),
I want 5–10 first-time users (matching the Maya persona) plus at least 1 assistive-technology user to complete structured sessions that probe whether they perceive the attitude reconstruction unprompted at the V1 Jupiter encounter and the PBD chapter,
So that the differentiator-perception result becomes the launch gate per the PRD and FR15–FR20 land qualitatively as well as mechanically, fulfilling UX-DR38.

**Acceptance Criteria:**

**Given** the friendly-user recruitment commitment,
**When** Story 6.5 begins,
**Then** 5–10 first-time-user candidates are recruited matching the Maya persona profile from the UX spec (space-curious adults, no prior briefing on the artifact, mixed gender and age),
**And** at least 1 assistive-technology user is recruited — preferably from the friendly-user pool; if not recruitable from the pool, an accessibility-user-research vendor (Fable, Inclusive Design Research Centre, or equivalent) is engaged as a launch-gate cost per the UX-DR38 commitment,
**And** the recruitment process is documented in `docs/testing/friendly-user-recruitment.md` including persona match criteria and consent / privacy commitments (no recording without consent; no PII retained beyond aggregate findings).

**Given** the structured session protocol,
**When** I open `docs/testing/friendly-user-protocol.md`,
**Then** the document specifies a 30–45 minute session structure with these probes in order: cold-load first-paint impression ("describe what you're looking at"), first-scrub responsiveness ("try dragging the bar at the bottom"), unguided exploration (5 min of unfacilitated use; observe what they do), first-encounter at V1 Jupiter unprompted ("what do you see happening here?"), unprompted attitude probe ("anything you noticed about the spacecraft itself?"), Pale Blue Dot chapter ("what is happening here?"), deep-link copy-and-share flow ("if you wanted to send this exact moment to a friend, how would you do that?"), About page discoverability ("where would you find more about how this was made?"),
**And** each probe has a documented success criterion and a documented failure criterion,
**And** the protocol explicitly notes that the V1 Jupiter and PBD probes are the differentiator-perception launch gate per the PRD.

**Given** session execution,
**When** sessions run with each friendly user,
**Then** observations are captured live (with consent: screen recording + verbal think-aloud transcript; without consent: written observation notes only),
**And** each session ends with an exit interview covering Likert scales on awe, restraint, trust, recognition (per the Step 4 emotional design principles), plus open-ended qualitative quotes.

**Given** aggregate findings,
**When** all sessions complete,
**Then** `docs/testing/friendly-user-findings.md` aggregates: count of users who noticed the attitude reconstruction unprompted at V1 Jupiter, count who noticed at PBD, common qualitative themes from exit interviews, Likert-scale aggregate scores per emotional dimension, and specific UI-affordance feedback for downstream iteration,
**And** the findings document is committed and discoverable.

**Given** the launch-gate result,
**When** the aggregate finding is that fewer than ~50% of users perceive the attitude reconstruction unprompted at V1 Jupiter (the PRD-specified threshold is qualitative — "the differentiator failed"; this story's interpretive threshold is documented in the findings doc),
**Then** the v1 launch is blocked per the PRD commitment,
**And** a redesign of the V1 Jupiter chapter's UI affordances (camera framing, scan-platform articulation visibility, boresight cone prominence, chapter copy lede) is scoped as additional work before launch,
**And** the redesign re-enters Story 6.5 for re-validation.

**Given** assistive-technology user findings,
**When** the AT user session completes,
**Then** specific accessibility issues identified by the AT user are filed as remediation issues with critical/serious flagged ones blocking launch,
**And** the AT user findings feed back into the manual a11y checklist for future runs.

---

### Story 6.6: Final Contrast, Typography, and Provenance-Label Polish

As the project maintainer,
I want a launch-week pass through every visual surface — contrast audit, typography tightening, provenance-label clarity, tabular-numeral verification, text-shadow legibility — concluding with an external review pass on "linkable next to AiRT / NYT long-scrolls / FWA Three.js winners without an apology",
So that the PRD Definition-of-Done qualitative gate is verified and the launch can proceed, fulfilling FR49 (final audit), NFR-A2, NFR-A3 (focus indication compliance), and the reference-parity gate.

**Acceptance Criteria:**

**Given** the launch-week visual audit,
**When** I run the contrast pass on every used text + background pair in the deployed app,
**Then** every pair passes WCAG 2.2 AA at minimum (body ≥ 4.5:1, large/UI ≥ 3:1) per the UX-DR2 verified table,
**And** every pair currently at AA gets verified again on the deployed CDN (no token drift since Story 1.7),
**And** `--v-color-fg-quiet` (3.4:1) is verified to be used only at ≥ 18 px per the AA-large constraint — any usage below that is fixed in this story,
**And** results are committed to `docs/accessibility/contrast-audit-launch-week.md`.

**Given** typography pairing review,
**When** I review the three-voice register across all chapters and components,
**Then** any friendly-user feedback (Story 6.5) about hierarchy ambiguity is acted on,
**And** the tabular-numeral verification is performed on every HUD value (`<v-hud-date>`, `<v-hud-distance>`, `<v-hud-speed>`, instrument-shutoff timestamps, detail-scrubber date labels) confirming digits do not jitter as values change during scrubbing,
**And** italics-for-emphasis convention (UX spec: italics carry meaning, not decoration) is audited — `<em>` is the only italic path; any `<i>` decorative usage is removed.

**Given** provenance-label clarity polish,
**When** I review `<v-attitude-indicator>` (Story 3.6) and trajectory line styling (Story 1.12),
**Then** the indicator's text + color + icon together convey CK vs synthesized provenance clearly to color-blind simulation (Story 6.4 results referenced),
**And** the past-solid / future-dashed line distinction is visually unambiguous at default zoom + at deep zoom + at heliopause far zoom,
**And** any feedback from friendly-user sessions (Story 6.5) flagging confusion about either label is acted on.

**Given** `text-shadow` legibility on bright canvas areas,
**When** I scrub to scenes with bright backgrounds (Sun close-up, planet close-ups, the Saturn rings),
**Then** HUD values, chapter title, chapter copy, and attitude indicator remain legible against the bright canvas without visual struggle,
**And** if any element fails legibility, the `text-shadow` blur or color is tightened in this story.

**Given** the focus-indicator polish,
**When** I tab through every focusable element across every route,
**Then** the 2 px `--v-color-focus` outline + 2 px offset (4 px total effective) is visible at ≥ 3:1 contrast against every backdrop (canvas areas, overlay scrim, About page bg),
**And** no element has its focus ring suppressed (audit confirms no `outline: none` overrides without compensating focus styling),
**And** focus-indicator persistence (stays visible until focus moves) is verified per NFR-A4.

**Given** the Definition-of-Done qualitative gate from the PRD,
**When** the visual polish is complete,
**Then** the project maintainer + 2–3 trusted external reviewers (per the PRD reference-parity gate) review the deployed artifact and explicitly compare it side-by-side with Apollo in Real Time, an NYT long-scroll science feature, and a current FWA Three.js winner,
**And** the reviewers' written verdict ("linkable without apology" or "not yet") is committed to `docs/launch/reference-parity-review.md`,
**And** "linkable without apology" from at least 2 of 3 external reviewers is required to clear the gate; below that threshold, specific qualitative gaps are scoped as additional work before launch,
**And** this reference-parity result, together with Story 6.5's differentiator-perception result, constitutes the user-facing launch gate (Epic 7 operational gates are separate).

---

## Epic 7: Operational Substrate and Launch Readiness

The maintainer can update kernels via a bot PR, review the auto-generated drift report, and approve from a phone — CI rebakes, runs the full 6-layer L1–L5 harness, deploys content-hashed assets, and posts a build manifest. The artifact passes every NFR gate (60 FPS, ≤3s TTI, ≤35 MB first-paint, ≤150 MB total). Cross-browser + real-device testing is green. The launch playbook is ready.

### Story 7.1: Drift Report Tool and Path-Filtered Kernel-Update Workflow

As the project maintainer,
I want a kernel-update PR to automatically generate a markdown drift report comparing positions against the prior pinned baseline, and to auto-fail if max drift exceeds 5 km,
So that I can approve kernel updates from a phone in under 30 minutes of attention time per the Journey 5 operational scenario, fulfilling FR53, FR54, NFR-M2.

**Acceptance Criteria:**

**Given** the drift-report tool,
**When** I inspect `bake/src/drift_report.py`,
**Then** it accepts two inputs: prior baseline manifest path and current bake manifest path,
**And** it loads kernels referenced by each manifest, samples each body at a deterministic ET grid (same grid used by the L1 validation harness), computes per-body and overall max position drift and RMS position drift,
**And** outputs a markdown report with sections per body (V1, V2, Sun, planets, moons), an overall summary row, a coverage-delta section listing which time windows gained or lost data, and a verdict line ("PASS" if `max_drift_km ≤ 5`; "FAIL" otherwise).

**Given** the kernel-update workflow,
**When** I inspect `.github/workflows/kernel-update.yml`,
**Then** the workflow is path-filtered on changes to `kernels/kernels-manifest.json`,
**And** triggers on PR open / synchronize against any branch targeting main,
**And** runs the bake + drift-report sequence: `just verify-kernels` → `just bake` → `just drift-report --baseline=$BASE_SHA --current=HEAD`,
**And** posts the markdown drift report as a PR comment (via `gh pr comment` or the GitHub Actions API),
**And** if the report's verdict line is "FAIL" (`max_drift_km > 5`), the workflow exits non-zero and the PR's status checks reflect the failure.

**Given** the maintainer experience per Journey 5,
**When** I approve a kernel-update PR from a phone,
**Then** all the maintainer needs to inspect is the bot-posted drift report and the workflow status,
**And** the total maintainer attention time from PR open to approval is ≤ 30 minutes (NFR-M2),
**And** the merge triggers the standard CI from Story 1.14 / 7.2 which re-bakes, runs the full L1–L5 harness, and deploys on green.

**Given** the drift-report determinism,
**When** I run the same drift report twice on identical inputs,
**Then** the markdown output is byte-identical (deterministic ET grid, deterministic float formatting, no timestamps in the output),
**And** the report tool is unit-tested in `bake/tests/test_drift_report.py` against synthetic baseline + perturbed-baseline fixtures.

**Given** the L2 + L4 + L5 stages downstream of the kernel update,
**When** a kernel update lands with a drift below threshold,
**Then** the L2 attitude fixture (Story 3.7) is flagged for regeneration if any CK kernel changed,
**And** the L4 visual-regression baselines (Story 4.9) are flagged for potential regeneration if any trajectory or attitude changed enough to perturb the pinned scenes — the drift report includes a "L4 baseline check recommended" note when `max_drift_km > 0.5` at any of the pinned encounter ETs.

---

### Story 7.2: L2 Trajectory Consistency and L5 Playwright E2E Mission Timeline

As the project maintainer,
I want Layer-2 trajectory consistency tests (distinct from Epic 3's L2 attitude consistency) and the Layer-5 Playwright E2E mission-timeline assertion to complete the 6-layer validation harness as CI gates,
So that FR55 is fully operational (L1 from Epic 1, L2-attitude from Epic 3, L2-trajectory + L5 from this story, L3 from Epic 1, L4 from Epic 4 + Epic 5) and NFR-P6 / NFR-M4 are gated.

**Acceptance Criteria:**

**Given** the L2 trajectory consistency test,
**When** I inspect `web/tests/l2-trajectory.spec.ts` and its fixture generator `bake/src/l2_trajectory_validation.py`,
**Then** the Python generator samples a fixed-seed set of at least 500 `(spacecraft, et)` pairs distributed across the full 1977–2030 mission window (including the encounter windows at higher density per the cadence schedule),
**And** at each sample, it records the SpiceyPy `spkpos` ground-truth position,
**And** writes `bake/out/l2-trajectory-fixture.json` deterministically.

**Given** the corresponding Vitest test,
**When** I run `npm test -- l2-trajectory`,
**Then** the test loads the fixture and calls `EphemerisService.getPosition(spacecraftId, et)` at every sample,
**And** asserts that the position difference vs ground truth is ≤ 20 km max and ≤ 5 km RMS across the full sample set (NFR-P9 runtime),
**And** the test fails with a descriptive message listing the worst-case sample if either threshold is exceeded.

**Given** the L5 Playwright E2E mission-timeline test,
**When** I inspect `web/tests/e2e/mission-timeline.spec.ts`,
**Then** the test navigates to the deployed dev build at `/`, waits for first-paint completion, sets the speed multiplier to 1,000,000× via keyboard (`+` × N stops or direct slider drag), presses play, and observes the simulation as it scrubs the full mission,
**And** asserts an event sequence: HUD chapter-title text changes to each chapter name in chronological order as ET crosses each chapter's `windowStartEt`, HUD date readout shows V1 Jupiter (1979-03-05) within tolerance, PBD (1990-02-14), V2 Neptune (1989-08-25), V1 heliopause (2012-08-25), V2 heliopause (2018-11-05), and finally reaches 2030-12-31,
**And** the wall-clock time from press-play to "ET ≥ 2030-12-31 00:00 UT" is ≤ 60 seconds per NFR-P6,
**And** the test asserts no frame exceeds 50 ms during the scrub (the harness samples Performance API frame timings; per NFR-P2).

**Given** the L1 + L2 + L3 test stage budget,
**When** the CI workflow runs L1 (Python validation) + L2-trajectory (Vitest) + L2-attitude (Vitest from Story 3.7) + L3 (Vitest unit tests),
**Then** the total wall-clock time is ≤ 5 minutes per NFR-M4.

**Given** the L4 + L5 test stage budget,
**When** the CI workflow runs L4 (Playwright visual regression from Stories 4.9 + 5.4 + 6.3 reduced-motion + 7.6 extreme-zoom) + L5 (Playwright E2E from this story),
**Then** the total wall-clock time is ≤ 15 minutes per NFR-M4.

**Given** the 6-layer harness is now fully operational,
**When** I inspect the CI workflow's job graph,
**Then** the harness layers run in dependency order: lint/typecheck → bake → bake-determinism → L1 → L2-trajectory + L2-attitude → L3 → build → L4 → L5 → deploy gate,
**And** any layer failure blocks deploy (FR55 enforced),
**And** the L6 (performance regression in CI) is explicitly recorded as deferred to v1.1 per the PRD scope cut — an ADR exists documenting this deferral with the planned implementation approach.

---

### Story 7.3: Build-Manifest Observability and Dependency Advisory Checks

As the project maintainer,
I want every CI build to emit a `build-manifest.json` recording every regression-sensitive value, plus advisory checks blocking deploy on high-severity dependency vulnerabilities,
So that NFR-M5 observability is operational and NFR-S6 supply-chain risk is gated.

**Acceptance Criteria:**

**Given** the build-manifest generation step,
**When** the CI workflow's build stage completes,
**Then** a step emits `build-manifest.json` as a GitHub Actions workflow artifact containing: per-asset sizes (first-paint critical bundle, full bundle, every individual JS/CSS/GLB/KTX2/PNG/audio file with byte counts), kernel manifest SHA-256 hashes, L1 validation max/RMS drift per body, L2-trajectory and L2-attitude pass/fail + worst-case error, L3 Vitest pass count + total, L4 Playwright baseline-match count + total, L5 E2E event-sequence assertions passed, frame-budget summary from a synthetic `/perf` run (median, P95, P99 frame time across the scripted scrub).

**Given** the manifest is attached to PR or build record,
**When** a PR adds a regression in any reported value (e.g., first-paint bundle increases by > 500 KB, P95 frame time increases by > 1 ms, L1 max drift increases by > 1 km),
**Then** a bot comment on the PR surfaces the delta in a markdown diff table,
**And** the bot comment is updated on each push (not duplicated),
**And** the regression detection thresholds are configured in `.github/workflows/build-manifest-diff.yml` with maintainer-tunable values.

**Given** the dependency advisory checks,
**When** the CI workflow runs the audit stage,
**Then** the workflow runs `npm audit --audit-level=high` (or `pnpm audit --audit-level high`) in `web/` and exits non-zero on any high-severity advisory,
**And** runs `uv pip check` plus the `uv` advisory check (or equivalent vulnerability scanner) in `bake/` and exits non-zero on any high-severity advisory,
**And** moderate / low severity advisories are reported in CI output but do not block,
**And** advisories with documented exceptions (e.g., a transitive dependency with no patched version yet but no actual attack surface in our usage) are tracked in `docs/security/advisory-exceptions.md` with expiry dates and justifications.

**Given** the build-manifest history,
**When** a maintainer wants to investigate a regression,
**Then** the GitHub Actions artifact retention is configured for ≥ 90 days,
**And** the manifest format is documented in `docs/observability/build-manifest-format.md` so future maintainers can read older manifests without context.

---

### Story 7.4: Content-Hashed Immutable Headers, CSP, and Deploy Rollback Rehearsal

As the project maintainer,
I want every deployed asset to be content-hashed immutable, every header (HSTS, CSP, Cache-Control) to be tight, and the rollback procedure rehearsed end-to-end with a documented ≤ 5-minute recovery time,
So that NFR-R2, NFR-R3, NFR-S1, NFR-S2, NFR-S9, FR58 are fully operational.

**Acceptance Criteria:**

**Given** the CDN provider configuration from Story 1.14,
**When** I inspect the provider's header configuration (`_headers` for Cloudflare Pages or `vercel.json` for Vercel),
**Then** `Cache-Control: public, max-age=31536000, immutable` is set on every immutable asset path: `/assets/*`, `/og/*`, `/data/*`, `/audio/*`, `/textures/*`, `/models/*`, `/fonts/*`,
**And** `Cache-Control: public, max-age=3600` is set on HTML routes (`/`, `/about`, `/c/*`, `/unsupported.html`),
**And** HTTPS is enforced with `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`,
**And** verified via `curl -I https://voyager.app/` and `curl -I https://voyager.app/assets/<any-asset>`.

**Given** the Content Security Policy per NFR-S2,
**When** I inspect the CSP header,
**Then** the policy is: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'` (the `'unsafe-inline'` is only for the inline first-paint critical CSS from Story 1.7 — documented in an ADR as the single justified exception), `img-src 'self' data:`, `connect-src 'self'`, `font-src 'self'`, `media-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors *` (to allow institutional iframe embedding per the Hanno / Journey 4 use case; if iframe embedding turns out to need restriction, this is tightened to a specific allowlist via an ADR follow-up),
**And** mixed-content is implicitly disallowed (HTTPS-only),
**And** no third-party scripts are loaded — verified by inspecting the CSP and the served HTML.

**Given** Subresource Integrity per NFR-S3,
**When** I inspect the served HTML and any `<script>` / `<link>` referencing external resources,
**Then** v1 loads zero external resources at runtime — every script, style, font, image, audio, and data file comes from the artifact's own CDN domain (NFR-S9),
**And** if any future v1.1 dependency is added from an external CDN, it must carry SRI hashes (the team commits to this; no enforcement gate in v1 because no external dependency exists).

**Given** the rollback procedure,
**When** I open `docs/deploy/rollback.md`,
**Then** the document describes the chosen CDN provider's rollback surface step-by-step (Cloudflare Pages: dashboard rollback or `wrangler pages deployment activate <id>`; Vercel: dashboard promote-prior or `vercel rollback <url>`),
**And** the document includes a decision tree: "the bake produced incorrect data" → rollback to prior deploy; "a UI regression slipped past CI" → rollback to prior deploy; "performance regression on a real device" → rollback to prior deploy plus open a regression issue.

**Given** the rollback rehearsal,
**When** I execute a test deploy + rollback exercise per `docs/deploy/rollback-exercise-log.md`,
**Then** I deploy a deliberately-broken artifact (e.g., a build with a known visual regression), confirm it serves on the production CDN, trigger the rollback procedure, and measure the wall-clock time from rollback trigger to prior-version visitor service,
**And** the measured time is ≤ 5 minutes per NFR-R3,
**And** the exercise log records the actual time, the steps executed, and any procedural friction encountered.

**Given** asset durability per NFR-R2,
**When** I deploy a new version after the rehearsal,
**Then** any asset URL from the prior deploy still resolves (the immutable filenames prevent collision),
**And** a `curl` test against a sampled set of prior-deploy URLs confirms 200 responses with the immutable cache headers.

---

### Story 7.5: `THIRD_PARTY.md` and `MISSION_FACTS.md` Final Audit

As the project maintainer,
I want a single committed `THIRD_PARTY.md` documenting every license and attribution requirement plus a `MISSION_FACTS.md` providing primary-source provenance for every dated/distanced/named fact in the artifact,
So that FR48 is fully closed (UI surface from Story 2.7 + canonical document here), NFR-M3 mission-fact provenance is operational, and NFR-S5 asset supply-chain integrity is documented.

**Acceptance Criteria:**

**Given** `THIRD_PARTY.md` at the repo root,
**When** I open it,
**Then** the file lists every third-party asset and data source with one section per source containing: name, source URL, license, attribution requirement, asset/track-level inventory (where applicable), and SHA-256 hash of the canonical files in the repo,
**And** the inventory covers at minimum: NAIF SPICE kernels (per-file inventory referencing `kernels/kernels-manifest.json`), PDS Rings Node CK products (per-file inventory with Mitch Gordan / QMW SEDR credits where relevant), NASA 3D Resources Voyager model, USGS Astrogeology base maps (per-planet), Björn Jónsson per-asset license terms (audited individually), Voyager Golden Record audio (track-by-track audit confirming no encumbering performance rights per Story 6.1), NASA Photojournal Pale Blue Dot composite plates (per-plate inventory from Story 5.3), JetBrains Mono + Source Serif 4 + Inter font OFL licenses,
**And** the file is committed and CI verifies its existence and non-emptiness as a build step (per the PRD §Data Provenance commitment).

**Given** `MISSION_FACTS.md` at `docs/`,
**When** I open it,
**Then** the file documents every pinned timestamp / encounter date / closest-approach distance / instrument-shutoff date with a primary-source citation per NFR-M3,
**And** the canonical entries include: V1 launch (1977-09-05), V2 launch (1977-08-20), V1 Jupiter closest approach (1979-03-05 12:05 UT), V2 Jupiter (1979-07-09 22:29 UT), V1 Saturn (1980-11-12 23:46 UT), V2 Saturn (1981-08-26), V2 Uranus (1986-01-24), V2 Neptune (1989-08-25), Pale Blue Dot (1990-02-14), V1 heliopause (2012-08-25, ~121 AU), V2 heliopause (2018-11-05, ~119 AU), closest-approach distances (Titan 6,490 km, Miranda 29,000 km, Triton 39,800 km, etc.), and historical instrument-shutoff dates for ISS, UVS, PLS, LECP per spacecraft.

**Given** a CI provenance-trace check,
**When** the CI workflow runs the final audit step,
**Then** every chapter spec's `anchorEt` is cross-referenced against `MISSION_FACTS.md` and the build fails if any anchor lacks a corresponding entry,
**And** the check is a simple structural validator (each `MISSION_FACTS.md` entry has a stable ID; each chapter spec references the ID via a comment or import),
**And** any new fact added to chapter copy that introduces a date/distance/count not in `MISSION_FACTS.md` triggers a CI warning recommending the maintainer add it.

**Given** the attribution UI surface from Story 2.7,
**When** I cross-check `<v-attribution-panel>` entries against `THIRD_PARTY.md`,
**Then** every source listed in `THIRD_PARTY.md` is represented in the attribution panel (either explicitly or via a parent category — e.g., individual Björn Jónsson per-planet assets roll up to a single "Björn Jónsson planetary textures" entry in the panel),
**And** the canonical license/attribution statements in the panel are consistent with `THIRD_PARTY.md` wording.

**Given** the asset supply-chain integrity per NFR-S5,
**When** I inspect the bake or build pipeline,
**Then** every third-party asset has its SHA-256 hash pinned in `THIRD_PARTY.md` AND in the asset manifest (`bake/out/manifest.json` for trajectory + attitude data; `web/dist/manifest.json` or equivalent for 3D models, textures, audio, photo plates),
**And** the CI build verifies these hashes at build time,
**And** any asset-hash mismatch fails the build (NFR-S5 gate operational).

---

### Story 7.6: Final Performance Pass on Mid-Range Laptop

As the project maintainer,
I want a documented launch-week performance pass on the canonical mid-range laptop, gating every Performance NFR before launch,
So that NFR-P1 / P2 / P3 / P4 / P5 / P8 / R5 are mechanically verified and any regression is caught before the public launch.

**Acceptance Criteria:**

**Given** the test rig documentation,
**When** I open `docs/performance/test-rig.md`,
**Then** the document names the specific mid-range laptop model used for launch-week measurement (matching NFR-P1's definition: 2024-or-newer integrated GPU; Intel Iris Xe, AMD Radeon Graphics, or Apple M-series base or equivalent),
**And** records the OS, browser version (latest stable Chrome at the time of pass), resolution (1280×720 and 1440×900 measured both), network condition (25 Mbps simulated for TTI testing).

**Given** the per-scene 60 FPS measurement,
**When** I run the simulation at each chapter scene + cruise + extreme zoom states for 60 seconds each,
**Then** sustained frame rate is ≥ 60 FPS at every scene on the test rig (NFR-P1),
**And** frame-time distribution is captured via Performance API on the `/perf` route: P95 ≤ 16.7 ms, P99 ≤ 22 ms, no frame > 50 ms during steady-state playback (NFR-P2; first three post-load frames excluded),
**And** results are committed to `docs/performance/launch-pass.md` with per-scene tables.

**Given** the time-to-interactive measurement,
**When** I run Lighthouse on the homepage from the test rig with 25 Mbps simulated bandwidth and cold cache,
**Then** time-to-interactive is ≤ 3 seconds (NFR-P3),
**And** the Lighthouse report is attached to `docs/performance/launch-pass.md`.

**Given** the asset bundle size gates,
**When** I inspect `build-manifest.json` from the launch-week build,
**Then** first-paint compressed bundle size is ≤ 35 MB (NFR-P4),
**And** full bundle size (including Golden Record audio, all 8k texture upgrades, all trajectory + attitude chunks, all PBD photo plates) is ≤ 150 MB compressed (NFR-P5),
**And** the per-file breakdown is recorded in the launch-pass document.

**Given** the extreme-zoom precision validation,
**When** I run the extended L4 Playwright suite covering extreme-zoom states (zoom to spacecraft sub-meter detail at one of the encounters + zoom to 165 AU heliopause far view + intermediate zoom levels),
**Then** the visual regression captures show zero z-fighting and zero positional jitter at every captured zoom state (NFR-P8),
**And** the extreme-zoom captures are added to the L4 CI suite alongside the encounter and PBD baselines.

**Given** the 30-minute session WebGL leak audit per NFR-R5,
**When** I run a sustained 30-minute browser session on the test rig (playing through the full mission at variable speeds, exercising scrubbing + chapter jumps + manual camera control),
**Then** the frame rate at minute 30 has degraded by ≤ 5% from the frame rate at minute 1,
**And** Chrome DevTools memory profiler shows no monotonic growth in WebGL resource memory (allocations are matched by deallocations),
**And** results are committed to the launch-pass document.

**Given** any NFR-P or NFR-R5 failure during this story,
**When** the failure is recorded,
**Then** Story 7.6 iterates on the underlying cause (profiling, code optimization, asset-size reduction) until every gate passes,
**And** the launch trigger from Story 7.9 cannot fire until this story's launch-pass document confirms all gates green.

---

### Story 7.7: Cross-Browser and Real-Device Tier 1/2/3 Testing

As the project maintainer,
I want the artifact verified across the documented browser matrix and real devices for all three tiers,
So that NFR-C1 / C2 / C3 and UX-DR37 are operational before launch.

**Acceptance Criteria:**

**Given** the Tier 1 desktop browser matrix per NFR-C1,
**When** I run the manual verification pass,
**Then** Chrome, Firefox, and Safari (latest two stable versions of each) on macOS are tested at 1280×720, 1440×900, and 1920×1080,
**And** Chrome and Edge on Windows are tested at the same resolutions,
**And** Firefox on Linux is tested at 1920×1080 (minimum),
**And** each browser × resolution × OS combination is verified for: first-paint sequence, scrubber interaction, chapter jump (marker click + keyboard + chapter index), deep-link URL entry, embed-mode rendering, About page accessibility, focus-ring rendering,
**And** results are committed to `docs/testing/cross-browser-launch-pass.md` with per-combination pass/fail and screenshots of any visual differences.

**Given** the Tier 2 tablet matrix per NFR-C2,
**When** I run the real-device verification on iPad (latest Safari) and Samsung Galaxy Tab (latest Chrome),
**Then** both devices are tested in landscape and portrait orientation,
**And** touch scrubber drag (mission + detail variants), pinch-zoom on canvas, chapter copy bottom-sheet drawer behavior, chapter index touch operation, embed-mode rendering on a borderless tablet browser session are all verified working,
**And** 44×44px touch targets are confirmed adequate for finger interaction.

**Given** the Tier 3 phone matrix per NFR-C3,
**When** I run the best-effort verification on iPhone (latest Safari) and Pixel (latest Chrome),
**Then** the artifact loads and the scrubber works,
**And** performance is acceptable per the 30 FPS phone floor (the artifact does not need to hit 60 FPS on phones per NFR-P1 definition),
**And** any non-blocking visual artifacts are documented in the cross-browser-launch-pass document as known Tier 3 limitations (not blocking for launch per the PRD scope cut on phone polish).

**Given** the network-throttling test,
**When** I run a Tier 1 desktop session with 4G network simulation in Chrome DevTools,
**Then** time-to-interactive remains ≤ 3 seconds (NFR-P3 holds on throttled connection — first-paint bundle ≤ 35 MB makes this achievable),
**And** chunk-prefetch behavior is verified (the speed multiplier auto-caps at chunk boundaries without showing a spinner; UX-DR32 invisible loading).

**Given** any failure during this story,
**When** a browser × device combination fails for a Tier 1 or Tier 2 criterion,
**Then** Story 7.7 iterates on the underlying cause until the failure is resolved,
**And** Tier 3 failures are documented as known limitations but do not block launch.

---

### Story 7.8: 25-ADR Completion Audit and Index Cleanup

As the project maintainer,
I want the ADR catalogue audited for completeness, with every architectural decision made during Epics 1–6 either covered by an existing ADR or supplemented by a follow-on ADR,
So that NFR-M1 is fully operational and the artifact survives multi-year maintenance per the AR26 / NFR-M6 commitment.

**Acceptance Criteria:**

**Given** the Phase 0 ADR catalogue from Story 1.2,
**When** I audit the catalogue against the architecture document's documented decisions and the technical research's "Rejected Technical Ideas" inventory,
**Then** every architectural decision listed in `architecture.md` §Core Architectural Decisions has a corresponding ADR (or is documented as covered by a parent ADR),
**And** every "rejected technical idea" from the technical research has an ADR explaining the rejection rationale and the chosen alternative (per NFR-M1),
**And** ADR 0016 (CDN provider) has its final selection recorded per Story 1.14.

**Given** new architectural decisions made during Epics 2–6,
**When** I identify any decision that emerged downstream (e.g., the V1S/V2N gravity-assist visual validation approach from Story 4.8, the PBD turn-pacing 50× internal time mapping from Story 5.2, the audio-fade duration choice from Story 6.1, the CSP `'unsafe-inline'` exception from Story 7.4),
**Then** each such decision has a follow-on ADR added to the catalogue with a sequence number higher than 0025,
**And** the count of ADRs is at minimum 25 (the original catalogue) plus however many downstream decisions emerged,
**And** the final count is documented in `docs/adr/README.md`.

**Given** the index regeneration,
**When** I run `just adr-index`,
**Then** `docs/adr/README.md` is regenerated to list every ADR with its title and status (`Proposed`, `Accepted`, `Superseded`, `Deprecated`),
**And** any orphaned draft ADRs are either completed and marked `Accepted` or removed entirely,
**And** any superseded ADR explicitly references its successor.

**Given** the deferral ADRs,
**When** I review ADRs that document v1.1+ deferrals,
**Then** each deferral ADR records the deferred feature (wide-angle camera boresight cone, rotation-blend in view-frame, L6 performance regression harness in CI, spoken narration, plasma roll maneuvers, etc.) with the conditions under which the deferral would be revisited,
**And** these ADRs collectively form the v1.1+ roadmap reference per AR / NFR-M6 (the artifact survives the developer leaving because future maintainers can read the ADRs to understand the deferred scope).

---

### Story 7.9: Public Launch Playbook and Launch-Gate Pre-Flight

As the project maintainer,
I want a documented pre-flight checklist that gates every launch criterion plus a public-launch playbook ready to execute,
So that the launch trigger is a single confident manual action by the maintainer after every gate has been confirmed green.

**Acceptance Criteria:**

**Given** the pre-flight checklist at `docs/launch/pre-flight-checklist.md`,
**When** I open it,
**Then** the checklist enumerates every launch gate with its source story and pass criterion: Epic 6 differentiator-perception gate (Story 6.5; ≥ 50% of friendly users notice attitude reconstruction unprompted at V1 Jupiter; AT user issues resolved), Epic 6 reference-parity gate (Story 6.6; ≥ 2 of 3 external reviewers verdict "linkable without apology"), Epic 7 drift-report flow operational (Story 7.1), Epic 7 L1–L5 harness all green (Story 7.2), Epic 7 build-manifest + dependency advisories clean (Story 7.3), Epic 7 deploy rollback rehearsal complete with ≤ 5 min recovery time (Story 7.4), Epic 7 `THIRD_PARTY.md` + `MISSION_FACTS.md` audits complete (Story 7.5), Epic 7 performance launch pass green on test rig (Story 7.6), Epic 7 cross-browser + real-device matrix green (Story 7.7), Epic 7 ADR catalogue audit complete (Story 7.8).

**Given** the OG card paste-test verification,
**When** I manually paste each chapter URL into iMessage, Slack, Twitter/X, and Discord,
**Then** the OG card renders correctly in each app showing the per-chapter image, title, and description,
**And** the homepage URL paste-test shows the default V1 turn-around frame (or the chosen launch-week default thumbnail) per the J1 HN-submission scenario,
**And** any OG card rendering anomaly per platform is documented and remediated before launch (e.g., Twitter's aspect-ratio requirements, Discord's preferred image size).

**Given** the public launch playbook at `docs/launch/playbook.md`,
**When** I open it,
**Then** the playbook documents the rollout sequence: HN submission first (Tuesday or Wednesday morning ET for best HN traffic timing, with the title "See what Voyager saw — a 50-year mission, in your browser" per the J1 scenario), then r/space and r/NASA submissions, then collectSPACE, then Twitter/X announcement thread,
**And** each submission has prepared accompanying text (one-paragraph submission body for HN, post text for Reddit subs, tweet thread for Twitter/X) written in the dignified register matching the artifact's voice — no clever copy, no urgency, no marketing language,
**And** prepared response templates exist for inbound from NASA/JPL, Planetary Society, museums, and educators — each template emphasizes "bonus, not goal" per the PRD's institutional-amplification framing and is honest about the artifact being a single-developer portfolio piece.

**Given** the launch-trigger commitment,
**When** every gate in the pre-flight checklist is confirmed green and the maintainer is ready to execute,
**Then** the launch trigger is a single manual action by the maintainer (executing the HN submission per the playbook); this story does NOT auto-trigger the launch,
**And** the playbook records the launch date once the maintainer executes it (this row is filled in post-launch).

**Given** the post-launch maintenance commitment per NFR-M6,
**When** the artifact is live,
**Then** the maintainer monitors HN/Reddit/Twitter response for the first 48 hours (per the PRD §Distribution / signal of success commitment),
**And** any post-launch issues (visual regressions discovered by visitors, inbound from institutional reviewers, kernel-update PRs from bots) are handled per the documented operational flows from Stories 7.1–7.4,
**And** the launch is considered "complete" once the artifact is stable for 7 days post-launch with no rollback required.

**Given** the launch is opportunity timing, not a deadline,
**When** any pre-flight gate fails or any launch-week issue surfaces,
**Then** the launch is delayed without anxiety per the PRD §Anniversary opportunity commitment,
**And** the maintainer iterates on the failing gate until it passes,
**And** the artifact stands on its own merit — the 2027-09-05 anniversary is opportunity timing, not the gate.
