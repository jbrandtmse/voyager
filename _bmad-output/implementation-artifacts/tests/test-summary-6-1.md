# Test Automation Summary — Story 6.1 (Golden Record Audio Bundle, `<v-audio-toggle>`, Chapter-Marker Activation)

**Story:** `_bmad-output/implementation-artifacts/6-1-golden-record-audio-bundle-v-audio-toggle-and-chapter-marker-activation.md`
**Stage:** QA (`bmad-qa-generate-e2e-tests` under `/epic-cycle`)
**Date:** 2026-05-24
**Story type:** Service-introducing, user-facing — NEW `AudioPlaybackService`, NEW `<v-audio-toggle>` component, NEW lib `text-input-focus`, NEW 5 audio assets, ChapterDirector + ClockManager bootstrap wire-up, ADR-0019 Rule 5 amendment, About-page methodology paragraph, `THIRD_PARTY.md` + curation doc.
**Test framework:** Vitest 4.1.6 (default `npm test` sweep)

## QA disposition — full-coverage story; targeted defense additions for cross-cutting gaps

Story 6.1 is a user-facing audio + UI + persistence story. The dev shipped three new test files covering the three obvious test tiers thoroughly:

1. `web/tests/audio-playback-service.test.ts` (24 tests) — service unit tier: state transitions, persistence reset on session-id mismatch, in-memory fallback on storage failure, subscriber notify-hardening, dispose hygiene.
2. `web/tests/v-audio-toggle.test.ts` (21 tests) — component unit tier: `aria-pressed` reflect, click handler, `G` shortcut with all modifier guards + text-input guards + lifecycle (connect/disconnect/reconnect), Rule 10 verification.
3. `web/tests/audio-playback-integration.test.ts` (17 tests) — end-to-end integration tier: `AudioPlaybackService` × real-shaped `ChapterDirector` × `ALL_CHAPTERS` registry, exercising every Golden-Record slug, pause/resume propagation, reduced-motion non-effect, toggle-state lifecycle.

Coverage is strong inside each tier. The CROSS-CUTTING contracts that span tiers, that span planning artifacts, or that codify infrastructure-level invariants need a defense file. QA ships ONE file at `web/tests/story-6-1-qa-defense.test.ts` covering seven cross-cutting gap classes.

## QA gap filler added — Story 6.1 cross-cutting defense

**File:** `web/tests/story-6-1-qa-defense.test.ts` (NEW — 43 tests; runs in ~0.23s).

**Why this defense exists.** The dev's three test files validate the BEHAVIORAL contract of the audio service + toggle, exercised against stubbed engines and stubbed storage. They do NOT validate:

- The bootstrap wire-through `startFirstPaint(...)` that proves the toggle mounts in both normal AND embed mode (AC2).
- The contract that engine-thrown errors leave the service in a coherent flag state (autoplay-policy-rejection defense; AC5 implicit contract).
- The no-analytics / no-PII / no-server posture of the NEW audio service surface (ADR-0019 amendment defense).
- The Rule 5 amendment integrity for ADR-0019 (original wording preserved + amended block present).
- The cross-references between curation doc + THIRD_PARTY + attribution panel + About page.
- The on-disk existence of the 5 Golden-Record audio files + their slug-to-URL map integrity.
- The `.gitattributes` LFS pattern for `web/public/audio/**.m4a`.

The defense file pins all seven against silent drift at sub-second vitest cost.

**Pattern precedent.** Mirrors `web/tests/story-6-0-cross-reference-defense.test.ts` (Story 6.0 — cross-reference rot defense for process artifacts) and `web/tests/pale-blue-dot-composite-qa.test.ts` (Story 5.3 — multi-faceted asset + cross-reference + on-disk defense).

**What the 43 tests pin (grouped into 7 describe blocks):**

1. **AC2 — embed-mode visibility for `<v-audio-toggle>` (4 tests).** Pins that the toggle mounts in BOTH normal AND embed mode (it is content, not chrome), that `audioToggle === null` in the handle when no service is wired (legacy test mounts), and that the `.audioService` injection happens at `startFirstPaint` time so the component's `connectedCallback` sees the service synchronously.

