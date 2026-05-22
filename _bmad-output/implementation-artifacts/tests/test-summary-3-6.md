# Test Automation Summary — Story 3.6 (`<v-attitude-indicator>` HUD Provenance Element)

**QA agent:** qa-3-6 (Opus 4.7) under `/epic-cycle 3`
**Story file:** `_bmad-output/implementation-artifacts/3-6-v-attitude-indicator-hud-provenance-element.md`
**Story status going in:** review (dev-3-6 committed Tasks T1–T6; T7 lead-driven MCP smoke pending)
**Baseline going in:** web vitest 2295 pass / 1 skipped / 126 files (Story 3.5 baseline 2255 + 40 net new from dev-3-6: 25 component unit + 8 integration + 5 embed-mode AC7 + 2 baseline AC7 reframing); typecheck clean; lint baseline preserved (4 pre-existing warnings)
**Baseline going out:** web vitest **2322 pass** / 1 skipped / 127 files (+27 net new QA gap tests in `web/tests/v-attitude-indicator-qa-gaps.test.ts`); typecheck clean; lint baseline preserved

## Chrome DevTools MCP smoke stage (Rule 3 + Rule 8 — AC10)

Story 3.6 touches `web/src/main.ts` (`firstPaintHandle.hud.attitudeService = attitudeService` assignment in the ManifestLoader.then() chain), `web/src/boot/first-paint.ts` (the `hud.embedEnabled = options.embedEnabled === true` propagation), `web/src/components/v-hud.ts` (new `attitudeService` + `embedEnabled` reactive-target fields; conditional `<v-attitude-indicator>` render; new `attitudeIndicator` accessor; tick propagation), and introduces `web/src/components/v-attitude-indicator.ts` (a new user-facing HUD provenance element). Per voyager-skill-rules.md Rule 3, browser-MCP smoke is the per-story exit criterion when `web/src/` is touched. Per Rule 8, no initScript shim is needed (post-Story-1.16 Chrome-for-Testing 148 loads Voyager via brotli-dec-wasm).

Per ADR-0010 Layer 1 and Rule 7, the smoke is executed by the **lead** (qa-3-6 authors the plan; lead runs the probes). The probe plan below is one-shot executable against the local dev server on `http://127.0.0.1:5173/`.

### Pre-flight checklist

1. **Dev server up.** `cd web && npm run dev` running on `127.0.0.1:5173`.
2. **Evidence directory exists.** `mkdir -p _bmad-output/implementation-artifacts/3-6-smoke-evidence/`.
3. **No external prerequisites.** Unlike Story 3.5 (which depended on LFS-backed LOD GLBs), Story 3.6's surface is the HUD shadow DOM — the smoke runs cleanly on path B (no LOD GLBs) since the provenance indicator does not depend on the spacecraft mesh.

### Probe 1 — Boot + indicator mounts inside `<v-hud>` shadow DOM (AC1)

**Goal:** Confirm the boot path constructs `<v-hud>` with the inline `<v-attitude-indicator>` rendered, that `customElements.get('v-attitude-indicator')` resolves, and that the indicator is reachable through `<v-hud>`'s shadow root.

```js
// mcp__chrome-devtools-mcp__navigate_page
url: "http://127.0.0.1:5173/"

// mcp__chrome-devtools-mcp__wait_for
text: "Voyager"

// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  (() => {
    const hud = document.querySelector('v-hud');
    const indicator = hud?.shadowRoot?.querySelector('v-attitude-indicator');
    const out = indicator?.shadowRoot?.querySelector('output');
    return {
      indicatorRegistered: typeof customElements.get('v-attitude-indicator') === 'function',
      hudPresent: hud !== null,
      indicatorInHudShadow: indicator !== null && indicator !== undefined,
      outputElementPresent: out !== null && out !== undefined,
      outputAriaLabel: out?.getAttribute('aria-label'),
      outputAriaLive: out?.getAttribute('aria-live'),
      defaultActiveSpacecraft: indicator?.activeSpacecraftId,
    };
  })()
`
```

**Asserted observations:**
- `indicatorRegistered === true`
- `hudPresent === true`
- `indicatorInHudShadow === true`
- `outputElementPresent === true`
- `outputAriaLabel === 'Attitude data provenance'`
- `outputAriaLive === 'polite'`
- `defaultActiveSpacecraft === -31` (AC4 V1 stub default)

**Failure modes addressed:**
- Indicator never registers (Lit `customElements.define` skipped) — `indicatorRegistered === false`.
- HUD's conditional render dropped (e.g. a future refactor removed the `<v-attitude-indicator>` template node) — `indicatorInHudShadow === false`.
- A11y attributes regressed during a UX tweak — `outputAriaLabel` or `outputAriaLive` mismatch.

```js
// mcp__chrome-devtools-mcp__take_screenshot
// Evidence path: _bmad-output/implementation-artifacts/3-6-smoke-evidence/probe1-boot-hud.png
```

```js
// mcp__chrome-devtools-mcp__take_snapshot
// Captures the accessibility tree — verifies the live region is visible to AT.
```

### Probe 2 — V1 Jupiter CK regime: "CK reconstructed" visible (AC2)

**Goal:** Navigate to the V1 Jupiter encounter ET. Confirm the indicator value text is "CK reconstructed", the host `data-provenance` attribute is `ck`, and the color cascade resolves to the `--v-color-ck` token.

```js
// mcp__chrome-devtools-mcp__navigate_page
url: "http://127.0.0.1:5173/?t=1979-03-05T11:30:00Z"

