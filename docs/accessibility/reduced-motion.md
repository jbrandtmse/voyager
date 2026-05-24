# Reduced-Motion Audit — Voyager

> **Story 6.3 deliverable (AC1, AC2, AC5).** This document is the canonical
> inventory of every animated surface in Voyager and how each one honours
> `prefers-reduced-motion: reduce`. The implementation contract is a single
> CSS custom-property family (`--v-duration-*`) at `:root` in
> `web/src/styles/tokens.css`, plus a single `@media (prefers-reduced-motion: reduce)`
> override block in `web/src/styles/global.css` that zeroes those tokens
> for every consumer in one declaration. This file is the audit trail
> that all-and-only the surfaces listed below comply with that contract.
>
> **Scope.** Every animated surface introduced across Epics 1–6. Future
> stories adding animation (Epic 7, post-launch) MUST extend this table
> in the same PR.
>
> **Audit date.** 2026-05-24 (Story 6.3 dev cycle).
>
> **Companion artifacts:**
>
> - `web/src/styles/tokens.css` (`--v-duration-fast` / `--v-duration-base` / `--v-duration-slow`)
> - `web/src/styles/global.css` (`@media (prefers-reduced-motion: reduce)` override at `:root`)
> - `web/tests/reduced-motion-defense.test.ts` (vitest defense — bypass detection)
> - `web/tests/visual/reduced-motion-regression.spec.ts` (Playwright L4 fixture — final-state baselines)
> - `web/tests/design-system-defense.test.ts` (Story 1.7 defense — exactly one `prefers-reduced-motion` block in the codebase)

---

## 1. Implementation contract (UX-DR6 / Story 1.7)

Voyager's reduced-motion strategy is **single-source-of-truth at the token layer**:

```css
/* web/src/styles/tokens.css */
:root {
  --v-duration-fast: 120ms;
  --v-duration-base: 200ms;
  --v-duration-slow: 400ms;
}

/* web/src/styles/global.css */
@media (prefers-reduced-motion: reduce) {
  :root {
    --v-duration-fast: 0ms;
    --v-duration-base: 0ms;
    --v-duration-slow: 0ms;
  }
}
```

Every animated CSS surface in the application MUST consume one of the
`--v-duration-*` tokens via `var(...)` in its `transition`, `animation`,
`transition-duration`, or `animation-duration` declaration. JS-side
animations MUST either (a) read the resolved duration via
`getComputedStyle(...).getPropertyValue('--v-duration-*')`, OR (b) probe
`window.matchMedia('(prefers-reduced-motion: reduce)').matches` and
short-circuit to the final state.

**No per-component `@media (prefers-reduced-motion: reduce)` override
is permitted.** Story 1.7's defense test
(`web/tests/design-system-defense.test.ts`) pins exactly one such
declaration across the codebase — in `global.css`. The first-paint shim
in `web/index.html` is a duplicate of the same rule, intentionally
inlined to absorb FOUC before the main bundle hydrates; the design-system
defense test scans `web/src/styles/` + `web/src/components/` only so the
shim is not double-counted.

OS-level toggling of `prefers-reduced-motion` takes effect on the next
CSS reflow — no JS `matchMedia` listener is required because the
`@media (prefers-reduced-motion: reduce)` block at `:root` is reactive
in every modern browser per the spec.

---

## 2. Surface inventory

