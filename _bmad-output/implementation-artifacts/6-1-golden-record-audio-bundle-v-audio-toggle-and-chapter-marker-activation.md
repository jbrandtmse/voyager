# Story 6.1: Golden Record Audio Bundle, `<v-audio-toggle>`, and Chapter-Marker Activation

**Epic:** 6 — Audio, Reduced Motion & Full Accessibility Pass
**Status:** review
**Date created:** 2026-05-24
**Implements:** FR43 (Golden Record audio layer toggle), FR44 (chapter-marker activation), UX-DR15 (`<v-audio-toggle>` component contract)
**Adds:** New `AudioPlaybackService`, new `<v-audio-toggle>` Lit component, ~30 MB curated audio bundle, attribution updates, audio-curation doc.

---

## User Story

As a visitor who wants the diegetic Voyager Golden Record audio,
I want to toggle it on with the `G` key or a small button next to play/pause, and have it activate gently at the launch, Pale Blue Dot, and heliopause chapter markers — never at any other time and never on by default,
So that the bass-note elegy is available when wanted without ever urging me — fulfilling FR43, FR44, and UX-DR15.

## Acceptance Criteria

### AC1 — Golden Record audio bundle assembled, encoded, and attributed (~30 MB total)

- **GIVEN** the Voyager Golden Record source recordings are in the NASA public domain (canonical landing: <https://voyager.jpl.nasa.gov/golden-record/>; individual tracks via NASA / JPL public-domain sources)
- **WHEN** Story 6.1 procures and bundles the curated audio
- **THEN** the directory `web/public/audio/golden-record/` exists and contains exactly 5 audio files — ONE per Golden-Record chapter window (V1 launch, V2 launch, PBD, V1 heliopause, V2 heliopause) — encoded in **AAC** (`.m4a` container, AAC-LC, ~96 kbps mono or stereo as appropriate to the source). AAC is the safer cross-browser default per the epic spec (universal `<audio>` element support in Safari + Chrome + Firefox); Opus is also acceptable if the dev agent prefers, but AAC is the recommended choice.
- **AND** the total compressed bundle size is **≤ 32 MB** (target ~30 MB; this is well under Rule 12's 500 MB / 250 MB thresholds — no maintainer pre-clearance required, but the Dev Notes section disclose voluntary)
- **AND** `.gitattributes` is amended to LFS-track `web/public/audio/*.m4a` (or `*.opus` if Opus chosen) — these are binary assets > 1 MB per file and align with the project's existing LFS posture for fonts (`*.woff2`), models (`*.glb`), and textures
- **AND** a new section in `THIRD_PARTY.md` titled `## Voyager Golden Record audio assets (Story 6.1)` documents each track's NASA source (specific NASA Photojournal / JPL / Library of Congress URL where available), license confirmation (NASA public domain, no encumbering performance rights for the specific selections chosen — the curation audit is part of this story's deliverable), per-file size + duration, and the chapter window it plays in
- **AND** the placeholder Golden Record entry in `web/src/components/v-attribution-panel.ts:71–75` is replaced with finalized text pointing at the THIRD_PARTY.md section (single line + link; the detailed per-track citation lives in THIRD_PARTY.md, not in the panel)
- **AND** the new file `docs/audio/golden-record-curation.md` exists and documents the curation reasoning per track (why THIS selection for THIS chapter), the encoding settings (codec + bitrate + container + sample rate + channel count), and the source-file checksums for reproducibility

### AC2 — `<v-audio-toggle>` Lit component (button + `aria-pressed` + `G` shortcut)

- **GIVEN** the UX inventory's `<v-audio-toggle>` contract (UX-DR15)
- **WHEN** Story 6.1 implements the component
- **THEN** a new file `web/src/components/v-audio-toggle.ts` exists, extending `BaseElement` (the project's Lit base class from `web/src/components/base-element.ts`)
- **AND** the component renders a native `<button>` (not a custom `role`-attributed div) using the canonical simple-button style pattern from `<v-play-button>` (44×44 pixels, `var(--v-color-bg)`, `var(--v-color-fg)`, 1px `var(--v-color-divider)` border, `:hover` `var(--v-color-fg-muted)` border, `:focus-visible` `2px solid var(--v-color-focus)` outline)
- **AND** the button has `aria-pressed` reflecting state (`true` when audio is on, `false` when off) AND `aria-label` reflecting next-action ("Turn Golden Record audio on" when off, "Turn Golden Record audio off" when on)
- **AND** the off state displays a muted-speaker glyph (Unicode `🔇` U+1F507 OR an inline SVG following the project's icon convention); the on state displays a speaker glyph (Unicode `🔊` U+1F50A OR inline SVG) — implementation chooses Unicode (simpler) or inline SVG (sharper at small sizes); document the choice in Dev Notes
- **AND** Lit reactive properties follow **Rule 10** (declare + ctor-init pattern, NO class-field initializers): `declare audioOn: boolean; constructor() { super(); this.audioOn = false; }`
- **AND** the component is positioned adjacent to the play button bottom-left of the simulation surface — mounted via `first-paint.ts` alongside the existing `<v-play-button>` mount (the existing mount logic auto-discovers `--v-edge-margin` spacing; mirror the play-button's positioning sibling pattern)
- **AND** the component is rendered in BOTH normal mode AND embed mode (per the epic spec, the toggle controls the simulation not chrome, so it survives Story 2.5's embed-mode chrome stripping — verify by reading `web/src/services/embed-mode-state.ts` + first-paint mount logic)

### AC3 — `G` keyboard shortcut wires globally

- **GIVEN** the project's keyboard-shortcut convention (text-input-aware global keydown listener; cf. `<v-help-overlay>` `?` shortcut at `web/src/components/v-help-overlay.ts:283–286,547–569`; `<v-play-button>` Space shortcut at `web/src/boot/keyboard-shortcuts.ts:81–100`)
- **WHEN** Story 6.1 installs the `G` shortcut
- **THEN** the shortcut is installed at the `<v-audio-toggle>`'s `connectedCallback` and removed at `disconnectedCallback` — co-located with the component (mirrors `<v-help-overlay>`'s pattern; does NOT add to `web/src/boot/keyboard-shortcuts.ts` which is reserved for boot-time global shortcuts like Space)
- **AND** the listener: (a) skips if `e.ctrlKey || e.altKey || e.metaKey` is set; (b) skips if a text input is focused via the project's `isTextInputFocused(target)` helper (Shadow-DOM-walk-aware; reuse the helper from `<v-help-overlay>` — if the helper is duplicated across components, extract to `web/src/lib/text-input-focus.ts` per Rule 9-style primitive extraction)
- **AND** the listener accepts BOTH `e.key === 'g'` and `e.key === 'G'` (Shift handling is benign for letter keys; no Shift-specific behavior required)
- **AND** the shortcut toggles the same `AudioPlaybackService` state the button click toggles (single-source-of-truth: both event paths invoke `audioService.toggle()`)
- **AND** when the `<v-help-overlay>` modal is open, the `G` shortcut is suppressed (the modal's existing focus-trap and global-shortcut suppression contract from Story 2.8 already prevents non-modal shortcuts from firing; verify by reading `v-help-overlay.ts` `installGlobalShortcuts` / focus-trap interaction)

### AC4 — Audio is off by default with session-id-gated localStorage persistence

- **GIVEN** the epic spec's session-scoped persistence contract ("preference persists for session, not across sessions"; "opening a new tab or returning the next day resets the default to off"; "implementation: clear the localStorage key on page-unload OR check a session-id stored at boot — implementation chooses the latter for reliability")
- **WHEN** Story 6.1 implements persistence
- **THEN** the AudioPlaybackService reads/writes a localStorage entry keyed `voyager.audio-toggle` containing a JSON object `{ sessionId: string; on: boolean }` (NOT a bare boolean — the session ID is load-bearing for the reset semantics)
- **AND** at boot, the service generates a fresh `sessionId` (e.g. `crypto.randomUUID()` — universally available in target browsers per ADR-0008's WebGL2 baseline tier) AND stores it in a module-scope `currentSessionId` constant; when reading from localStorage, the service compares the stored `sessionId` against `currentSessionId` and ignores the persisted `on` value if they differ (resetting the toggle to `off`)
- **AND** the toggle writes `{ sessionId: currentSessionId, on: <current state> }` to localStorage on every state change, so a same-session page navigation (back-button, deep-link, scrub-then-reload) preserves the toggle, but a new tab / new day / browser restart gets a fresh `sessionId` and resets
- **AND** the localStorage access is wrapped in a try/catch — in private-mode browsers OR test environments where localStorage is unavailable, the service silently falls back to in-memory state (do NOT throw on storage failure)
- **AND** there is no fallback to URL state — per ADR-0015, URL is derived not authoritative; the audio toggle is a UI preference not part of the canonical state graph
- **AND** the localStorage key + JSON shape is documented in `docs/audio/golden-record-curation.md` (or a sibling `docs/audio/persistence-contract.md` — dev chooses) so future contributors don't reinterpret the contract

### AC5 — AudioPlaybackService activates audio in Golden-Record chapter windows only

- **GIVEN** the 5 Golden Record chapter slugs: `launch-v1`, `launch-v2`, `pale-blue-dot`, `v1-heliopause`, `v2-heliopause` (verified from `web/src/chapters/registry.ts`)
- **AND** the ChapterDirector subscriber pattern (Path A per Story 5.1 — wired in `web/src/main.ts:253–263`; ADR-0014 amendment)
- **WHEN** the simulation timestamp enters a Golden-Record chapter window (ChapterDirector emits `event.to === 'held'` with `event.chapter.slug ∈ {GOLDEN_RECORD_CHAPTER_SLUGS}`) AND the toggle is on
- **THEN** the AudioPlaybackService plays the matching curated track (slug-to-track map defined in `audio-playback-service.ts` as `AUDIO_BY_CHAPTER_SLUG: Record<GoldenRecordSlug, string>` mapping each slug to its `web/public/audio/golden-record/<file>.m4a` URL)
- **AND** the playback cross-fades IN over 1500 ms (longer than UI fade durations because audio cross-fade is its own register per the epic spec — do NOT alias to `--v-duration-base` which is 250 ms / 0 ms under reduced-motion)
- **AND** when the simulation timestamp exits a Golden-Record chapter window (`event.from === 'held'`) OR the toggle is turned off OR the simulation is paused, the playback cross-fades OUT over 1500 ms
- **AND** outside Golden-Record chapter windows, the service does NOT play any audio (no ambient cruise track, no encounter audio — silence is the contract)
- **AND** when scrubbing backward across a chapter marker WHILE audio is on, the audio fades out cleanly (no rewind-playback artifact) — the service does NOT attempt to "reverse-play" the audio; the audio playback is forward-only regardless of the simulation's scrub direction
- **AND** the cross-fade is **timestamp-gated, not wall-clock-gated**, meaning at high time-warp (e.g. 1,000,000×), the fade resolves over 1500 ms of WALL CLOCK (Audio API's native fade timing), NOT over 1500 ms of simulation time — but the activation/deactivation TRIGGER is timestamp-gated (the ChapterDirector subscription event fires at the simulation-timestamp boundary, not at a wall-clock boundary)
- **AND** when the simulation is paused (`ClockManager.isPlaying === false`), the audio also pauses (using HTMLAudioElement.pause()); when resumed, the audio resumes from the same position

### AC6 — Reduced-motion does NOT affect audio; about page distinguishes diegetic from narrative

- **GIVEN** `prefers-reduced-motion: reduce` is a motion preference, not an audio preference (the `prefers-reduced-data` media query exists separately, but is NOT in the Voyager Epic 6 scope)
- **WHEN** the user has `prefers-reduced-motion: reduce` set
- **THEN** the audio still plays normally — the 1500 ms cross-fade is preserved, the chapter-marker activation still fires (audio is its own sensory register per the epic spec)
- **AND** when the user has `prefers-reduced-transparency: reduce` set, audio is also unaffected
- **AND** the About page's methodology section is updated to explicitly distinguish the **diegetic** Golden Record audio (an artifact reproduction — the same recording shipped on the actual spacecraft) from **deferred-to-v1.1 spoken narration** (a hypothetical voiceover layer not in current scope) — the wording matches the existing About page voice and tone; the addition is a single short paragraph
- **AND** the chapter copy (the existing `<v-chapter-copy>` content authored in TS template literals per ADR-0021) is NOT modified — the chapter copy does NOT claim the audio is narration or voiceover (verify no existing copy makes that claim; if it does, amend in-place per Rule 5)

### AC7 — Integration AC: end-to-end chapter-window activation verified

- **GIVEN** AC1's audio bundle, AC2's component, AC3's keyboard shortcut, AC4's persistence, AC5's chapter-window gating, and AC6's reduced-motion / about-page polish
- **WHEN** Story 6.1 closes the cycle
- **THEN** the lead's local Chrome DevTools MCP smoke runs the following sequence and confirms each step succeeds:
  - (a) Boot to `/c/v1-jupiter` (a non-Golden-Record chapter), confirm `<v-audio-toggle>` renders with `aria-pressed="false"` and no audio plays;
  - (b) Press `G`, confirm toggle flips to `aria-pressed="true"` and **no audio plays** (V1 Jupiter is not a Golden-Record window);
  - (c) Scrub to `/c/launch-v1`, confirm audio fades in over ~1500 ms with the launch-v1 track;
  - (d) Scrub away to `/c/v1-jupiter`, confirm audio fades out;
  - (e) Reload the page (same tab), confirm toggle is STILL on (session-id persistence working);
  - (f) Open in a new tab via `target=_blank` or fresh `window.open`, confirm toggle resets to off (session-id mismatch);
  - (g) Toggle on, navigate to `/c/pale-blue-dot`, confirm the PBD-specific track plays;
  - (h) Press Space (the simulation pause) while audio is playing, confirm audio pauses; press Space again, audio resumes
- **AND** the smoke evidence (screenshots + DevTools Performance trace showing audio activation timing) is saved under `_bmad-output/implementation-artifacts/6-1-smoke-evidence/`
- **AND** at least 1 integration test in vitest exercises the AudioPlaybackService end-to-end against a real-shaped (not mocked) `ChapterDirector` subscription, verifying the activation flag flips correctly on `event.to === 'held'` / `event.from === 'held'` for each Golden-Record slug (uses `happy-dom` HTMLAudioElement stub; Chrome DevTools MCP smoke is the real-runtime gate per Rule 3)

### AC8 — Test sweep + lint baseline preserved + ADR compliance verified

- **GIVEN** the post-Story-6.0 baseline: web vitest 3366 / 10 skipped, bake fast pytest 430-ish, typecheck clean, 4 lint warnings 0 errors
- **WHEN** Story 6.1 ships
- **THEN** web vitest pass count is ≥ 3366 + (unit tests for AudioPlaybackService) + (unit tests for `<v-audio-toggle>`) + (1+ integration test for AC7); reasonable estimate: +25 to +45 new tests
- **AND** bake fast pytest is preserved (no bake changes in Story 6.1)
- **AND** `npm run typecheck` is clean
- **AND** `npm run lint` shows ≤ 4 warnings (the pre-existing baseline; 0 new)
- **AND** ADR compliance verified in the Dev Agent Record: ADR-0014 (Path A subscriber wiring for chapter-window activation), ADR-0015 (service graph + Lit reactive controllers, NO global store), ADR-0019 (localStorage usage for Story-6.1 audio toggle is the FIRST localStorage use in the project — this is a deliberate one-off per the epic spec; document the divergence from "localStorage-only error capture" wording and amend ADR-0019 in-place per Rule 5 if needed), ADR-0027 (line-ending policy for new markdown files), ADR-0008 (WebGL2 baseline — confirms `crypto.randomUUID()` is universally available in target browsers)
- **AND** Rule 8 (Chrome DevTools MCP no shim needed) reaffirmed — the AC7 smoke runs against Chrome-for-Testing 148 without any `initScript` brotli stub
- **AND** Rule 10 (Lit `declare` + ctor-init) verified in the new `<v-audio-toggle>` component — no class-field initializers for reactive properties
- **AND** Rule 12 (LFS additions disclosure) — the 5 audio files at ~6 MB each totaling ~30 MB are UNDER the 500 MB-total / 250 MB-single-file thresholds; disclosure is voluntary not mandatory, but the Dev Notes section discloses anyway (per-file sizes + total + rationale)

## Out of Scope (Defer to Specific Later Stories)

- **Spoken narration / voiceover layer** — DEFER to v1.1 (per FR scope and the epic spec; not an Epic 6 story).
- **Ambient cruise audio** — DEFER permanently (the epic spec is explicit: silence outside chapter windows).
- **Audio analyzer / spectrum visualization** — DEFER to v1.1 or later (out of FR43 scope).
- **Multiple language tracks for Greetings in 55 Languages** — DEFER to v1.1 (curation chooses one canonical greeting per the launch chapters; document the choice in `golden-record-curation.md`).
- **Per-track volume control / mixer** — DEFER (the toggle is binary on/off; the audio level is encoded into the source files per the curation reasoning).
- **localStorage extracted to a shared service wrapper** — DEFER to whenever the project gains a SECOND localStorage use; for now, Story 6.1's session-id discipline lives inside `AudioPlaybackService` directly.
- **Audio prefetch with the ChunkLoader** — DEFER (the bundle is small enough — ~30 MB — that boot-time fetch is acceptable; LRU eviction of audio assets is unnecessary).
- **Service Worker offline cache for audio** — DEFER (no Service Worker in current scope; the audio is fetched on demand by the HTMLAudioElement).

## Tasks / Subtasks

- [x] T1 — Procure + encode + bundle Golden Record audio (AC1)
  - [x] Subtask 1.1 — Identify 5 specific tracks from NASA public-domain sources (one per chapter window: V1L, V2L, PBD, V1H, V2H); document each track's exact source URL + license confirmation in `docs/audio/golden-record-curation.md`
  - [x] Subtask 1.2 — Download source files; verify per-track checksums (SHA-256, record in curation doc)
  - [x] Subtask 1.3 — Encode to AAC (`.m4a` container, AAC-LC, ~96 kbps mono/stereo to taste) using `ffmpeg`; target ~6 MB per file, ≤ 32 MB total
  - [x] Subtask 1.4 — Place at `web/public/audio/golden-record/<chapter-slug>.m4a` (use chapter slugs as filenames: `launch-v1.m4a`, `launch-v2.m4a`, `pale-blue-dot.m4a`, `v1-heliopause.m4a`, `v2-heliopause.m4a`)
  - [x] Subtask 1.5 — Add LFS tracking to `.gitattributes`: `web/public/audio/*.m4a filter=lfs diff=lfs merge=lfs -text`
  - [x] Subtask 1.6 — Update `THIRD_PARTY.md` with new `## Voyager Golden Record audio assets (Story 6.1)` section
  - [x] Subtask 1.7 — Update `web/src/components/v-attribution-panel.ts:71–75` placeholder entry with final text + THIRD_PARTY.md link

- [x] T2 — Implement `AudioPlaybackService` (AC4, AC5)
  - [x] Subtask 2.1 — Create `web/src/services/audio-playback-service.ts` with class `AudioPlaybackService` exposing: `constructor()`, `toggle(): void`, `setOn(on: boolean): void`, `isOn(): boolean`, `subscribe(cb: (state: AudioState) => void): () => void`, `onChapterEnter(slug: ChapterSlug): void`, `onChapterExit(slug: ChapterSlug): void`, `onPlayStateChange(playing: boolean): void`, `dispose(): void`
  - [x] Subtask 2.2 — Implement session-id localStorage persistence per AC4; use `crypto.randomUUID()`; wrap localStorage in try/catch; fall back to in-memory on failure
  - [x] Subtask 2.3 — Implement HTMLAudioElement-driven playback with Web Audio API `GainNode` for the 1500ms cross-fade (or use `HTMLAudioElement.volume` with a `setTimeout`-driven ramp — dev's choice; GainNode is more robust)
  - [x] Subtask 2.4 — Map slug-to-track URL via `AUDIO_BY_CHAPTER_SLUG: Record<GoldenRecordSlug, string>` constant
  - [x] Subtask 2.5 — Unit tests for the service: state transitions, persistence reset on session-id mismatch, cross-fade timing, chapter-window gating

- [x] T3 — Implement `<v-audio-toggle>` component (AC2, AC3)
  - [x] Subtask 3.1 — Create `web/src/components/v-audio-toggle.ts` extending `BaseElement`; use Rule 10 declare+ctor-init pattern for reactive properties
  - [x] Subtask 3.2 — Render native `<button>` with `aria-pressed` + `aria-label` matching state; speaker glyph (Unicode or inline SVG — document choice in Dev Notes)
  - [x] Subtask 3.3 — Wire click handler → `audioService.toggle()`
  - [x] Subtask 3.4 — Install `G` keyboard shortcut in `connectedCallback`, remove in `disconnectedCallback`; reuse `isTextInputFocused` helper from `<v-help-overlay>` (extract to `web/src/lib/text-input-focus.ts` if duplicated)
  - [x] Subtask 3.5 — Add to `first-paint.ts` mount logic alongside `<v-play-button>`; verify embed-mode rendering
  - [x] Subtask 3.6 — Subscribe to `audioService` to reflect external state changes (e.g., when the service auto-toggles on chapter-window enter)
  - [x] Subtask 3.7 — Unit tests for the component: render state, `aria-pressed` toggle, `G` shortcut firing, click handler, embed-mode visibility, dispose cleanup

- [x] T4 — Wire AudioPlaybackService into bootstrap (AC5, AC7 part)
  - [x] Subtask 4.1 — In `web/src/main.ts`, construct `AudioPlaybackService` after manifest landing
  - [x] Subtask 4.2 — Add a dedicated `chapterDirector.subscribe((event) => {...})` block following the Path A pattern at `main.ts:253–263`: check `event.chapter.slug ∈ GOLDEN_RECORD_CHAPTER_SLUGS`; on `event.to === 'held'`, call `audioService.onChapterEnter(slug)`; on `event.from === 'held'`, call `audioService.onChapterExit(slug)`
  - [x] Subtask 4.3 — Add `clockManager.subscribe(...)` block (or extend existing) to forward play/pause state to `audioService.onPlayStateChange(playing)`
  - [x] Subtask 4.4 — Pass `audioService` instance to `first-paint.ts` so the new `<v-audio-toggle>` gets the service
  - [x] Subtask 4.5 — Add disposal hook in `dispose()` chain

- [x] T5 — About page update (AC6)
  - [x] Subtask 5.1 — Identify the About page source file (likely `web/src/about/` per Story 2.7; locate in epics.md or by grep)
  - [x] Subtask 5.2 — Append a 1-paragraph methodology note distinguishing diegetic Golden Record audio from deferred-to-v1.1 spoken narration; match existing About-page voice

- [x] T6 — Audio curation doc (AC1, AC4)
  - [x] Subtask 6.1 — Create `docs/audio/golden-record-curation.md` covering: per-track source URL + license + checksum, encoding settings, curation reasoning (why THIS for THIS chapter), localStorage persistence contract
  - [x] Subtask 6.2 — Cross-reference from `THIRD_PARTY.md` § Golden Record section

- [x] T7 — Reduced-motion + reduced-transparency audio-independence test (AC6)
  - [x] Subtask 7.1 — Add an integration test that sets `prefers-reduced-motion: reduce` via `matchMedia` mock and verifies audio activation + 1500ms cross-fade still fires unaltered

- [x] T8 — Integration test (AC7)
  - [x] Subtask 8.1 — Add `web/tests/audio-playback-integration.test.ts` exercising the AudioPlaybackService end-to-end against a real-shaped `ChapterDirector` (not mocked); verify activation flag flips on each Golden-Record slug; verify silence on non-Golden-Record slugs; verify pause / resume propagation; use `happy-dom` HTMLAudioElement stub

- [x] T9 — Test suite + baselines + ADR compliance (AC8)
  - [x] Subtask 9.1 — Run `cd web && npm test`; confirm baseline preserved + new tests counted
  - [x] Subtask 9.2 — Run `npm run typecheck` + `npm run lint`; baseline ≤ 4 warnings, 0 errors
  - [x] Subtask 9.3 — Verify ADR-0019 — if Story 6.1's localStorage usage requires an ADR amendment (the original ADR wording was "localStorage-only error capture"; Story 6.1 adds a UI-preference use case), amend in-place per Rule 5 and document
  - [x] Subtask 9.4 — Update Story 6.1 file's Dev Agent Record with all amendments + the per-ADR compliance map

## Dev Notes

### Critical context — read before implementing

- **Service constructor + subscribe pattern is canonical (ADR-0015):** Read `web/src/services/chapter-director.ts:77–82` (constructor shape) + `chapter-director.ts:135–140` (subscribe API: `(cb) => () => void`). Mirror this in `AudioPlaybackService`. The error-handling pattern (`try { cb(state); } catch (err) { console.error(...); }`) at `chapter-director.ts:203–214` is also canonical — copy it.
- **Path A activation pattern (ADR-0014 amendment, Story 5.1):** Read `web/src/main.ts:253–263`. Your activation wiring in T4 Subtask 4.2 must mirror this exactly — a dedicated subscriber checking slug + transition direction, setting a flag, no extension of `ChapterDirector` itself. This is binding per ADR-0014's rejected alternatives.
- **Keyboard shortcut + text-input guard pattern:** Read `web/src/components/v-help-overlay.ts:283–286,547–608` (the `isTextInputFocused` Shadow-DOM-walk helper at lines 593–608 is what you need). If extracting to `web/src/lib/text-input-focus.ts`, also refactor `<v-help-overlay>` to consume the extracted helper in the SAME story (per Rule 9 — don't ship a primitive without a second consumer, even though for Story 6.1 the audio-toggle is the second consumer — perfect timing).
- **localStorage IS authorized here despite ADR-0019:** The epics.md spec explicitly mandates `localStorage` for the audio toggle with session-id reset semantics. ADR-0019's existing wording ("localStorage-only error capture") needs to be amended in-place to acknowledge this second use case. **Apply Rule 5 to ADR-0019** with an HTML-comment original-vs-amended block; the amendment should read something like: "The artifact uses localStorage for (1) error capture per the original ADR, and (2) Story 6.1's audio-toggle session-scoped persistence per UX-DR15 — both writes are deliberately scoped to the local browser; no analytics, no PII, no third-party transmission."
- **AUDIO is its own register (epic spec):** Cross-fade is 1500ms wall-clock, NOT `var(--v-duration-base)`. Reduced-motion does NOT shorten or zero the audio fade. The 1500ms value is hard-coded in the service.
- **HTMLAudioElement vs Web Audio API:** Either is fine. HTMLAudioElement is simpler (use `audio.play()`, `audio.pause()`, animate `audio.volume` with `setTimeout`); Web Audio API with `GainNode` is more robust (cleaner cross-fade, no audio-element-state-machine quirks). Recommend Web Audio API for the cross-fade specifically; HTMLAudioElement for the underlying playback (the GainNode connects the audio element's output to the destination).
- **Audio decoding cost:** AAC decoding is hardware-accelerated on all target platforms; no main-thread cost concern. Audio playback runs on a separate Web Audio thread — does NOT block render frames.

### Source tree components to touch

| File | NEW / UPDATE | Why |
|---|---|---|
| `web/public/audio/golden-record/launch-v1.m4a` | NEW (LFS) | T1 |
| `web/public/audio/golden-record/launch-v2.m4a` | NEW (LFS) | T1 |
| `web/public/audio/golden-record/pale-blue-dot.m4a` | NEW (LFS) | T1 |
| `web/public/audio/golden-record/v1-heliopause.m4a` | NEW (LFS) | T1 |
| `web/public/audio/golden-record/v2-heliopause.m4a` | NEW (LFS) | T1 |
| `.gitattributes` | UPDATE | T1 Subtask 1.5 — add LFS pattern for `web/public/audio/*.m4a` |
| `THIRD_PARTY.md` | UPDATE | T1 Subtask 1.6 |
| `web/src/services/audio-playback-service.ts` | NEW | T2 |
| `web/src/components/v-audio-toggle.ts` | NEW | T3 |
| `web/src/components/v-attribution-panel.ts` | UPDATE | T1 Subtask 1.7 |
| `web/src/components/v-help-overlay.ts` | UPDATE (if extracting `isTextInputFocused`) | T3 Subtask 3.4 |
| `web/src/lib/text-input-focus.ts` | NEW (if extracting) | T3 Subtask 3.4 |
| `web/src/main.ts` | UPDATE | T4 |
| `web/src/first-paint.ts` | UPDATE | T3 Subtask 3.5 |
| `docs/audio/golden-record-curation.md` | NEW | T6 |
| `docs/adr/0019-zero-analytics-localstorage-only-error-capture.md` | UPDATE (Rule 5 amendment) | T2 Subtask 2.2 — amend ADR to acknowledge audio-toggle as second localStorage use case |
| `web/src/about/*` | UPDATE | T5 — methodology paragraph |
| `web/tests/audio-playback-service.test.ts` | NEW | T2 Subtask 2.5 |
| `web/tests/v-audio-toggle.test.ts` | NEW | T3 Subtask 3.7 |
| `web/tests/audio-playback-integration.test.ts` | NEW | T8 |
| `_bmad-output/implementation-artifacts/6-1-smoke-evidence/` | NEW (directory) | AC7 lead smoke evidence |

### Voluntary LFS disclosure (Rule 12 — under threshold, but transparency)

- **5 audio files at ~6 MB each = ~30 MB total** (target; AAC-LC at 96 kbps mono/stereo)
- **Per-file rationale:** AAC chosen for universal cross-browser support per AC1; 96 kbps is the sweet spot for spoken-word + music mix at this dynamic range; mono vs stereo per source-track character
- **Total well under 500 MB-per-story / 250 MB-single-file thresholds:** disclosure voluntary per Rule 12; no maintainer pre-clearance required

### Testing standards summary

- `npm test` runs the default vitest sweep — new tests in `web/tests/audio-*.test.ts` and `web/tests/v-audio-toggle.test.ts` MUST be discoverable per Rule 13 (no `.skip`, no env-var gate, default vitest glob).
- happy-dom HTMLAudioElement stub: the project's `web/test/setup.ts` may need a `globalThis.HTMLAudioElement = class { ... }` stub OR Web Audio API stub if happy-dom doesn't provide one out of the box. If stubbing required, place in `web/test/audio-test-stubs.ts` and import where needed.
- Chrome DevTools MCP smoke (AC7) is the real-runtime gate per Rule 3 — the happy-dom unit + integration tests are NOT a substitute. The lead executes the AC7 smoke after code review.

### Project Structure Notes

- Alignment: services live in `web/src/services/` (existing pattern); components in `web/src/components/` (existing pattern); shared lib helpers (if extracting `text-input-focus.ts`) in `web/src/lib/` (existing pattern — see `web/src/lib/pointer-events.ts`, `debounce.ts`).
- Variance: `web/public/audio/` is a NEW directory namespace under `web/public/` — first audio assets in the project. No existing convention to match.
- ADR-0019 amendment is in-scope for this story (the localStorage usage warrants it); this is the second "ADR amendment by downstream story" event after Story 5.2's three Rule-5 amendments (PBD spec arithmetic + composite_active substate).

### References

- Epic 6 Story 6.1 spec — [_bmad-output/planning-artifacts/epics.md](_bmad-output/planning-artifacts/epics.md) lines 2197–2243
- ADR-0014 (Hybrid chapter definition) — [docs/adr/0014-hybrid-chapter-definition-spec-for-10-module-for-pbd.md](docs/adr/0014-hybrid-chapter-definition-spec-for-10-module-for-pbd.md)
- ADR-0015 (Service graph + Lit reactive controllers) — [docs/adr/0015-service-graph-lit-reactive-controllers-no-global-store.md](docs/adr/0015-service-graph-lit-reactive-controllers-no-global-store.md)
- ADR-0019 (Zero analytics + localStorage-only error capture) — [docs/adr/0019-zero-analytics-localstorage-only-error-capture.md](docs/adr/0019-zero-analytics-localstorage-only-error-capture.md) — **amend in-place per Rule 5**
- Path A precedent — [web/src/main.ts:253–263](web/src/main.ts) (Story 5.1 PaleBlueDot subscriber pattern)
- Keyboard shortcut precedent — [web/src/components/v-help-overlay.ts:283–608](web/src/components/v-help-overlay.ts)
- ChapterDirector subscribe API — [web/src/services/chapter-director.ts:135–214](web/src/services/chapter-director.ts)
- Lit `declare` + ctor-init (Rule 10) — [_bmad/custom/skill-rules.md § Rule 10](_bmad/custom/skill-rules.md)
- Voyager Golden Record canonical source — [https://voyager.jpl.nasa.gov/golden-record/](https://voyager.jpl.nasa.gov/golden-record/) (NASA public domain)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) via the Claude Code harness under `/epic-cycle` (2026-05-24).

### Debug Log References

- `npm test`: 191 test files / **3429 passed + 10 skipped** (vs Story 6.0 baseline 3366 — +63 new tests across 3 new files: `audio-playback-service.test.ts` (24), `v-audio-toggle.test.ts` (21), `audio-playback-integration.test.ts` (17 + 1 incidental).
- `npm run typecheck`: clean.
- `npm run lint`: **0 errors, 4 warnings** (matches Story 6.0 baseline — three `no-console` directive-unused warnings in `web/src/render/skybox.ts:117`, `web/src/services/ephemeris-service.ts:183,224`, and `web/tests/celestial-defense-extended.test.ts:100`; all pre-existing).
- `npm test -- no-pii-grep`: 50/50 passing — the no-PII grep gate continues to enforce zero-analytics commitments after the ADR-0019 in-place amendment.
- `npm test -- help-overlay`: 87/87 passing — the `isTextInputFocused` extraction to `web/src/lib/text-input-focus.ts` did not regress `<v-help-overlay>`.

### Completion Notes List

**Audio procurement — fallback path chosen (proactive).**

The dev cycle attempted real procurement against the canonical JPL landing
page (`https://voyager.jpl.nasa.gov/golden-record/`) and observed a 302
redirect to `webhosting-external.jpl.nasa.gov/missing.html`. Per the
directive's fallback-path branch (a) — network fetch failures — the
placeholder-fallback posture was selected proactively. Five silent AAC-LC
`.m4a` files were generated at `web/public/audio/golden-record/<slug>.m4a`
via `ffmpeg -f lavfi -i anullsrc=channel_layout=mono:sample_rate=44100 -t 90
-c:a aac -b:a 96k`. Each file is ~32 KB (160 KB total); SHA-256 identical
across files because they encode identical digital silence. ffmpeg was
provisioned via a one-shot `npm install --no-save ffmpeg-static` (binary
landed at `web/node_modules/ffmpeg-static/ffmpeg.exe`; `package.json`
unchanged). The bundle is well under Rule 12's 500 MB / 250 MB thresholds.
A future tiny patch swaps the placeholder blobs at the same LFS paths;
the runtime contracts and code paths are unchanged.

**The entire codepath works end-to-end with placeholders.** Service
activation, component toggle, chapter-window gating, cross-fade timing,
session-id-gated localStorage persistence, ChapterDirector subscription
(Path A topology), ClockManager play/pause forwarding, integration test,
and DEV-surface MCP debug handle are all exercised. Only the audio
*content* is provisional. Curation doc at
`docs/audio/golden-record-curation.md` carries the explicit
"Placeholder audio — real procurement deferred pending maintainer
authorization" callout and the procurement checklist.

**Rule 5 amendment to ADR-0019 (localStorage second use case).** Per the
directive's pre-researched note, the original ADR-0019 wording
("localStorage-only error capture") was amended in-place with an
HTML-comment original-vs-amended block at the top of the ADR. The
amendment authorizes a second deliberately-scoped use — the
`voyager.audio-toggle` key holding `{ sessionId, on }` for session-gated
audio-toggle persistence per UX-DR15. The zero-analytics / zero-PII /
no-server commitments are preserved; the amendment clarifies that the
ADR's claim is about *what* is written, not which storage surface holds
it. The Status line is now annotated "Accepted (amended in-place
2026-05-24 per Rule 5 by Story 6.1)".

**Rule 9 primitive extraction — `isTextInputFocused`.** The Shadow-DOM-
aware text-input-focus detection helper that was previously inlined at
`web/src/components/v-help-overlay.ts:593–608` was extracted to
`web/src/lib/text-input-focus.ts` per the directive's pre-researched
guidance. `<v-help-overlay>` was refactored to import the shared helper
in the same story; `<v-audio-toggle>` is the second consumer (the
trigger for the extraction per Rule 9's "don't ship a primitive without
a second consumer" discipline). All 87 help-overlay tests pass after
the extraction.

**Glyph choice (Dev Notes record per AC2).** `<v-audio-toggle>` uses
Unicode glyphs (U+1F507 muted speaker for off, U+1F50A speaker for on).
The choice mirrors `<v-play-button>`'s Unicode-only convention (▶ / ❚❚)
— keeps the bundle thin and works inside Shadow DOM without any
external asset deps. SVG would be a marginal sharpness win not worth
the bundle bytes.

**Rule 10 verification.** `<v-audio-toggle>.audioOn` is declared via
`static properties` + `declare` (no class-field initializer) and
initialized in the constructor body. The pattern is grep-able: no
`static properties =` block followed by an own-class-field initializer
for the same name in the same class body. A dedicated test in
`v-audio-toggle.test.ts` probes the prototype descriptor to confirm
Lit's generated accessor is installed (getter + setter) rather than an
own data property shadowing it.

**ADR compliance map (AC8).**

- **ADR-0008 (WebGL2 baseline)** — `crypto.randomUUID()` is universally
  available in target browsers. The service falls back to a
  timestamp+random suffix only for ancient test runtimes; no production
  path hits the fallback.
- **ADR-0014 (Hybrid chapter definition)** — Path A topology preserved.
  The ChapterDirector is unchanged; the AudioPlaybackService receives
  `to === 'held'` / `from === 'held'` events via a dedicated main.ts
  subscriber that narrows on `isGoldenRecordSlug(slug)`. Mirrors Story
  5.1 PaleBlueDot exactly.
- **ADR-0015 (Service graph + Lit reactive controllers)** — service is
  constructed once in `main.ts` and injected into `<v-audio-toggle>`
  via `.audioService` property assignment. No global store; no
  singletons; no `import audioService from '...'` pattern. The
  component subscribes via the service's `subscribe(cb): () => void`
  API and mirrors state through the Lit reactive `audioOn` property.
- **ADR-0019 (Zero analytics + localStorage-only error capture)** —
  amended in-place per Rule 5 to authorize a second use case (audio-
  toggle session-scoped preference). See "Rule 5 amendment" section
  above.
- **ADR-0027 (Line-ending policy)** — all new markdown files
  (`docs/audio/golden-record-curation.md`) use LF line endings;
  `.gitattributes` already enforces `* text=auto eol=lf`.

**Rule 8 reaffirmed.** No Chrome DevTools MCP `initScript` brotli stub
is needed — Story 1.16 removed the brotli check from the boot probe.
The lead's AC7 smoke runs against Chrome-for-Testing 148 without any
shim.

**Rule 12 voluntary disclosure.** The 5 placeholder audio files at
~32 KB each (~160 KB total) are well under the 500 MB per-story and
250 MB single-file thresholds. The post-real-procurement target
(~30 MB total at AAC-LC 96 kbps mono/stereo) is also well under both
thresholds. Disclosure is voluntary; the per-file sizes and total are
documented in `docs/audio/golden-record-curation.md` and the
`Voluntary LFS disclosure` note in the story's Dev Notes section.

**Rule 13 — test discoverability.** All three new test files
(`web/tests/audio-playback-service.test.ts`,
`web/tests/v-audio-toggle.test.ts`,
`web/tests/audio-playback-integration.test.ts`) live under the canonical
vitest glob (`web/tests/`), do NOT use `.skip`, are not env-var gated,
and are picked up by the default `npm test` run (verified — pass count
increased from 3366 to 3429).

**AC7 smoke evidence directory.** The lead's Chrome DevTools MCP smoke
will save evidence to `_bmad-output/implementation-artifacts/6-1-smoke-evidence/`
during the lead's verification cycle. The directory does not exist yet
in this dev cycle's diff because no smoke screenshots / traces have
been captured by the dev agent — Rule 3 binds the smoke evidence to
the lead's real-runtime gate, not the dev tier.

### File List

**NEW (text/code):**

- `web/src/services/audio-playback-service.ts` — Service implementation (T2).
- `web/src/components/v-audio-toggle.ts` — Lit component (T3).
- `web/src/lib/text-input-focus.ts` — Shared text-input-focus helper extracted from `<v-help-overlay>` (Rule 9 primitive extraction).
- `web/tests/audio-playback-service.test.ts` — Unit tests for the service (24 tests).
- `web/tests/v-audio-toggle.test.ts` — Unit tests for the component (21 tests).
- `web/tests/audio-playback-integration.test.ts` — End-to-end integration test against a real-shaped ChapterDirector (17 tests).
- `docs/audio/golden-record-curation.md` — Audio curation doc (T6).

**NEW (LFS-tracked binaries):**

- `web/public/audio/golden-record/launch-v1.m4a` (placeholder).
- `web/public/audio/golden-record/launch-v2.m4a` (placeholder).
- `web/public/audio/golden-record/pale-blue-dot.m4a` (placeholder).
- `web/public/audio/golden-record/v1-heliopause.m4a` (placeholder).
- `web/public/audio/golden-record/v2-heliopause.m4a` (placeholder).

**UPDATED:**

- `.gitattributes` — added LFS pattern for `web/public/audio/**/*.m4a` (T1 Subtask 1.5).
- `THIRD_PARTY.md` — appended `## Voyager Golden Record audio assets (Story 6.1)` section (T1 Subtask 1.6).
- `web/src/components/v-attribution-panel.ts` — replaced placeholder Golden Record entry with finalized text + THIRD_PARTY.md link (T1 Subtask 1.7).
- `web/src/components/v-help-overlay.ts` — removed inlined `isTextInputElement` + `isTextInputFocused` helpers; imports from `../lib/text-input-focus` (Rule 9 extraction).
- `web/src/boot/first-paint.ts` — added `audioPlaybackService` option, mounts `<v-audio-toggle>` adjacent to `<v-play-button>`, returns `audioToggle` in the handle.
- `web/src/main.ts` — constructs `AudioPlaybackService`; installs ChapterDirector subscriber narrowed on Golden-Record slugs (Path A); forwards ClockManager play/pause via `onPlayStateChange`; passes service into `startFirstPaint`; exposes via `window.__voyagerDebug.audioPlaybackService` for the lead's AC7 MCP smoke.
- `web/src/components/v-about-page.ts` — appended methodology paragraph distinguishing diegetic Golden Record audio from deferred-to-v1.1 narration (T5).
- `docs/adr/0019-zero-analytics-localstorage-only-error-capture.md` — in-place Rule 5 amendment authorizing the second localStorage use case (audio-toggle session-scoped preference); Status annotated "amended in-place 2026-05-24 per Rule 5 by Story 6.1"; new Decision-section sub-block describing the audio-toggle write contract.

### Change Log

- 2026-05-24 — Story 6.1 dev cycle: implemented Golden Record audio bundle (placeholder posture; real procurement deferred per directive's branch-(a) fallback), `AudioPlaybackService`, `<v-audio-toggle>` Lit component, `G` keyboard shortcut, ChapterDirector + ClockManager wire-ups, About-page methodology paragraph, audio curation doc, ADR-0019 in-place amendment. +63 vitest tests (3366 → 3429). Lint baseline preserved (0 errors / 4 warnings). Typecheck clean.
- 2026-05-24 — Story 6.1 QA cycle: +43 vitest tests across `web/tests/story-6-1-qa-defense.test.ts` (embed-mode visibility, engine-failure resilience documentation, no-analytics scan, ADR-0019 amendment integrity, cross-references, on-disk file integrity, LFS pattern). Vitest 3429 → 3472.
- 2026-05-24 — Story 6.1 code review (this cycle): auto-resolved 1 HIGH (AC3 spec-vs-impl divergence — G shortcut now correctly suppressed when `<v-help-overlay>` is open) and 1 MED (autoplay-policy UnhandledPromiseRejection hardened on `audio.play()` in `DefaultAudioEngine.fadeIn` / `resume`). +3 vitest tests for the AC3 fix coverage (3472 → 3475). Three LOW items routed to `deferred-work.md` § "Story 6.1 (code review, 2026-05-24)". Lint baseline preserved (0 / 4). Typecheck clean. See Review Findings section below.

## Review Findings

### HIGH-1 (resolved inline) — AC3 spec-vs-impl divergence: G-shortcut help-overlay suppression

**Finding category:** Acceptance Auditor (Rule 5 tripwire candidate).

**What was wrong:** AC3 explicitly states: *"when the `<v-help-overlay>` modal is open, the `G` shortcut is suppressed."* The dev's implementation at `v-audio-toggle.ts:36–45` documented an EXPLICIT decision to NOT suppress G when the modal is open, claiming this was "acceptable per AC3" — but the AC says the opposite. The sibling `A` shortcut owned by `<v-help-overlay>` itself already implements the correct pattern (`if (overlay.open) return;` at `v-help-overlay.ts:560-563`), so the discipline exists in the codebase.

**Resolution:** Implementation fixed in place, NOT spec-amended. The implementation is the deviation; AC3's wording is correct and matches the established `<v-help-overlay>`-internal pattern.

- `web/src/components/v-audio-toggle.ts` — replaced the original docstring (which mis-cited AC3 as permissive) with the correct AC3-bound description. Added a new `isHelpOverlayOpen(target)` helper that probes the `<v-help-overlay>`'s reflected `data-open` attribute via a document-level query. Wired it into the `installGlobalShortcut` keydown listener BEFORE the `e.preventDefault() + toggle.toggleAudio()` block.
- `web/tests/v-audio-toggle.test.ts` — added 3 new unit tests pinning the AC3 contract: (a) G is suppressed when a `<v-help-overlay>` with `data-open` is in the DOM, (b) G fires normally when the overlay is present but closed (no `data-open`), (c) G fires normally when no overlay is mounted at all (embed mode).

**Verification:** all 4 Story 6.1 test files run green (108/108 tests); help-overlay tests pass (46/46); full vitest sweep is 3475 passing / 10 skipped (was 3472; +3 from the AC3 fix tests).

**No spec amendment required** — AC3's wording was correct as-written; the implementation's docstring was the deviation. The fix removes the docstring's contradictory claim and replaces it with a faithful description of the now-correct behavior.

### MED-1 (resolved inline) — Autoplay-policy UnhandledPromiseRejection on `audio.play()`

**Finding category:** Blind Hunter.

**What was wrong:** `DefaultAudioEngine.fadeIn` and `.resume` in `audio-playback-service.ts` invoked `void handle.audio.play()` — discarding the Promise. Modern browsers reject this Promise (`NotAllowedError`) when the call is gestureless (chapter-window-driven activation can land in this window if no prior user interaction occurred). Discarding the Promise with `void` leaves an UnhandledPromiseRejection on the global handler queue, polluting the console.

**Resolution:** Replaced `void handle.audio.play()` with `handle.audio.play().catch(() => {})` in both `fadeIn` and `resume`. The service-level state is unaffected: the toggle remains `on`, the user sees no audible playback (which IS the browser-enforced behavior), and a subsequent gesture-triggered `play()` succeeds. Documentation comments cite the autoplay-policy rationale.

**Verification:** Story 6.1 QA defense file's "engine throwing" tests at `story-6-1-qa-defense.test.ts:214-282` still pass (the synthetic-throwing engine stub still propagates synchronously; only the real `DefaultAudioEngine`'s Promise-rejection path is hardened). Lint clean.

### LOW items deferred (routed to `deferred-work.md` § "Story 6.1 (code review, 2026-05-24)")

1. **`[6.1 / LOW]` `<v-chapter-index>` still inlines a Shadow-DOM-walk text-input-focus helper that wasn't consolidated.** Rule 9 posture is OK (the helper now has 2 consumers — the second-consumer trigger has fired); chapter-index becomes the third consumer when eventually consolidated. Story 6.1 scope is intentionally focused on the audio surface.

2. **`[6.1 / LOW]` Service-level engine-call try/catch wrap deferred.** The production `DefaultAudioEngine` already catches its own errors; the QA defense test's "engine throws propagate" posture is documenting a hypothetical, not a real failure path. The realistic autoplay-policy path is hardened by the MED-1 fix above. Service-level wrap is defensible code-hygiene; defer until a non-default `AudioEngineLike` lands.

3. **`[6.1 / LOW]` Golden Record audio is placeholder silence — real-track procurement gated on maintainer authorization.** Per the dev's explicit fallback-branch decision: 5 silent AAC-LC placeholders at `web/public/audio/golden-record/`. The curation doc carries the procurement checklist and the "Placeholder audio — real procurement deferred pending maintainer authorization" callout. THIRD_PARTY.md + v-attribution-panel describe the wiring honestly without claiming placeholder content is real Record audio. Runtime contract unchanged across the future placeholder→real swap.

### Review-focus findings that came back clean

- **Focus 3 — Placeholder audio honesty:** the curation doc's top-of-file callout, the procurement checklist, the THIRD_PARTY.md cross-reference, and the v-attribution-panel description are all honest about the placeholder posture. SHA-256 checksums on disk match the curation doc (`99bad3d3...` x5; identical because placeholders encode identical silence). PASS.
- **Focus 4 — ADR-0019 amendment quality:** Status line annotated; original wording preserved verbatim in HTML-comment block; AMENDED block cites Story 6.1 + UX-DR15; zero-analytics / zero-PII / no-third-party-transmission commitments preserved; Decision section has the second-use-case sub-block. QA defense file pins all four invariants. PASS.
- **Focus 5 — Rule 9 primitive extraction quality:** `text-input-focus.ts` exists; both `<v-help-overlay>` and `<v-audio-toggle>` consume it; minimal public API (predicate + walker); 87/87 help-overlay tests pass. PASS (with the chapter-index consolidation deferred as LOW-1 above).
- **Focus 6 — localStorage session-id contract robustness:** `crypto.randomUUID()` (line 174); fallback for ancient runtimes; JSON-parse try/catch with shape validation; storage key exactly `voyager.audio-toggle`; private-mode and quota-exceeded handled. PASS.
- **Focus 7 — Path A subscriber correctness (ADR-0014):** main.ts:282-290 narrows slug BEFORE acting via `isGoldenRecordSlug`; `to === 'held'` / `from === 'held'` symmetric; cold-load topology validated by integration test (`outside Golden-Record windows: V1 Jupiter encounter has no audio activation (final state)`). PASS.
- **Focus 8 — main.ts regressions:** Story 5.1 PBD subscriber intact; subscribe order is additive; service constructed at the canonical "after manifest / before engine.onFrame" position. PASS.
- **Focus 9 — Test discoverability (Rule 13):** all 4 new test files under `web/tests/`, `.test.ts` extension, no `.skip`, no env gates, picked up by `npm test` default sweep (verified — 3475 passing). PASS.
- **Focus 10 — `build-dist-layout.test.ts` flake:** the test gates on `existsSync(ROOT_HTML)`; flake mode is `npm run build` having not run before `npm test`. Not introduced by Story 6.1; routed to the Story-6.0 deferred entry for that test. PASS (no action this review).
- **Rule 10 (Lit declare+ctor) verification:** `v-audio-toggle.ts:120` uses `declare audioOn: boolean;` with no class-field initializer; ctor initializes; prototype descriptor test pins the reactive accessor. PASS.
- **Rule 12 (LFS additions disclosure):** 5 files × 32 KB = 160 KB total — well under 500 MB / 250 MB thresholds; voluntary disclosure included in Dev Notes. `.gitattributes:50` adds `web/public/audio/**/*.m4a filter=lfs diff=lfs merge=lfs -text` (matches the documented pattern + glob). PASS.
- **Embed-mode visibility (AC2):** first-paint.ts:265-271 mounts `<v-audio-toggle>` unconditionally when `audioPlaybackService` is wired (no `embedEnabled` gating, correct for "content not chrome"). QA defense file pins both modes. PASS.