// mcp__chrome-devtools-mcp__wait_for
text: "Voyager 1"

// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  (async () => {
    // Wait for the manifest to land + the indicator to flip out of the
    // placeholder. The HUD ticks via engine.onFrame so the first non-null
    // service tick lands within a frame of construction.
    let attempts = 0;
    let value = '—';
    while (value === '—' && attempts < 40) {
      await new Promise((r) => setTimeout(r, 100));
      const hud = document.querySelector('v-hud');
      const indicator = hud?.shadowRoot?.querySelector('v-attitude-indicator');
      const v = indicator?.shadowRoot?.querySelector('.att-value')?.textContent;
      value = v ?? '—';
      attempts += 1;
    }

    const hud = document.querySelector('v-hud');
    const indicator = hud?.shadowRoot?.querySelector('v-attitude-indicator');
    const out = indicator?.shadowRoot?.querySelector('output');
    const value2 = indicator?.shadowRoot?.querySelector('.att-value')?.textContent;
    const provenance = indicator?.getAttribute('data-provenance');

    // Resolve the computed color of the value span to verify the CK token
    // is actually cascading (not a stale "fg-quiet" placeholder color).
    const valueEl = indicator?.shadowRoot?.querySelector('.att-value');
    const computedColor = valueEl !== null && valueEl !== undefined
      ? window.getComputedStyle(valueEl).color
      : null;

    return {
      ok: true,
      attempts,
      value: value2,
      provenance,
      outputText: out?.textContent?.replace(/\\s+/g, ' ').trim(),
      computedColor,
    };
  })()
`
```

**Asserted observations:**
- `value === 'CK reconstructed'` (the AC2 contract text)
- `provenance === 'ck'` (the host attribute reflects)
- `outputText === 'ATT ● CK reconstructed'` (full output textContent — the no-color-only contract)
- `computedColor` is non-empty (e.g. `rgb(74, 124, 78)` from `#4a7c4e` — the CK token resolves)

**Failure modes addressed:**
- Indicator stuck on the "ATT —" placeholder (AttitudeService never wired via `firstPaintHandle.hud.attitudeService = attitudeService`) — `value === '—'`.
- Provenance text says "Synthesized" at the Jupiter ET (AttitudeService boundary discipline broken) — `value !== 'CK reconstructed'`.
- Color token failed to resolve (`--v-color-ck` missing from `tokens.css` cascade) — `computedColor` matches the quiet-fg color.

```js
// mcp__chrome-devtools-mcp__take_screenshot
// Evidence path: _bmad-output/implementation-artifacts/3-6-smoke-evidence/probe2-v1-jupiter-ck.png
```

### Probe 3 — Cruise ET synthesized regime: "Synthesized (HGA Earth-pointing)" visible (AC3)

**Goal:** Navigate to a deep-cruise ET (1995-01-01, outside any CK window). Confirm the indicator value text becomes "Synthesized (HGA Earth-pointing)" and the host attribute flips to `synthesized` with the gold color token cascading.

```js
// mcp__chrome-devtools-mcp__navigate_page
url: "http://127.0.0.1:5173/?t=1995-01-01T00:00:00Z"

// mcp__chrome-devtools-mcp__wait_for
text: "Voyager 1"

// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  (async () => {
    let attempts = 0;
    let value = '—';
    while ((value === '—' || value === 'CK reconstructed') && attempts < 40) {
      await new Promise((r) => setTimeout(r, 100));
      const hud = document.querySelector('v-hud');
      const indicator = hud?.shadowRoot?.querySelector('v-attitude-indicator');
      const v = indicator?.shadowRoot?.querySelector('.att-value')?.textContent;
      value = v ?? '—';
      attempts += 1;
    }

    const hud = document.querySelector('v-hud');
    const indicator = hud?.shadowRoot?.querySelector('v-attitude-indicator');
    const out = indicator?.shadowRoot?.querySelector('output');
    const value2 = indicator?.shadowRoot?.querySelector('.att-value')?.textContent;
    const provenance = indicator?.getAttribute('data-provenance');
    const valueEl = indicator?.shadowRoot?.querySelector('.att-value');
    const computedColor = valueEl !== null && valueEl !== undefined
      ? window.getComputedStyle(valueEl).color
      : null;

    return {
      ok: true,
      attempts,
      value: value2,
      provenance,
      outputText: out?.textContent?.replace(/\\s+/g, ' ').trim(),
      computedColor,
    };
  })()
`
```

**Asserted observations:**
- `value === 'Synthesized (HGA Earth-pointing)'` (the AC3 contract text — apology-free)
- `provenance === 'synthesized'` (host attribute reflects)
- `outputText === 'ATT ● Synthesized (HGA Earth-pointing)'`
- `computedColor` is non-empty (e.g. `rgb(212, 160, 23)` from `#d4a017` — the synth token resolves)