| Surface | Source story | File:line | Animation kind | Default duration | Reduced-motion behavior | Verification method |
| --- | --- | --- | --- | --- | --- | --- |
| `<v-title-card>` dissolve | 1.9 | `web/src/components/v-title-card.ts:49` | opacity fade (CSS) | `--v-duration-slow` (400ms) | Token collapses to 0ms via `global.css`. The dissolve becomes an instant cut and the `transitionend` listener fires on the same tick; the fallback `setTimeout` reads the resolved duration via `getComputedStyle` so it also collapses. | `web/src/components/v-title-card.test.ts` — `transitionend` + fallback timer paths |
| `<v-help-overlay>` scrim fade | 2.8 | `web/src/components/v-help-overlay.ts:106` | opacity fade (CSS) | `--v-duration-base` (200ms) | Token collapses to 0ms; scrim flashes to final opacity. | `web/src/components/v-help-overlay.test.ts` — defense gate against per-component `@media` |
| `<v-help-overlay>` dialog open/close | 2.8 | `web/src/components/v-help-overlay.ts:129-131` | opacity + transform scale (CSS) | `--v-duration-base` (200ms) | Both axes collapse to 0ms; dialog appears at final scale + opacity. | same as above |
| `<v-chapter-index>` scrim fade | 2.3 | `web/src/components/v-chapter-index.ts:137` | opacity fade (CSS) | `--v-duration-base` (200ms) | Token collapses to 0ms. | `web/src/components/v-chapter-index.test.ts` — APG primitives + per-component `@media` defense |
| `<v-chapter-index>` panel slide-in/out | 2.3 | `web/src/components/v-chapter-index.ts:156` | transform translateX (CSS) | `--v-duration-base` (200ms) | Token collapses to 0ms; panel snaps to final translateX. | same as above |
| `<v-chapter-copy>` article fade | 2.9 (extended by 4.5 — per-encounter copy refinement re-uses the same token-driven fade) | `web/src/styles/chapter-copy.css:26` | opacity fade (CSS) | `--v-duration-base` (200ms) | Token collapses to 0ms. | `web/src/components/v-chapter-copy.test.ts` |
| `<v-chapter-copy>` narrow-viewport drawer | 6.2 | `web/src/styles/chapter-copy.css:75-77` | max-height + bottom (CSS) | `--v-duration-base` (200ms) | Both axes collapse to 0ms; drawer snaps between collapsed/partial/full. | `web/src/components/v-chapter-copy.test.ts` (Story 6.2 drawer tests) |
| `<v-attitude-indicator>` dot color transition | 3.6 | `web/src/components/v-attitude-indicator.ts:104` | color (CSS) | `--v-duration-base` (200ms) | Token collapses to 0ms; CK↔synth colour flip is instant. | `web/src/components/v-attitude-indicator.test.ts` |
| `<v-attitude-indicator>` value color transition | 3.6 | `web/src/components/v-attitude-indicator.ts:109` | color (CSS) | `--v-duration-base` (200ms) | Token collapses to 0ms. | same as above |
| `<v-hud-instruments>` shut-off color shift | 3.5 | `web/src/components/v-hud-instruments.ts:78` | color (CSS) | `--v-duration-base` (200ms) | Token collapses to 0ms. | `web/src/components/v-hud-instruments.test.ts` |
| `<v-hud>` dismiss/restore opacity | 6.2 | `web/src/components/v-hud.ts:88` | opacity fade (CSS) | `--v-duration-base` (200ms) | Token collapses to 0ms; HUD dismiss is an instant cut. | `web/src/components/v-hud.test.ts` (Story 6.2 dismiss tests) |
| `<v-timeline-scrubber>` detail-variant slide-in/out | 4.4 | `web/src/components/v-timeline-scrubber.ts:210-211` | opacity + transform translateY (CSS) | `--v-duration-slow` (400ms) | Token collapses to 0ms; detail variant appears/disappears instantly. | `web/src/components/v-timeline-scrubber.test.ts` (detail variant tests) |
| `<v-timeline-scrubber>` chapter-marker tooltip fade-in | 4.4 / 6.3 | `web/src/components/v-timeline-scrubber.ts:398` | opacity fade (CSS) | `--v-duration-fast` (120ms) | **Bypassed, fixed in Story 6.3** — was a bare `80ms` literal; routed through `--v-duration-fast` so the reduced-motion override applies. `transition-delay: 0ms` (default) and `transition-delay: 200ms` (hover-dwell) are intentional delays, NOT durations — they remain bare per UX-DR22's tooltip-dwell contract. | `web/src/components/v-timeline-scrubber.test.ts` ("tooltip CSS uses a 200ms hover-dwell transition-delay") + `web/tests/reduced-motion-defense.test.ts` (bare-literal defense) |
| `ViewFrameService` smoothstep blend | 4.1 | `web/src/services/view-frame.ts:107-112` | JS smoothstep over ET range (translation-only per ADR-0023) | ±2 days simulated ET (NOT wall-clock) | `defaultReducedMotionSource` queries `matchMedia` at `getTransform` call time; `computeAlpha` short-circuits to a step function (`alpha = 1` inside held window, `0` outside) — instant cut at window boundary. | `web/src/services/view-frame.test.ts` + `web/src/services/view-frame-qa-gaps.test.ts` (mid-session toggle path) |
| `VoyagerCameraController` restore animation | 4.2 | `web/src/render/voyager-camera-controller.ts:351, 423, 630` | JS quaternion + position SLERP over `RESTORE_DURATION_MS` (400ms wall-clock) | 400ms | `reducedMotion` source defaults to `matchMedia('(prefers-reduced-motion: reduce)').matches`; at restore-start the controller snaps to the default framing on the same frame and sets `manualCameraActive = false`. | `web/src/render/voyager-camera-controller.test.ts` (reduced-motion test) |
| `voyager:restore-camera` heliocentric mode transition | 4.12 | (same as 4.2 — handled by `applyDefaultFraming` / `applyHeliocentricFraming`) | JS SLERP | 400ms | Same reduced-motion path as 4.2 — instant snap. | same as 4.2 |
| `TurnChoreography` SLERP between substate aim quaternions | 5.2 | `web/src/chapters/pale-blue-dot/turn-choreography.ts:125-130, 344-347` | JS SLERP with ease-out cubic | `SLERP_DURATION_MS` = 400ms wall-clock (mirrors `--v-duration-slow`) | `defaultReducedMotionProbe` queries `matchMedia` at substate transition; when reduced-motion is active, `setActiveSubstate` snaps to the new aim instantly (no SLERP). | `web/src/chapters/pale-blue-dot/turn-choreography.test.ts` |
| `PbdCompositeLayer` photo-plate fades | 5.3 | `web/src/chapters/pale-blue-dot/composite-layer.ts:301-308, 411-417` | JS opacity tween | `PBD_FADE_MS_BASE` = 200ms (mirrors `--v-duration-base`) | `reducedMotion` probe queried per-tick in `update()`; under reduced-motion `fadeMs = 0` so opacity snaps to `targetOpacity` on the next frame. | `web/src/chapters/pale-blue-dot/composite-layer.test.ts` (AC5 reduced-motion test) |
| `ChapterDirector` state-transition events | 2.1 | `web/src/services/chapter-director.ts` (event dispatch) | No DOM animation — emits `voyager:chapter-state-change` | n/a | n/a (no motion). HUD consumers (`<v-hud-*>`) react via CSS transitions described above; the director itself emits events, not animations. | `web/src/services/chapter-director.test.ts` |
| `<v-about-page>` mount transitions | 2.7 | `web/src/styles/about.css` (no `transition:` declarations) | None (static editorial layout) | n/a | n/a (no motion). The /about route is a static page; no transitions are declared. | `web/src/components/v-about-page.test.ts` |
| Pointer-driven scrubber drag | 1.9 / 4.4 | `web/src/components/v-timeline-scrubber.ts` (drag handlers) | No implicit easing — thumb tracks pointer 1:1 | n/a | n/a (pointer-tracking input, not motion). Already instant; documented for completeness per AC1. | `web/src/components/v-timeline-scrubber.test.ts` (scrub tests) |