2. **AC5 — engine-failure resilience (2 tests).** Pins current behavior: when `audioEngine.fadeIn` throws (e.g., autoplay-policy `NotAllowedError`), the service's internal flags (`isOn`, `activeSlug`) are already updated BEFORE the engine call, so a synchronous engine throw does NOT corrupt subscriber state. Documents that the current implementation does NOT wrap engine calls in try/catch — a future hardening refactor should revisit these tests.

3. **ADR-0019 — no-analytics / no-PII / no-server gate on the new audio surface (20 tests).** Scans `web/src/services/audio-playback-service.ts` and `web/src/components/v-audio-toggle.ts` for forbidden patterns: `fetch(`, `XMLHttpRequest`, `sendBeacon`, `navigator.geolocation`, `document.cookie`, `IndexedDB`, `sessionStorage`, third-party tracking domain refs, and known analytics package names. Plus two structural pins: the localStorage key is EXACTLY `'voyager.audio-toggle'`, and the persisted JSON shape is EXACTLY `{ sessionId, on }` (no extra fields). Extends the existing `no-pii-grep.test.ts` posture to the new audio surface.

4. **ADR-0019 Rule 5 amendment integrity (4 tests).** Pins that the ADR file exists, that the Status line annotates the in-place amendment per Rule 5 by Story 6.1, that the HTML-comment block preserves the original "localStorage-only error capture" wording verbatim AND that the amended block describes the second use case (`voyager.audio-toggle` + `sessionId`), and that the Decision section documents the SECOND localStorage use case explicitly.

5. **Curation doc + THIRD_PARTY + attribution + about-page cross-references (5 tests).** Pins existence of `docs/audio/golden-record-curation.md`; THIRD_PARTY.md has a Golden Record section referencing Story 6.1; the curation doc covers license + checksum + encoding + persistence contract; the attribution panel references THIRD_PARTY.md; the About page contains the diegetic-vs-narration methodology paragraph (AC6 load-bearing wording).

6. **Slug / URL / on-disk integrity (7 tests).** Per-slug parametrized test confirms each of the 5 Golden-Record audio files exists at the URL-mapped disk path, the file is non-empty (placeholders silent-AAC ~32 KB are non-zero), every URL matches the `/audio/golden-record/<slug>.m4a` shape, and the slug-to-URL map has EXACTLY the 5 expected keys (no extras / no missing). The dev's placeholder-fallback decision is preserved — the files only need to exist + be non-empty; content authenticity is deferred to real-procurement.

7. **`.gitattributes` LFS pattern (1 test).** Pins that `.gitattributes` declares LFS tracking for `web/public/audio/**.m4a` so the binary bundle does not bloat git history. Defends against an accidental removal of the LFS rule during a future `.gitattributes` reorg.

**Trade-off / non-redundancy with dev tests.** The defense file does NOT re-prove behavior the dev's three files already cover. It pins cross-cutting contracts AND extends the no-PII grep posture to a new code surface (defense in depth on the ADR-0019 amendment's "no analytics, no PII, no server" promise). The 43 tests run in ~0.23s end-to-end — negligible cost.

## AC-by-AC verification