**Failure modes addressed:**
- Stuck on "CK reconstructed" at cruise (AttitudeService boundary discipline broken; or indicator failed to re-render on the regime flip).
- Wrong text variant (e.g. "Synthesized" without "(HGA Earth-pointing)" — load-bearing UX-DR10 honesty register).

```js
// mcp__chrome-devtools-mcp__take_screenshot
// Evidence path: _bmad-output/implementation-artifacts/3-6-smoke-evidence/probe3-cruise-synthesized.png
```

### Probe 4 — Embed mode skips the indicator (AC7)

**Goal:** Navigate with `?embed=true`. Confirm the HUD shell is still mounted (date / distance / speed / instruments remain) but the `<v-attitude-indicator>` element is NOT in the HUD shadow root.

```js
// mcp__chrome-devtools-mcp__navigate_page
url: "http://127.0.0.1:5173/?embed=true"

// mcp__chrome-devtools-mcp__wait_for
text: "Voyager"

// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  (() => {
    const hud = document.querySelector('v-hud');
    const indicator = hud?.shadowRoot?.querySelector('v-attitude-indicator');
    const hudDate = hud?.shadowRoot?.querySelector('v-hud-date');
    const hudDistance = hud?.shadowRoot?.querySelector('v-hud-distance');
    const hudSpeed = hud?.shadowRoot?.querySelector('v-hud-speed');
    const chapterIndex = document.querySelector('v-chapter-index');
    return {
      hudMounted: hud !== null,
      indicatorPresent: indicator !== null && indicator !== undefined,
      hudDatePresent: hudDate !== null && hudDate !== undefined,
      hudDistancePresent: hudDistance !== null && hudDistance !== undefined,
      hudSpeedPresent: hudSpeed !== null && hudSpeed !== undefined,
      chapterIndexPresent: chapterIndex !== null,
    };
  })()
`
```

**Asserted observations:**
- `hudMounted === true` (HUD shell is content, not chrome)
- `indicatorPresent === false` (the AC7 chrome-skip contract)
- `hudDatePresent === true && hudDistancePresent === true && hudSpeedPresent === true` (other HUD sub-components survive embed mode)
- `chapterIndexPresent === false` (sanity — embed mode also skips chapter-index, Story 2.5 contract)

**Failure modes addressed:**
- Indicator leaks into embed mode (the `embedEnabled` flag isn't being read in `<v-hud>`'s template, or first-paint stopped propagating it).
- HUD shell incorrectly skipped (`hudDate`, `hudDistance`, or `hudSpeed` missing — a regression that confused chrome-vs-content for the inline indicator and accidentally hid sibling sub-components).

```js
// mcp__chrome-devtools-mcp__take_screenshot
// Evidence path: _bmad-output/implementation-artifacts/3-6-smoke-evidence/probe4-embed-mode-skip.png
```

### Probe 5 — Accessibility tree snapshot (AC6)

**Goal:** Capture the accessibility tree at a CK ET. Verify the `<output>` element appears in the AT with role `status` (the implicit role for `<output>`), the accessible name "Attitude data provenance", and the announced value text "CK reconstructed" (label + dot suppressed via aria-hidden).

```js
// mcp__chrome-devtools-mcp__navigate_page
url: "http://127.0.0.1:5173/?t=1979-03-05T11:30:00Z"

// mcp__chrome-devtools-mcp__wait_for
text: "Voyager 1"

// Wait for indicator to flip out of placeholder.
// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  (async () => {
    let attempts = 0;
    let value = '—';
    while (value === '—' && attempts < 40) {
      await new Promise((r) => setTimeout(r, 100));
      const hud = document.querySelector('v-hud');
      const indicator = hud?.shadowRoot?.querySelector('v-attitude-indicator');
      const v = indicator?.shadowRoot?.querySelector('.att-value')?.textContent;
      value = v ?? '—';
      attempts += 1;
    }
    return { value, attempts };
  })()
`

// mcp__chrome-devtools-mcp__take_snapshot
// Evidence path: _bmad-output/implementation-artifacts/3-6-smoke-evidence/probe5-a11y-snapshot.json
```

**Asserted observations (read from the snapshot):**
- A `status`-role node (the implicit role of `<output>`) exists in the tree under the HUD subtree.
- Its accessible name is "Attitude data provenance".
- Its accessible description / value content includes "CK reconstructed".
- The dot character (`●`) does NOT appear in the announced subtree (aria-hidden suppresses it).
- The "ATT" prefix label does NOT appear in the announced subtree (aria-hidden suppresses it).