---

## 3. Documented exceptions (NOT reduced)

Two surfaces are intentionally excluded from the reduced-motion contract.
Both are noted here as the binding reference; future contributors must
NOT extend the exception list without amending this doc + the
`reduced-motion-defense.test.ts` exception list.

### 3.1 Simulation playback

`RenderEngine.tick()`, `ClockManager.tick()`, spacecraft + planet
position updates, scan-platform articulation, narrow-angle-camera
frustum, and trajectory line growth all proceed at 60 FPS under
reduced-motion. The simulation IS the artifact; reducing it would defeat
the product. Only **additional** motion (UI transitions, choreography,
view-frame blending, restore-camera animation) is reduced.

**File references:** `web/src/render/render-engine.ts`, `web/src/services/clock-manager.ts`.

**Rationale:** FR46 ("reduced-motion mode") explicitly scopes the
reduction to UI motion. The visitor under reduced-motion can still
scrub, play, pause, change speed multiplier, jump chapters, and toggle
audio — all simulation controls remain functional and the simulation
continues to update per frame.

### 3.2 Golden Record audio cross-fade

`AudioPlaybackService` performs a 1500ms cross-fade between Golden Record
tracks when chapter context changes. This is **NOT motion** — it's an
audio register, governed by Story 6.1's spec rationale ("audio is its
own register; we explicitly reject piggy-backing it on motion tokens").