| AC | Dev coverage | QA verdict |
|---|---|---|
| AC1 — Golden Record audio bundle (5 files, AAC `.m4a`, ≤32 MB, `.gitattributes` LFS, THIRD_PARTY.md section, attribution panel update, curation doc) | Placeholder 5 m4a files at ~32 KB each (160 KB total — well under Rule 12's 500 MB threshold); `.gitattributes` updated with `web/public/audio/**/*.m4a filter=lfs`; THIRD_PARTY.md `## Voyager Golden Record audio assets (Story 6.1)` section; `v-attribution-panel.ts` updated; `docs/audio/golden-record-curation.md` shipped. Dev tests cover the slug-to-URL map (`AUDIO_BY_CHAPTER_SLUG` constants in `audio-playback-service.test.ts` "Golden Record constants" describe block). | **OK** — QA pins (a) per-slug on-disk file existence + non-empty bytes; (b) THIRD_PARTY.md Golden Record section presence; (c) curation doc covers license + checksum + encoding + persistence; (d) `v-attribution-panel.ts` references THIRD_PARTY.md; (e) `.gitattributes` LFS pattern. Placeholder posture is acceptable per the dev's documented decision; QA does NOT enforce content authenticity (that's a real-procurement gate, deferred). |
| AC2 — `<v-audio-toggle>` component (native button, `aria-pressed`, glyphs, Rule 10, embed-mode visibility) | `web/tests/v-audio-toggle.test.ts` (21 tests) covers render state + click handler + Rule 10 verification (descriptor probe for the Lit-generated accessor) + lifecycle. | **OK** — Dev's component tier is thorough. QA adds (a) embed-mode mounting via `startFirstPaint(..., { embedEnabled: true, audioPlaybackService })`; (b) `audioToggle === null` when no service wired; (c) `.audioService` injection ordering. The component-as-content (not chrome) posture is now permanently pinned. |
| AC3 — `G` keyboard shortcut | Dev's component tests cover lowercase `g`, uppercase `G`, Ctrl/Alt/Meta suppression, text-input guard for `<input>` / `<textarea>` / `contenteditable`, `<button>` does NOT suppress (only text inputs do), other keys are ignored, disconnect removes the listener, reconnect re-installs. | **OK** — Dev coverage is exhaustive. AC3's note about help-overlay-modal-suppression is intentionally NOT enforced by either dev or QA: the dev's comment block in `v-audio-toggle.ts:38-45` documents the deliberate choice that `G` flips while the help modal is open (the modal stays open; the toggle flips). QA confirms the implementation matches the documented contract — no additional test needed. |
| AC4 — Off-by-default + session-id-gated localStorage + try/catch fallback | Dev's service tests (`audio-playback-service.test.ts`) cover write-on-toggle, restore-on-matching-sessionId, reset-on-mismatch, ignore-garbage-JSON, ignore-wrong-shape, throwing-storage fallback, null-storage fallback. | **OK** — Dev coverage is exhaustive. QA adds defense scans for forbidden patterns (`sessionStorage`, `IndexedDB`, `document.cookie`, etc.) to enforce the ADR-0019 amendment's "localStorage-only" promise against future drift, plus an exact-key + exact-schema pin (`'voyager.audio-toggle'` / `{ sessionId, on }`). |
| AC5 — Chapter-window activation + 1500 ms cross-fade + scrub semantics + pause/resume | Dev's integration tests (`audio-playback-integration.test.ts`) cover every Golden-Record slug (`for ... of GOLDEN_RECORD_CHAPTER_SLUGS` parametrized), cross-window scrub (V1L → V2L), reverse scrub fades out cleanly, V1 Jupiter has no audio activation (final state), pause/resume propagation, reduced-motion non-effect (1500 ms preserved). | **OK** — Dev tier is thorough. QA adds engine-throw resilience defense (autoplay-policy-rejection style failure does not crash the service flag state). |
| AC6 — Reduced-motion does NOT affect audio + About page diegetic vs narration | Dev's integration tests cover reduced-motion non-effect via `matchMedia` stub × 2 (reduced-motion + reduced-transparency). About page update in `web/src/components/v-about-page.ts`. | **OK** — QA adds a pin on the diegetic-vs-narration wording in `v-about-page.ts` (the AC6 load-bearing methodology paragraph). Future editorial edits that remove the distinction fail here at vitest cost. |
| AC7 — Integration AC (end-to-end chapter-window activation) | Dev's `audio-playback-integration.test.ts` exercises the production wire-up topology (ChapterDirector subscriber narrowed on `isGoldenRecordSlug`, `to === 'held'` / `from === 'held'` events). Lead's Chrome DevTools MCP smoke is the real-runtime gate per Rule 3. | **OK** — Dev's integration test is the happy-dom-tier defense; the lead's AC7 MCP smoke is the canonical real-runtime gate (not QA's responsibility per the prompt; `_bmad-output/implementation-artifacts/6-1-smoke-evidence/` is the lead's evidence directory, created at lead-verification time). |
| AC8 — Test sweep + lint baseline + ADR compliance + Rule 8 / 10 / 12 verification | Dev's recorded baseline: 3429 passed / 10 skipped (was 3366 post-Story-6.0; +63 dev tests); typecheck clean; lint 4 warnings / 0 errors (baseline). | **OK** — QA re-verified locally: web vitest **3472 passed / 10 skipped / 192 files** (was 3429 post-dev; **+43 from `story-6-1-qa-defense.test.ts`**); typecheck clean; lint 4 warnings / 0 errors (baseline preserved). ADR-0019 amendment integrity defended explicitly. |

All eight ACs verified.

## Test stages

### Vitest unit / integration (default `npm test` sweep)
- **Status:** 1 new test file authored — `web/tests/story-6-1-qa-defense.test.ts` (43 tests; runs in 0.23s). Dev's three files carried in (62 tests; runs in 2.06s combined).
- **Discoverability (Rule 13):** filename matches vitest's default `*.test.ts` glob; under `web/tests/`; no `.skip`, no env-gate, no `xfail`; the `@vitest-environment happy-dom` directive routes the defense through happy-dom so `startFirstPaint(...)` can mount Lit elements for the embed-mode pin. Verified via `npx vitest run tests/story-6-1-qa-defense.test.ts` → 43/43 pass in 2.55s, then full sweep `npm test -- --run` → **3472/10 skipped / 192 files**.
- **Pass-count baseline:** 3429 (dev's count post-T9) → **3472** (+43 from QA's defense file). Typecheck clean. Lint 4 warnings / 0 errors (baseline preserved; same three pre-existing warnings the dev recorded — `web/src/render/skybox.ts:117`, `web/src/services/ephemeris-service.ts:183,224`, `web/tests/celestial-defense-extended.test.ts:100`).
- **Flake note:** two intermediate sweep runs surfaced transient failures in `tests/build-dist-layout.test.ts` (Playwright + `vite preview` + concurrent OG-card temp-dir races); the third clean run confirmed 192 files / 3472 / 10 skipped with no failures. The flaky tests are pre-existing (Story 6.0's build-pipeline tier; unrelated to Story 6.1's audio changes); flagging here for the lead's awareness rather than blaming Story 6.1.

### Playwright build-pipeline (`tests/visual/` runner — `npm run test:visual`)
- **Status:** No new visual specs. Story 6.1 ships no chapter-spec changes or HUD-layout changes; the audio toggle is a new bottom-left button whose render is unit-tested in `v-audio-toggle.test.ts` and whose mount-position is verified in the new embed-mode defense. The `tests/visual/` baseline runner is not the right tier for binary on/off toggle button behavior.

### Chrome DevTools MCP smoke (per Voyager test-tier policy — Rule 3 + Rule 8)
- **Status:** **LEAD GATE — AC7.** The lead's Chrome DevTools MCP smoke is the canonical real-runtime gate per Rule 3 (real browser AudioContext, real autoplay-policy gesture-gating, real `<audio>` HTMLAudioElement with the 5 placeholder tracks served by `vite preview`). The dev's customize.toml-injected "Chrome DevTools MCP smoke stage" was applied at the QA-skill invocation; the actual smoke is the LEAD's AC7 gate, not QA's vitest tier. Story 6.1 heavily touches `web/src/` (new service, new component, new lib, bootstrap wire-up, About page) so the lead's smoke is REQUIRED. Evidence will land at `_bmad-output/implementation-artifacts/6-1-smoke-evidence/` during the lead's verification cycle (per AC7 + Rule 3).

### Bake fast pytest
- **Status:** Not re-verified locally (no `uv` / `spiceypy` on QA's Windows host — same posture as Story 5.0 / Story 6.0 precedent). Story 6.1 touches no bake surface (`bake/` is unchanged); dev's recorded baseline (430-passing) accepted as evidence per the established precedent.

## Coverage statement

- AC1: dev's `AUDIO_BY_CHAPTER_SLUG` constant tests + QA's per-slug on-disk-existence + non-empty-bytes + URL-shape + slug-set-integrity + THIRD_PARTY section + curation doc content + attribution panel cross-ref + `.gitattributes` LFS pattern (8 dev + 14 QA tests).
- AC2: dev's 21 component-tier tests + QA's 4 embed-mode mount + service-injection tests (25 tests).
- AC3: dev's 11 keyboard-shortcut + lifecycle tests (G shortcut comprehensively covered).
- AC4: dev's 7 persistence tests + QA's 11 no-analytics/no-PII surface scan + 1 storage-key + 1 schema-shape (20 tests).
- AC5: dev's 8 chapter-window-activation tests + QA's 2 engine-throw resilience (10 tests).
- AC6: dev's 2 reduced-motion stub tests + QA's 1 About-page diegetic-wording pin (3 tests).
- AC7: dev's 17 integration tests; lead's MCP smoke is the real-runtime gate.
- AC8: meta-AC; QA confirms baseline preserved + typecheck + lint.
- Plus 4 ADR-0019 Rule 5 amendment integrity tests (QA-only).
- Combined: **105 new tests** ship under Story 6.1 (62 dev + 43 QA). Pre-Story-6.1 baseline 3366 → post-dev 3429 → post-QA **3472**.

## Tests Added

- `web/tests/story-6-1-qa-defense.test.ts` (43 tests across 7 describe blocks — embed-mode visibility / engine-failure resilience / no-analytics scan of new audio surface / ADR-0019 Rule 5 amendment integrity / curation+THIRD_PARTY+attribution+about-page cross-references / per-slug on-disk file + URL map integrity / `.gitattributes` LFS pattern)

## Decisions

- **Defense file covers cross-cutting + cross-file contracts only — does NOT duplicate dev's three-tier behavioral coverage.** The 43 QA tests target contracts that span tiers (embed-mode bootstrap), span planning artifacts (ADR-0019 amendment integrity), or extend an existing gate (the no-PII grep) to a new code surface. No duplication with dev's 62 tests.
- **Did NOT add a help-overlay-suppresses-G test.** The dev's `v-audio-toggle.ts:38-45` comment block deliberately documents that `G` flips the toggle even while the help overlay modal is open — AC3 explicitly permits this. Asserting suppression would test behavior the implementation chose NOT to provide; the QA file instead leaves AC3 to the dev's already-thorough keyboard-shortcut coverage.
- **Engine-failure tests document CURRENT POSTURE (engine throws propagate), not aspirational behavior.** The service does NOT wrap `audioEngine.*` calls in try/catch (only subscriber callbacks are hardened). The QA defense pins this fact so a future hardening refactor that adds the wrap also revisits the test expectations. A `.toThrow()` flip-to-`.not.toThrow()` is the canonical signal.
- **Placeholder audio files accepted per dev's documented decision.** The QA on-disk-existence pins require only that the 5 files exist and are non-empty; SHA-256 content authenticity is deferred to the real-procurement cycle (callout in `docs/audio/golden-record-curation.md`). The runtime contract works end-to-end with placeholders.
- **No additional Playwright / visual specs.** Story 6.1 introduces no new chapter spec, no HUD layout change, no canvas surface change. Visual baseline tier not applicable.
- **Lead's AC7 Chrome DevTools MCP smoke remains the real-runtime gate.** QA's happy-dom integration coverage (dev's `audio-playback-integration.test.ts` × QA's bootstrap pin) is the per-tier confidence layer; the lead's real-browser smoke against `vite preview` is the binding contract per Rule 3.

## Issues Encountered

- **Two flaky test runs during QA verification (cleared on the third run).** During the QA stage's full-sweep runs, two intermediate executions showed transient failures in `tests/build-dist-layout.test.ts` (Story 6.0's Playwright tier; one run also showed an unrelated test in another file). The third clean run confirmed all 192 files / 3472 / 10 skipped passing. The flakes appear correlated with `vite preview` + Playwright `chromium.launch()` + concurrent `og-cards` temp-dir creation in parallel runs (the `[og-cards] FAIL:` diagnostics in verbose output are temp-dir cleanup races, not test assertions). The flakes are PRE-EXISTING (introduced with Story 6.0's build-dist-layout test) and UNRELATED to Story 6.1's audio changes. Flagged for the lead's awareness; not a Story 6.1 blocker.
- All eight ACs verified; final sweep clean.