**Failure modes addressed:**
- A future refactor moves `aria-label` from `<output>` to a wrapping `<div>` (a screen reader would announce both, or get confused about the live region scope).
- A future "improvement" removes `aria-hidden` from the dot/label thinking those are decorative-vs-readable (announcement spam: "A T T black-circle CK reconstructed" instead of "Attitude data provenance: CK reconstructed").

### Probe 6 — Active-spacecraft event cross-shadow propagation (AC4 substrate)

**Goal:** Register a `document`-level listener for `activeSpacecraftChanged`. Programmatically call `setActiveSpacecraft(-32)` from the page (simulating Epic 4's ChapterDirector hook). Verify the event fires at the document level (proving the `composed: true` flag is set so the event crosses the `<v-hud>` shadow boundary).

```js
// mcp__chrome-devtools-mcp__navigate_page
url: "http://127.0.0.1:5173/?t=1979-03-05T11:30:00Z"

// mcp__chrome-devtools-mcp__wait_for
text: "Voyager 1"

// mcp__chrome-devtools-mcp__evaluate_script
expression: `
  (async () => {
    const events = [];
    document.addEventListener('activeSpacecraftChanged', (e) => events.push({
      naifId: e.detail?.naifId,
      composed: e.composed,
      bubbles: e.bubbles,
    }));

    // Drain initial paint.
    await new Promise((r) => setTimeout(r, 500));

    const hud = document.querySelector('v-hud');
    const indicator = hud?.shadowRoot?.querySelector('v-attitude-indicator');
    if (indicator === null || indicator === undefined) {
      return { ok: false, reason: 'indicator missing' };
    }

    indicator.setActiveSpacecraft(-32);

    // Settle one microtask.
    await Promise.resolve();

    return {
      ok: true,
      eventCount: events.length,
      events,
      indicatorActiveSpacecraft: indicator.activeSpacecraftId,
    };
  })()
`
```

**Asserted observations:**
- `eventCount === 1`
- `events[0].naifId === -32`
- `events[0].composed === true` (the load-bearing cross-shadow flag)
- `events[0].bubbles === true`
- `indicatorActiveSpacecraft === -32` (the setter wrote the property)

**Failure modes addressed:**
- A future refactor drops `composed: true` from the CustomEvent — `eventCount === 0` (the event would bubble inside the HUD shadow tree only).
- Epic 4's ChapterDirector hook can't subscribe — this probe is the runtime substrate for that downstream wiring.

### Probe 7 — Console clean during regime-flip scrub (Rule 3, AC9 closing)

**Goal:** No console errors during a navigation that crosses provenance regimes. The Lit dev-mode banner is the only acceptable warning. No errors from the indicator's tick, no warnings about reactive-property updates, no Lit class-field-shadowing errors (which dev fixed and we defend against re-introduction).

```js
// mcp__chrome-devtools-mcp__navigate_page
url: "http://127.0.0.1:5173/?t=1979-03-05T11:30:00Z"

// mcp__chrome-devtools-mcp__wait_for
text: "Voyager 1"

// Settle 3 seconds at the CK ET.
// mcp__chrome-devtools-mcp__wait_for { time: 3000 }

// Cross to the cruise ET.
// mcp__chrome-devtools-mcp__navigate_page
url: "http://127.0.0.1:5173/?t=1995-01-01T00:00:00Z"

// mcp__chrome-devtools-mcp__wait_for
text: "Voyager 1"

// Settle another 3 seconds.
// mcp__chrome-devtools-mcp__wait_for { time: 3000 }

// mcp__chrome-devtools-mcp__list_console_messages
// filter: "error"
```

**Asserted observations:**
- Zero `error`-level messages.
- Zero references to `lit.dev/msg/class-field-shadowing` (the regression dev caught in T1 — class-field initializers shadowing Lit's `static properties` accessor).
- Zero `[v-attitude-indicator]` references in any error.
- `warn`-level messages: only the Lit dev-mode banner is allowed.

```js
// mcp__chrome-devtools-mcp__list_network_requests
// filter: "manifest|attitude|voyager-trj"
```

**Asserted observations:**
- All bus_attitude + platform_attitude chunk requests return HTTP 200 (Story 3.4 carry-forward — AttitudeService still loads chunks correctly).
- No 404s.

## Evidence directory layout

After lead executes the probes:

```
_bmad-output/implementation-artifacts/3-6-smoke-evidence/
├── probe1-boot-hud.png
├── probe2-v1-jupiter-ck.png
├── probe3-cruise-synthesized.png
├── probe4-embed-mode-skip.png
├── probe5-a11y-snapshot.json
├── probe-results.json    # optional — copy of each evaluate_script return value
```

## Coverage gap analysis vs dev's tests

Dev-3-6's 25 component unit + 8 integration + 5 embed-mode AC7 tests cover the eight ACs deeply at the unit + integration tier, including the load-bearing Lit class-field-shadowing fix and the AC5 spy-on-requestUpdate gate. Gaps identified and filled in `web/tests/v-attitude-indicator-qa-gaps.test.ts` (27 new tests, all in the default Vitest collection):

| Gap | AC | Why dev missed it | Resolution |
|---|---|---|---|
| **AC4 `composed: true` cross-shadow contract** — dev asserts `bubbles === true` (event escapes its host) but never verifies `composed === true` (event crosses the shadow boundary). A regression that drops `composed: true` would break Epic 4's ChapterDirector hook (subscribing at `document` level) silently. | AC4 | Dev tested at the parent host (which catches a bubbling event regardless of composed). The cross-shadow `document`/`window`-level catch was untested. | New: `QA gap 1 — AC4 composed: true shadow-cross contract` (3 tests: composed === true on the CustomEvent; document-level listener catches when indicator lives in `<v-hud>` shadow; window-level listener also catches) |
| **AC5 multi-flip re-render gating** — dev pins ONE boundary crossing. A regression that fails to re-pin `prevProvenance` after the first flip would surface as every subsequent tick re-rendering — not caught by a single-boundary test. | AC5 | Dev's test covers one transition; sustained multi-flip sentinel is missing. | New: `QA gap 2 — AC5 multi-flip re-render gating` (2 tests: three successive ck→synth→ck→synth transitions trigger exactly three requestUpdate calls; zigzag near boundary still gates correctly) |
| **Late wire-up sustained tick → first-paint** — dev tests basic "wire service after mount → tick → paint" but the realistic boot timeline (~5 seconds of pre-manifest 60 Hz ticks before AttitudeService is constructed) wasn't exercised. | AC1, AC5 | Dev's test uses a single placeholder tick; sustained pre-wire ticks + first post-wire transition is the regression-prone state. | New: `QA gap 3 — late wire-up paints after multiple pre-wire ticks` (3 tests: 300 pre-wire ticks are clean no-ops; first post-wire tick transitions out of placeholder; null-then-back-to-null re-mount preserves placeholder) |
| **Cross-spacecraft regime divergence at one ET** — dev's "re-evaluates provenance on next tick for the new spacecraft" test uses a non-realistic naifId-only stub. AC4's user-facing critical path is V1 has CK, V2 has synthesized AT THE SAME ET (e.g. 1979 Jupiter when V2 was on cruise). | AC4 | Dev's stub doesn't mirror the encounter-window structure where regime depends on (naifId, et). | New: `QA gap 4 — cross-spacecraft regime divergence at one ET` (2 tests: V1=ck, V2=synth at the same ET; round-trip V1→V2→V1 re-paints CK) |
| **HUD style defense extension** — the existing `hud-style-defense.test.ts` allowlists `v-hud-date`, `v-hud-distance`, `v-hud-speed`, `v-hud-chapter-title`, `v-hud-instruments`, and `v-hud`. The new `v-attitude-indicator.ts` was not added. The HUD's text-shadow inherits, but the no-background-fill and tabular-nums contracts need direct pinning. | AC2 | Dev mirrored the no-background-fill regex in the component's own test file, but did not extend the central style-defense file or pin `font-variant-numeric` + `var(--v-font-mono)`. | New: `QA gap 5 — HUD style defense for v-attitude-indicator` (5 tests: no background:/background-color: declarations; tabular-nums present; mono font token used; tokens.css defines --v-color-ck + --v-color-synth; component references both regime tokens via :host([data-provenance]) selectors) |
| **embedEnabled reactive re-render after mount** — dev's tests check initial mount paths. Toggling `embedEnabled` from `false → true` AFTER the HUD has mounted exercises Lit's reactive-property re-render path; this is a load-bearing regression sentinel against a future refactor that reads `embedEnabled` only at first render. | AC7 | Dev's pattern tests only initial mount; mid-stream toggle is a runtime regression channel that wasn't exercised. | New: `QA gap 6 — embedEnabled reactive re-render flips indicator presence after mount` (3 tests: false→true removes indicator; true→false re-adds + propagates service; hud.tick safe across the toggle) |
| **main.ts source-grep: AttitudeService wires into `<v-hud>`** — the integration test asserts the wiring via manual assignment. A regression dropping `firstPaintHandle.hud.attitudeService = attitudeService` in main.ts would leave the indicator stuck on the placeholder in the browser — but the integration test would still pass (because it sets the property manually). | AC1, AC8 | Dev's integration test isolates the component contract; main.ts wiring is a downstream surface no unit test pins. | New: `QA gap 7 — main.ts source-grep` (2 tests: assignment regex present; AttitudeService constructed after EphemerisService) |
| **AC6 a11y scaffolding pre-binding** — axe-core is deferred to Story 6.4. We pin the scaffolding axe-core will validate: `<output>` is the accessible name carrier (not a wrapping div); only the value span is non-aria-hidden; aria-live never escalates from polite to assertive across regime flips. | AC6 | Dev's tests check individual attributes but not the structural relationship (label is on output, not host) or the multi-flip aria-live stability. | New: `QA gap 8 — AC6 a11y scaffolding pre-binding` (3 tests: aria-label on `<output>` not on the host; only value span is announced; aria-live stays polite through regime flips) |
| **Active-spacecraft id setter type discipline** — defense-in-depth that the public setter is not accidentally widened beyond the `-31 | -32` literal union. | AC4 | Dev tests behavior but not the type-union contract; this pin documents the runtime acceptance of exactly those two NAIF ids. | New: `QA gap 9 — active-spacecraft id setter type discipline` (2 tests: -31/-32 round-trip via activeSpacecraftId; both branches accepted) |
| **Sustained-tick rate budget** — AC5's architectural goal is allowing 60 Hz tick participation without 60 Hz Lit updates. The dev test pins 100 ticks; we extend to a 5-second 60-Hz budget (300 ticks) for both regimes. | AC5 | Dev's test covers a short window; the 5-second sustained-rate budget is the architectural commitment. | New: `QA gap 10 — sustained-tick rate: zero rerenders at steady state` (2 tests: 300 ticks at steady CK; 300 ticks at steady synth) |

## Generated Tests

### Web-side (vitest)

| File | Test block | AC | Discoverability |
|---|---|---|---|
| `web/tests/v-attitude-indicator-qa-gaps.test.ts` | `QA gap 1 — AC4 composed: true shadow-cross contract` (3 tests) | AC4 | Default Vitest collection (no markers, no `.skip`); `@vitest-environment happy-dom` directive matches existing QA-gap files |
| `web/tests/v-attitude-indicator-qa-gaps.test.ts` | `QA gap 2 — AC5 multi-flip re-render gating` (2 tests) | AC5 | Default collection |
| `web/tests/v-attitude-indicator-qa-gaps.test.ts` | `QA gap 3 — late wire-up paints after multiple pre-wire ticks` (3 tests) | AC1, AC5 | Default collection |
| `web/tests/v-attitude-indicator-qa-gaps.test.ts` | `QA gap 4 — cross-spacecraft regime divergence at one ET` (2 tests) | AC4 | Default collection |
| `web/tests/v-attitude-indicator-qa-gaps.test.ts` | `QA gap 5 — HUD style defense for v-attitude-indicator` (5 tests) | AC2 | Default collection (filesystem reads via node:fs) |
| `web/tests/v-attitude-indicator-qa-gaps.test.ts` | `QA gap 6 — embedEnabled reactive re-render flips indicator presence after mount` (3 tests) | AC7 | Default collection |
| `web/tests/v-attitude-indicator-qa-gaps.test.ts` | `QA gap 7 — main.ts source-grep` (2 tests) | AC1, AC8 | Default collection (source-grep uses node:fs) |
| `web/tests/v-attitude-indicator-qa-gaps.test.ts` | `QA gap 8 — AC6 a11y scaffolding pre-binding for axe-core gate (Story 6.4)` (3 tests) | AC6 | Default collection |
| `web/tests/v-attitude-indicator-qa-gaps.test.ts` | `QA gap 9 — active-spacecraft id setter type discipline` (2 tests) | AC4 | Default collection |
| `web/tests/v-attitude-indicator-qa-gaps.test.ts` | `QA gap 10 — sustained-tick rate: 100 ticks emit zero rerenders at steady state` (2 tests) | AC5 | Default collection |

**Total: 27 new tests in 1 new file. All discovered by `cd web && npx vitest run` with no special markers.**

## Coverage

- **AC1 (`<v-attitude-indicator>` Lit component renders inline with `<v-hud-date>`):** Dev's unit tests cover registration, BaseElement extension, default state, and placeholder rendering. Dev's 8 integration tests verify the component lives inside `<v-hud>`'s shadow root and ticks via the HUD's per-frame propagation. **+3 QA tests (gap 3)** for the realistic-boot-timeline pre-manifest-load sequence and **+2 QA tests (gap 7)** for the main.ts wire-up. Lead-driven MCP probe 1 verifies the rendered shadow DOM at runtime.
- **AC2 (Provenance display: CK regime):** Dev's tests cover the value text, the `data-provenance` host attribute, the ATT label + dot composition, and the token references. **+5 QA tests (gap 5)** extend the HUD style defense and pin token cascade. Lead-driven MCP probe 2 verifies the runtime visual at the V1 Jupiter ET including computed color.
- **AC3 (Provenance display: synthesized regime):** Dev's tests mirror AC2 for the synthesized text and host attribute, plus the "no color-only" cross-check. **Lead-driven MCP probe 3** verifies the runtime visual at the cruise ET including the apology-free "Synthesized (HGA Earth-pointing)" register.
- **AC4 (Active spacecraft selection stub + event):** Dev's tests cover the V1 default, the setter, idempotence, and the bubbling-event dispatch. **+3 QA tests (gap 1)** add the `composed: true` cross-shadow contract; **+2 QA tests (gap 4)** add the cross-spacecraft regime-divergence flow; **+2 QA tests (gap 9)** pin the literal-union type discipline. Lead-driven MCP probe 6 verifies `document`-level catch at runtime.
- **AC5 (Per-frame tick + re-render gating):** Dev's 3 unit tests cover stable provenance (≤1 update), single boundary (exactly 1 update), and null-service no-op. **+2 QA tests (gap 2)** add multi-flip sentinel + sub-tick zigzag near boundary; **+3 QA tests (gap 3)** add the late-wire-up no-op contract; **+2 QA tests (gap 10)** pin the 5-second sustained-rate budget. Lead-driven MCP probe 7 verifies no console spam during a sustained tick at runtime.
- **AC6 (Accessibility: aria-live polite + aria-label, axe-core deferred to Story 6.4):** Dev's tests cover the aria-label, aria-live=polite, aria-hidden on dot/label. **+3 QA tests (gap 8)** pin the structural a11y scaffolding (label is on `<output>`, not host; only value span participates in the accessible name; polite never escalates to assertive). Lead-driven MCP probe 5 captures the accessibility tree snapshot.
- **AC7 (Embed-mode skip-mount):** Dev's 5 embed-mode-first-paint tests cover the initial-mount paths (embed=true → absent; false → present; omitted → present; HUD shell still mounts; handle parity). **+3 QA tests (gap 6)** add the mid-stream toggle reactive-property contract. Lead-driven MCP probe 4 verifies runtime via `?embed=true` navigation.
- **AC8 (Integration AC: indicator ↔ AttitudeService wire-up):** Dev's 8 integration tests cover the full `<v-hud>` + indicator + stub-service composition. **+2 QA tests (gap 7)** add the main.ts source-grep for the upstream wiring contract.
- **AC9 (Test sweep + per-story smoke):** Verified — `cd web && npm test -- --run` passes at 2322 (+27 from 2295 dev baseline). Typecheck clean; lint baseline preserved.
- **AC10 (Lead-driven Chrome DevTools MCP smoke):** Probe plan authored above (7 probes covering boot+mount, CK regime, synthesized regime, embed-mode skip, accessibility tree, cross-shadow event propagation, and console-clean during a sustained tick).

## Discoverability check (per skill `on_complete` hook)

All 27 new tests run in the default suite. Verified:

- `web/tests/v-attitude-indicator-qa-gaps.test.ts` — discovered by `cd web && npx vitest run` (default Vitest glob picks up `*.test.ts` under both `src/` and `tests/`; no special markers; no `.skip`; no `it.skip` / `describe.skip`).
- The `@vitest-environment happy-dom` directive at the top of the file matches the pattern in `web/tests/attitude-applier-qa-gaps.test.ts`, `web/tests/boresight-renderer-qa-gaps.test.ts`, and other QA-gap test files.
- No tags (`@slow`, `@flaky`, etc.) that would exclude from default run.

Confirmation runs (from this QA session):
- `cd web && npx vitest run tests/v-attitude-indicator-qa-gaps.test.ts` → **1 file, 27 tests passed** in 2.53s.
- `cd web && npm test -- --run` → **127 test files, 2322 tests passed, 1 skipped** in 43.18s (+27 net new from 2295 baseline). 0 failures.
- `cd web && npx tsc --noEmit` → clean (typecheck preserved).
- `cd web && npx eslint tests/v-attitude-indicator-qa-gaps.test.ts` → clean (no new lint warnings).

## Voyager skill-rules compliance summary

- **Rule 1 (Integration ACs):** Verified — AC8 IS the integration AC for Story 3.6 (indicator ↔ AttitudeService via `<v-hud>` parent). Dev's `v-attitude-indicator-integration.test.ts` honours it; QA gap 7 reinforces by pinning the upstream main.ts wire-up that the integration test stubs out.
- **Rule 3 (per-story smoke):** **APPLIED** — Story 3.6 touches `web/src/` extensively (new component + HUD render + main.ts wire-up). MCP smoke plan authored above; lead executes per Rule 7.
- **Rule 4 (structured completion):** Closing summary at the bottom of this QA agent's return message.
- **Rule 5 (NFR tripwire response):** Not triggered by QA work. Dev surfaced no tripwires.
- **Rule 6 (ADR violations are HIGH):** No ADR violations introduced. The component honours ADR-0013 (Lit 3, no decorators — uses `static properties` + `declare` + constructor init), ADR-0015 (constructor-DI from `<v-hud>`; no global), ADR-0025 (`<output>` element with aria-label + aria-live=polite per WAI-ARIA live region pattern; no slider/listbox so Rule 9 N/A), and ADR-0026 (TS strict, zero `any` outside stub seams). QA gap 5 reinforces the no-background-fill discipline (the HUD canvas-and-edges model).
- **Rule 7 (sub-agent tool inventory is harness-inherited):** Honoured — MCP probes are placed on the lead (Layer 1 of ADR-0010), not in this QA agent's execution. Probe plan is fully scripted so the lead can execute without re-deriving.
- **Rule 8 (Chrome DevTools MCP is the canonical browser-smoke driver):** Honoured — no initScript shim referenced. Post-Story-1.16 brotli-dec-wasm handles the browser brotli path.
- **Rule 9 (ADR-0025 APG primitives are extracted):** Not applicable — Story 3.6 introduces no APG-keyboard-handling components (the indicator has no interactive controls).

## Notes for the lead

- **Dev self-caught a load-bearing Lit class-field-shadowing defect.** The initial implementation initialized `provenance = undefined`, `activeSpacecraftId = -31`, and `attitudeService = null` as class fields. Class-field initializers shadow Lit's `static properties`-generated accessors and break reactivity. Dev fixed by switching to `declare` + constructor initialization (mirrors `v-chapter-index.ts`). QA gap 5 source-greps the authored CSS but does NOT directly grep for `declare` vs `=` initializers — that contract is enforced at runtime by the dev's existing 25 unit tests (which would fail loudly if shadowing were reintroduced). Probe 7's console-clean assertion is the runtime backstop.
- **Probe 5 (accessibility snapshot) is the load-bearing pre-binding for the axe-core gate.** Story 6.4 will run axe-core against the full HUD subtree; this probe captures the snapshot dev tests can compare against. The snapshot file lives in the evidence directory so a future regression breaks visibility at code-review time.
- **Probe 6 (cross-shadow event) is the runtime substrate for Epic 4's ChapterDirector hook.** Epic 4 will register a `document.addEventListener('activeSpacecraftChanged', ...)` to flip the active spacecraft when a chapter transition crosses a viewframe boundary. If `composed: true` is silently dropped, that wiring breaks. QA gap 1 unit-tests this; probe 6 runtime-tests it.
- **Probe 4 (embed mode) verifies the chrome-vs-content split** that dev landed: the HUD shell stays mounted in embed mode (date/distance/speed/instruments are content), only the attitude indicator is the chrome that's skipped. This is a Story 2.5 pattern applied at the inner-component layer rather than the first-paint appendChild layer.

## Next Steps

- **Lead:** Execute the AC10 MCP smoke plan above against `http://127.0.0.1:5173/` (start dev server with `cd web && npm run dev`). Save evidence to `_bmad-output/implementation-artifacts/3-6-smoke-evidence/`. Hand off to code review (`bmad-code-review` skill) after smoke evidence is captured.
- **Code review (cr-3-6):** Cross-check each AC against ADR registry per Rule 6. Particular attention to: ADR-0013 (Lit 3, no decorators — verify `static properties = { ... }` + `declare` + constructor init pattern; verify no class-field-shadowing regression); ADR-0015 (no global store — verify AttitudeService is constructor-DI'd via the `<v-hud>` reactive-target property, not from any singleton); ADR-0025 (APG patterns — verify `<output>` + aria-label + aria-live=polite scaffolding); ADR-0026 (zero `any` casts in component source — particularly around the `attitudeService` declaration which is `AttitudeService | null`, not `any`).
- **Story 6.4 (downstream):** The axe-core gate Story 6.4 owns will validate the a11y scaffolding QA gap 8 pins. The probe 5 snapshot is the runtime substrate.
- **Epic 4 (downstream):** ChapterDirector will register `document.addEventListener('activeSpacecraftChanged', ...)` to flip the active spacecraft per chapter transition. The probe 6 runtime substrate verifies the binding shape is correct.

## Tests Added
- C:/git/Voyager/web/tests/v-attitude-indicator-qa-gaps.test.ts

## Decisions
- Targeted ten cross-cutting QA gaps (AC4 composed:true shadow-cross contract via document/window listener; AC5 multi-flip + sub-tick-zigzag re-render gating; late wire-up sustained pre-wire ticks + first-paint-after-wire; cross-spacecraft regime divergence at one ET with round-trip; HUD style defense extension + token cascade + regime-token references; embedEnabled reactive re-render after mount; main.ts source-grep for the AttitudeService→HUD assignment; AC6 a11y structural scaffolding pre-binding for the Story 6.4 axe-core gate; active-spacecraft setter literal-union round-trip; sustained-tick rate budget over a 5-second 60 Hz window) rather than re-testing dev's covered paths.
- The AC6 axe-core gate is deferred to Story 6.4 (per Story 2.5+ pattern); QA gap 8 pins the scaffolding axe-core will validate so the gate has unambiguous structure to check against.

## Issues Encountered
- The QA gap 2 sub-tick-zigzag test (`zigzag immediately around boundary`) uses a range assertion (`≥ 2 and ≤ 50`) rather than an exact count because the alternation pattern depends on the offset cycle and tick count — the load-bearing contract is "more than zero, less than per-tick", which the range pins without coupling to the exact alternation cadence.