**File reference:** `web/src/services/audio-playback-service.ts` (the
hard-coded 1500ms cross-fade).

**Defense test:** `web/tests/audio-playback-integration.test.ts`
includes a test ("matchMedia stub for prefers-reduced-motion does NOT
shorten the 1500ms fade") that proves the service does not consult any
motion-preference signal.

**Rationale:** Reduced-motion is an accessibility setting for
vestibular sensitivity to UI motion; reducing audio fade duration would
not serve that audience and would degrade the listening experience for
all users.

---

## 4. Per-epic compliance verification (AC5)

One representative component per epic verified to compliantly route
through `--v-duration-*` tokens. The cross-references below are the
audit's anchor points for AC5; a contributor changing any of these
surfaces must re-run the defense tests in `web/tests/reduced-motion-defense.test.ts`.

| Epic | Component | Verified via |
| --- | --- | --- |
| Epic 1 | `<v-title-card>` | `web/src/components/v-title-card.ts:49` — `transition: opacity var(--v-duration-slow) var(--v-ease-in-out);` |
| Epic 2 | `<v-chapter-copy>` (article fade) + `<v-chapter-index>` (panel slide) | `web/src/styles/chapter-copy.css:26` + `web/src/components/v-chapter-index.ts:156` — both use `var(--v-duration-base)` |
| Epic 3 | `<v-attitude-indicator>` (CK↔synth colour) | `web/src/components/v-attitude-indicator.ts:104,109` — both use `var(--v-duration-base)` |
| Epic 4 | `<v-timeline-scrubber>` detail variant + `VoyagerCameraController` restore | `web/src/components/v-timeline-scrubber.ts:210-211` (CSS token) + `web/src/render/voyager-camera-controller.ts:351,423,630` (JS `matchMedia` short-circuit) |
| Epic 5 | `TurnChoreography` (JS SLERP) + `PbdCompositeLayer` (JS opacity tween) | `web/src/chapters/pale-blue-dot/turn-choreography.ts:125-130,344-347` + `web/src/chapters/pale-blue-dot/composite-layer.ts:301-308,411-417` — both use `matchMedia` probes injected via DI for testability |
| Epic 6 | `<v-hud>` dismiss/restore + `<v-chapter-copy>` drawer | `web/src/components/v-hud.ts:88` + `web/src/styles/chapter-copy.css:75-77` — both use `var(--v-duration-base)` |

---

## 5. JS-side animation pattern reference

Three JS-driven animations exist in the codebase; all follow the same
DI-friendly `matchMedia` probe pattern. Future stories adding JS-driven
motion MUST follow this pattern (NOT a bare numeric duration constant
without a reduced-motion check).

### 5.1 The pattern

```ts
export type ReducedMotionProbe = () => boolean;

const defaultReducedMotionProbe: ReducedMotionProbe = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

class MyAnimation {
  private readonly reducedMotion: ReducedMotionProbe;
  constructor(opts?: { reducedMotion?: ReducedMotionProbe }) {
    this.reducedMotion = opts?.reducedMotion ?? defaultReducedMotionProbe;
  }
  start(from: number, to: number): void {
    if (this.reducedMotion()) {
      this.value = to;  // instant cut
      return;
    }
    // ...normal tween
  }
}
```

The DI hook makes the animation unit-testable without monkey-patching
`window.matchMedia`. Tests inject a stub returning `true` to exercise
the reduced-motion code path.

### 5.2 Where this pattern lives today

- `web/src/chapters/pale-blue-dot/turn-choreography.ts` — `ReducedMotionProbe` type + `defaultReducedMotionProbe`.
- `web/src/chapters/pale-blue-dot/composite-layer.ts` — same shape (`ReducedMotionProbe`).
- `web/src/services/view-frame.ts` — `ReducedMotionSource` (same idea, slightly different type name).
- `web/src/render/voyager-camera-controller.ts` — `ReducedMotionSource`.

---

## 6. Bare-millisecond audit (AC2 closure)

Story 6.3 grep-audited the codebase for `transition:`, `animation:`,
`transition-duration:`, and `animation-duration:` declarations using
bare millisecond literals. Findings:

| Match | File:line | Resolution |
| --- | --- | --- |
| `transition: opacity 80ms ease;` | `web/src/components/v-timeline-scrubber.ts:398` (pre-Story 6.3) | **Bypassed, fixed in Story 6.3** — routed through `var(--v-duration-fast)` (120ms baseline → 0ms reduced). |

No other bare-literal `transition:` / `animation:` declarations found in
`web/src/`. The defense test at `web/tests/reduced-motion-defense.test.ts`
greps the source on every test run and asserts the count remains 0 (or
matches the exception list). All transition/animation-related
`*-delay` literals are intentional UX delays per UX-DR22 (chapter-marker
tooltip dwell) and are excepted in the defense test's allowlist.

---

## 7. Playwright fixture (AC4)

The L4 visual regression suite at `web/tests/visual/playwright.config.ts`
already pins `reducedMotion: 'reduce'` for all baselines (Story 4.9 +
5.4). Story 6.3 adds a dedicated dynamic-state fixture at
`web/tests/visual/reduced-motion-regression.spec.ts` that explicitly
calls `page.emulateMedia({ reducedMotion: 'reduce' })` before each
navigation and asserts the FINAL state at scenes that WOULD otherwise
mid-animate — exercising the OS-toggle reflow path described in §1.

The new spec captures one baseline per scene (final-state, no
animation):

- `title-card-final-state` — `~1 s` after load (the dissolve, instant under reduced motion)
- `chapter-copy-final-state` — `~200 ms` after window entry (the article fade, instant)
- `chapter-index-final-state` — `~100 ms` after icon click (the panel slide, instant)
- `pbd-turn-final-state` — `~50 ms` into a substate transition (the SLERP, instant)
- `hud-dismiss-final-state` — `~100 ms` after H keypress (the opacity fade, instant)

Baselines committed under `web/tests/visual/__snapshots__/reduced-motion-*.png`
following the `--update-snapshots` discipline documented at
[`docs/visual-validation/update-snapshot-discipline.md`](../visual-validation/update-snapshot-discipline.md).

---

## 8. Forward-coupled obligations

Any future story (Epic 7 or post-launch) that introduces a new animated
surface MUST:

1. Add a row to §2's table naming the surface, source story, file:line, and verification method.
2. Use one of the existing `--v-duration-*` tokens (CSS path) or one of the existing `ReducedMotion*` DI types (JS path) — NOT a bare millisecond literal.
3. Run `web/tests/reduced-motion-defense.test.ts` locally; if a new bare literal must exist (rare; document why), extend the test's exception list with rationale.
4. Re-run the Playwright fixture at `web/tests/visual/reduced-motion-regression.spec.ts` to confirm the new surface respects the final-state contract.

A future code review that observes a new bare-literal `transition:` or
`animation:` declaration without a corresponding row in this table is a
HIGH finding per Skill Rule 6 (ADR violations — the implementation
contract is committed in this doc + Story 1.7 / UX-DR6).
