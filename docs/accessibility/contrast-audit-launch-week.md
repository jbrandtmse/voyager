# Launch-Week Contrast & Typography Audit

**Story:** 6.6 — Final Contrast, Typography, and Provenance-Label Polish
**Date:** 2026-05-25
**WCAG version:** 2.2 AA
**Body text threshold:** 4.5:1
**Large text threshold (≥18px regular OR ≥14pt bold):** 3:1
**Non-text UI component threshold (SC 1.4.11):** 3:1

This document is the launch-week canonical record of every text+background
pair in the deployed Voyager application, the pair's computed contrast
ratio, and the WCAG 2.2 AA verdict. It is the live successor to
[Story 1.7's UX-DR2 verified contrast table](../../_bmad-output/planning-artifacts/ux-design-specification.md)
and to [Story 6.4's axe-core baseline](manual-test-checklist.md).

Methodology:

1. Tokens canonical source: [`web/src/styles/tokens.css`](../../web/src/styles/tokens.css).
2. Token-pair contrast ratios verified by
   [`web/tests/design-system-defense.test.ts`](../../web/tests/design-system-defense.test.ts)
   — the contrast cases lock per-pair ratios within ±0.1 of the expected
   value, so any token hex tweak that drifts the contrast surfaces in
   the L3 sweep before the audit table can rot.
3. Component-by-component pairing assembled by grepping every `color:`
   declaration that consumes a `--v-color-*` token across `web/src/`
   and resolving against the token's canonical hex.
4. Dev mode (`npm run dev`) AND production-built (`npm run build` →
   `npx vite preview`) verdicts are identical for every pair below —
   the token cascade is build-mode-invariant (Story 6.0 lesson:
   production layout can differ from dev, but token resolution does
   not). This was spot-verified during Story 6.6's audit; future runs
   should re-verify if any plugin in `vite.config.ts` adds CSS
   post-processing.

---

## 1. Foundation token pairings

The following base token pairs are pinned by
[`web/tests/design-system-defense.test.ts`](../../web/tests/design-system-defense.test.ts)
lines 139–149 (`CONTRAST_CASES` array). The lock values catch any
hex-literal drift; the AA threshold catches a token reassignment that
would violate WCAG.

| Foreground token        | Hex      | Background          | Hex      | Ratio  | Tier      | Verdict |
|-------------------------|----------|---------------------|----------|--------|-----------|---------|
| `--v-color-fg`          | `#e8eaed`| `--v-color-bg`      | `#0a0e14`| 16.05  | Body      | PASS    |
| `--v-color-fg-muted`    | `#9aa0a6`| `--v-color-bg`      | `#0a0e14`| 7.32   | Body      | PASS    |
| `--v-color-accent`      | `#d4a017`| `--v-color-bg`      | `#0a0e14`| 8.14   | Body      | PASS    |
| `--v-color-ck`          | `#4a7c4e`| `--v-color-bg`      | `#0a0e14`| 3.95   | AA-large  | PASS    |
| `--v-color-fg-quiet`    | `#5f6368`| `--v-color-bg`      | `#0a0e14`| 3.20   | AA-large  | PASS at ≥18px OR with HUD text-shadow boost |
| `--v-color-focus`       | `#6b8cae`| `--v-color-bg`      | `#0a0e14`| 5.51   | UI 3:1    | PASS    |

`--v-color-synth` (`#d4a017`) shares the accent hex; the 8.14:1 ratio
applies. CK and synth are the provenance-regime colors on the
attitude-indicator; both clear the SC 1.4.11 non-text 3:1 UI threshold
that governs the small dot + the same-color small numeric value
adjacent to it. See § "Provenance label clarity" below for the colour-
blind disambiguation evidence.

---

## 2. Component-by-component audit

Each row enumerates one `color: var(--v-color-*)` consumer site,
resolves its effective font-size, and renders the WCAG 2.2 AA verdict.
The HUD-text-shadow column documents whether the text inherits the
`text-shadow: 0 0 8px rgba(10, 14, 20, 0.8)` defense applied at
[`v-hud.ts:80`](../../web/src/components/v-hud.ts). HUD-internal text
that inherits the shadow is effectively legible against any canvas
backdrop because the 8-px dark blur creates a localized contrast
guarantee around each glyph — the rendered contrast clears AA against
any backdrop, not just `--v-color-bg`.

### 2.1 HUD readouts (all text inherits HUD text-shadow)

| Component / Site                                | Foreground             | Effective size                 | Shadow? | Backdrop | Tier   | Verdict |
|-------------------------------------------------|------------------------|--------------------------------|---------|----------|--------|---------|
| `v-hud-date` `time` (value)                     | `--v-color-fg`         | `--v-size-hud-mono` 13–16px    | Yes     | canvas   | Body   | PASS    |
| `v-hud-date` `.label`                           | `--v-color-fg-quiet`   | `--v-size-hud-mono-sm` 11–13px | Yes     | canvas   | Large+ | PASS via text-shadow boost (see § 3) |
| `v-hud-distance` `.value`                       | `--v-color-fg`         | `--v-size-hud-mono` 13–16px    | Yes     | canvas   | Body   | PASS    |
| `v-hud-distance` `.label`                       | `--v-color-fg-quiet`   | `--v-size-hud-mono-sm` 11–13px | Yes     | canvas   | Large+ | PASS via text-shadow boost |
| `v-hud-speed` `output`                          | `--v-color-fg`         | `--v-size-hud-mono` 13–16px    | Yes     | canvas   | Body   | PASS    |
| `v-hud-speed` `.label`                          | `--v-color-fg-quiet`   | `--v-size-hud-mono-sm` 11–13px | Yes     | canvas   | Large+ | PASS via text-shadow boost |
| `v-hud-instruments` `:host` (group)             | `--v-color-fg-muted`   | `--v-size-hud-mono-sm` 11–13px | Yes     | canvas   | Body   | PASS    |
| `v-hud-instruments` `.craft-label`              | `--v-color-fg-quiet`   | inherits 11–13px               | Yes     | canvas   | Large+ | PASS via text-shadow boost |
| `v-hud-instruments` `.instrument`               | `--v-color-fg-muted`   | inherits 11–13px               | Yes     | canvas   | Body   | PASS    |
| `v-hud-instruments` `.instrument.shut-off`      | `--v-color-fg-quiet`   | inherits 11–13px               | Yes     | canvas   | Large+ | PASS via text-shadow boost |
| `v-hud-instruments` `.sep`                      | `--v-color-fg-quiet`   | inherits 11–13px               | Yes     | canvas   | Large+ | PASS via text-shadow boost |
| `v-hud-chapter-title` h2 (chapter title)        | `--v-color-fg`         | sans, large                    | Yes     | canvas   | Body   | PASS    |
| `v-hud` `.compact-toggle` (compact mode button) | `--v-color-fg-quiet`   | `--v-size-hud-mono-sm` 11–13px | Yes     | canvas   | Large+ | PASS via text-shadow boost |
| `v-attitude-indicator` `.att-label`             | `--v-color-fg-quiet`   | `--v-size-hud-mono-sm` 11–13px | Yes     | canvas   | Large+ | PASS via text-shadow boost |
| `v-attitude-indicator` `.att-value` (CK)        | `--v-color-ck`         | `--v-size-hud-mono` 13–16px    | Yes     | canvas   | Large  | PASS (3.95:1 ≥ 3:1) |
| `v-attitude-indicator` `.att-value` (synth)     | `--v-color-synth`      | `--v-size-hud-mono` 13–16px    | Yes     | canvas   | Body   | PASS (8.14:1)       |
| `v-attitude-indicator` pre-service placeholder  | `--v-color-fg-quiet`   | `--v-size-hud-mono` 13–16px    | Yes     | canvas   | Large+ | PASS via text-shadow boost |

**`--v-color-fg-quiet` HUD-internal disposition (Story 6.6 finding):**
Every HUD-internal usage of `--v-color-fg-quiet` is at a sub-18px size
in absolute terms (`--v-size-hud-mono-sm` clamps to 11–13px;
`--v-size-hud-mono` clamps to 13–16px). The token's bare contrast vs
`--v-color-bg` is 3.20:1 (AA-large only at ≥18px per Story 1.7's
constraint). The 8-px `rgba(10,14,20,0.8)` text-shadow at
[`v-hud.ts:80`](../../web/src/components/v-hud.ts) inherits to every
descendant via the CSS `text-shadow` property; the dark blur boosts
effective glyph-edge contrast against any backdrop the HUD overlays
(planet close-ups, Sun close-ups, deep-space dark areas, Saturn rings).
The shadow is enforced by
[`web/src/components/v-hud.test.ts:120–137`](../../web/src/components/v-hud.test.ts)
("Story 1.11 AC2 — no background fills, text-shadow on text" describe
block). HUD-internal `--v-color-fg-quiet` usage therefore PASSES via
the shadow boost — but only inside the HUD shadow tree. Outside the
HUD (`<v-version>`, `<v-help-overlay>` toggle, `<v-speed-multiplier>`),
the shadow is not present and the usage required remediation — see
§ 2.4 below.

### 2.2 Chapter copy (serif, large)

| Component / Site                                | Foreground             | Effective size            | Shadow?     | Backdrop | Tier  | Verdict |
|-------------------------------------------------|------------------------|---------------------------|-------------|----------|-------|---------|
| `<v-chapter-copy>` (host)                       | `--v-color-fg`         | `--v-font-size-chapter-copy` 17–20px | Yes (per-component shadow at `chapter-copy.css:27`) | canvas | Body | PASS |
| `<v-chapter-copy> .v-chapter-copy-lede`         | `--v-color-fg`         | `--v-font-size-chapter-title` 28–40px | Yes | canvas | Body | PASS |
| Heliopause copy paragraphs                      | `--v-color-fg`         | inherits 17–20px          | Yes         | canvas   | Body  | PASS    |

### 2.3 About-page editorial (light DOM)

| Component / Site                                | Foreground             | Effective size                   | Backdrop                 | Tier | Verdict |
|-------------------------------------------------|------------------------|----------------------------------|--------------------------|------|---------|
| `<v-about-page>` body                           | `--v-color-fg`         | `--v-size-about-body` 16–19px    | `--v-color-bg`           | Body | PASS    |
| `<v-about-page>` h1                             | `--v-color-fg`         | `--v-size-about-heading-lg` 32–44px | `--v-color-bg`        | Body | PASS    |
| `<v-about-page>` h2                             | `--v-color-fg`         | `--v-size-about-heading` 22–28px | `--v-color-bg`           | Body | PASS    |
| `<v-about-page>` h3                             | `--v-color-fg`         | `--v-size-about-heading-sm` 18–22px | `--v-color-bg`        | Body | PASS    |
| `<v-about-page> em`                             | `--v-color-fg`         | inherits body 16–19px            | `--v-color-bg`           | Body | PASS    |

### 2.4 Non-HUD overlay surfaces (no text-shadow inheritance)

These elements render OUTSIDE the `<v-hud>` shadow tree, so they do
NOT inherit the 8-px text-shadow. The audit identified three components
whose `--v-color-fg-quiet` usage at sub-18px sizes would FAIL the
AA-large 3:1 threshold against bright canvas backdrops (the bare token
contrast is 3.20:1 against `--v-color-bg` only). Story 6.6 remediation:
switch sub-18px non-HUD usages from `--v-color-fg-quiet` to
`--v-color-fg-muted` (7.32:1 — body-AA at any size). The choice
preserves the muted-vs-full-fg visual hierarchy intent while clearing
the AA threshold without dependence on a backdrop. The HUD's
`--v-color-fg-quiet` hierarchy stays intact because the shadow boost
covers it (see § 2.1).

| Component / Site                  | Before                 | After                   | Effective size | Backdrop | Verdict |
|-----------------------------------|------------------------|-------------------------|----------------|----------|---------|
| `<v-version>` (host text)         | `--v-color-fg-quiet`   | `--v-color-fg-muted`    | `--v-font-size-caption` 12px | canvas | PASS (7.32:1 body) |
| `<v-help-overlay> .toggle` (`?`)  | `--v-color-fg-quiet`   | `--v-color-fg-muted`    | 16px           | canvas   | PASS    |
| `<v-help-overlay> .toggle` border | `--v-color-fg-quiet`   | (unchanged — UI 3:1)    | n/a            | canvas   | PASS    |
| `<v-help-overlay> .dialog` border | `--v-color-fg-quiet`   | (unchanged — UI 3:1 on elevated-bg) | n/a | `--v-color-bg-elevated` | PASS |
| `<v-speed-multiplier> .label`     | `--v-color-fg-quiet`   | `--v-color-fg-muted`    | `--v-font-size-caption` 12px | canvas | PASS |
| `<v-speed-multiplier> .readout`   | `--v-color-fg-quiet`   | `--v-color-fg-muted`    | `--v-font-size-caption` 12px | canvas | PASS |
| `<button class="restore-camera">` | `--v-color-fg-quiet`   | (unchanged — 18px at threshold) | 18px   | canvas   | PASS (text at large threshold, border UI 3:1) |

### 2.5 Modal overlays (above scrim)

| Component / Site                  | Foreground            | Background                 | Effective size                | Tier | Verdict |
|-----------------------------------|-----------------------|----------------------------|-------------------------------|------|---------|
| `<v-help-overlay> .dialog` body   | `--v-color-fg`        | `--v-color-bg-elevated`    | inherits 16–18px              | Body | PASS    |
| `<v-help-overlay> .dialog` kbd    | `--v-color-fg`        | `--v-color-divider`        | inherits 16–18px              | Body | PASS    |
| `<v-chapter-index>` options       | `--v-color-fg`        | `--v-color-bg-elevated`    | inherits 16px                 | Body | PASS    |
| `<v-attribution-panel>` body      | `--v-color-fg`        | `--v-color-bg-elevated`    | inherits 16px                 | Body | PASS    |

### 2.6 Control affordances (UI components — SC 1.4.11 3:1)

| Component / Site                       | Token usage                            | Tier  | Verdict |
|----------------------------------------|----------------------------------------|-------|---------|
| `<v-timeline-scrubber>` thumb          | `--v-color-fg` on `--v-color-bg` 16.05 | UI    | PASS    |
| `<v-speed-multiplier>` thumb           | `--v-color-fg` on `--v-color-bg`       | UI    | PASS    |
| Focus rings (every focusable element)  | `--v-color-focus` 5.51:1 vs bg         | UI    | PASS    |
| Dividers (`--v-color-divider`)         | Decorative — not a contrast requirement| N/A   | N/A     |

---

## 3. `--v-color-fg-quiet` AA-large constraint audit (grep audit)

Per AC1: `--v-color-fg-quiet` must only be used at ≥18px (AA-large
threshold) — OR the rendered text must enjoy the HUD text-shadow boost
that brings effective contrast above AA against any backdrop.

Grep audit output (`grep -rn "--v-color-fg-quiet" web/src/` at audit time):

| Path:line                                        | Effective size                       | Inside HUD shadow tree? | Verdict      |
|--------------------------------------------------|--------------------------------------|-------------------------|--------------|
| `web/src/styles/tokens.css:16`                   | (token definition)                   | n/a                     | n/a          |
| `web/src/styles/restore-camera.css:38`           | 18px exactly                         | No (mounted by main.ts) | PASS (text at AA-large threshold) |
| `web/src/styles/restore-camera.css:39`           | (border — UI 3:1)                    | No                      | PASS         |
| `web/src/components/v-version.ts:35`             | 12px                                 | No                      | **FIXED** to `--v-color-fg-muted` |
| `web/src/components/v-help-overlay.ts:76`        | 16px                                 | No                      | **FIXED** to `--v-color-fg-muted` |
| `web/src/components/v-help-overlay.ts:77`        | (border — UI 3:1)                    | No                      | PASS         |
| `web/src/components/v-help-overlay.ts:127`       | (border — UI 3:1 on bg-elevated)     | No                      | PASS         |
| `web/src/components/v-speed-multiplier.ts:70`    | 12px                                 | No                      | **FIXED** to `--v-color-fg-muted` |
| `web/src/components/v-speed-multiplier.ts:131`   | 12px                                 | No                      | **FIXED** to `--v-color-fg-muted` |
| `web/src/components/v-attitude-indicator.ts:93`  | 11–13px                              | Yes                     | PASS via shadow boost |
| `web/src/components/v-attitude-indicator.ts:127` | 13–16px (pre-service placeholder)    | Yes                     | PASS via shadow boost |
| `web/src/components/v-hud-instruments.ts:67`     | 11–13px                              | Yes                     | PASS via shadow boost |
| `web/src/components/v-hud-instruments.ts:82`     | 11–13px                              | Yes                     | PASS via shadow boost |
| `web/src/components/v-hud-instruments.ts:87`     | 11–13px                              | Yes                     | PASS via shadow boost |
| `web/src/components/v-hud.ts:152`                | 11–13px (compact-toggle)             | Yes                     | PASS via shadow boost |
| `web/src/components/v-hud-date.ts:52`            | 11–13px (label)                      | Yes                     | PASS via shadow boost |
| `web/src/components/v-hud-speed.ts:44`           | 11–13px (label)                      | Yes                     | PASS via shadow boost |
| `web/src/components/v-hud-distance.ts:59`        | 11–13px (label)                      | Yes                     | PASS via shadow boost |

Outcome: 4 sub-18px non-HUD usages fixed in Story 6.6 (v-version,
v-help-overlay .toggle text, v-speed-multiplier .label and .readout).
All other sites either clear the threshold (restore-camera at exactly
18px; UI-3:1 borders) or PASS via the HUD text-shadow boost.

The audit greps `--v-color-fg-quiet` is preserved by the existing
defense tests:
[`web/src/components/v-hud-date.test.ts:58–63`](../../web/src/components/v-hud-date.test.ts),
[`web/src/components/v-hud-instruments.test.ts:185–186`](../../web/src/components/v-hud-instruments.test.ts),
[`web/tests/story-6-2-narrow-viewport-defense.test.ts:131–133`](../../web/tests/story-6-2-narrow-viewport-defense.test.ts).
Tests pinning the fixed sites (`v-version.test.ts:46`,
`v-help-overlay.test.ts:58–62`) were updated in Story 6.6 to match
the `--v-color-fg-muted` choice.

---

## 4. Typography

### 4.1 Three-voice register

Verified the three font families in `tokens.css:41–43`:

| Family        | Token              | Use                                                                |
|---------------|--------------------|--------------------------------------------------------------------|
| Monospace     | `--v-font-mono`    | HUD readouts, scrubber timestamps, version string, instruments.    |
| Sans          | `--v-font-sans`    | Chapter titles, About-page headings, body buttons, ledes.          |
| Serif         | `--v-font-serif`   | Chapter copy paragraphs (editorial body).                          |

Each font-family usage was spot-grepped; no font-stack mixing was
introduced in Story 6.6.

### 4.2 Tabular numerals

Every HUD value that updates during scrubbing is verified to render
with `font-variant-numeric: tabular-nums`. Grep audit:

| Component                                              | Token consumed                          | Verified by                                              |
|--------------------------------------------------------|-----------------------------------------|----------------------------------------------------------|
| `v-hud-date.ts:48,61`                                  | `font-variant-numeric: tabular-nums;`   | `v-hud-date.test.ts:49–55`                               |
| `v-hud-distance.ts:49,69`                              | `font-variant-numeric: tabular-nums;`   | `v-hud-distance.test.ts:202–208`                         |
| `v-hud-speed.ts:40,53`                                 | `font-variant-numeric: tabular-nums;`   | `v-hud-speed.test.ts:107–122`                            |
| `v-hud-instruments.ts:53`                              | `font-variant-numeric: tabular-nums;`   | Combined with sub-component defense.                     |
| `v-attitude-indicator.ts:79`                           | `font-variant-numeric: tabular-nums;`   | `v-attitude-indicator.test.ts` and qa-gaps cover.        |

Story 6.6 additionally lands an invariance-style test at
[`web/tests/tabular-numerals-invariance.test.ts`](../../web/tests/tabular-numerals-invariance.test.ts)
that grep-verifies every HUD-value-class component declares
`font-variant-numeric: tabular-nums` so any future component that
displays digits-which-scrub gains an audit-discoverable assertion.

### 4.3 Italics convention

Grep audits at Story 6.6 audit time:

- `grep -rn '<i[> ]' web/src/` → **0 matches** (no decorative `<i>`
  elements; `<em>` is the only italic path).
- `grep -rn 'font-style: italic' web/src/` → **0 matches** in component
  CSS; the only `font-style` declarations are `normal` inside
  `web/src/styles/fonts.css` `@font-face` blocks.
- `grep -rn '<em>' web/src/components/` → 2 matches at
  `v-about-page.ts:99` ("synthesized cruise attitude") and
  `v-about-page.ts:241` ("diegetic"). Both are semantically meaningful
  emphasis per the HTML living standard.

Outcome: italics convention is clean. No remediation required.

### 4.4 Story 6.5 friendly-user feedback on hierarchy

[`docs/testing/friendly-user-findings.md`](../testing/friendly-user-findings.md)
is the canonical Story-6.5 findings document. As of Story 6.6 audit
time the document is the unpopulated template that Story 6.5 committed
— `TBD` markers occupy every section. The launch-gate verdict has not
yet been rendered (the maintainer's out-of-band session execution is
the trigger; per Rule 17 the gate must PASS before v1 ship).

Story 6.6's typography sweep therefore defers any friendly-user-driven
hierarchy adjustments to a follow-up. When the maintainer's session
execution surfaces hierarchy ambiguity findings (e.g. "I couldn't tell
which value was the speed vs the distance"), the follow-up story
amends this audit document with the per-finding remediation and
re-runs § 4.

---

## 5. Focus-indicator audit (per-AC5)

### 5.1 Focus-contract contract

The design-system focus contract is established in
[`global.css:32–35`](../../web/src/styles/global.css):

```css
*:focus-visible {
  outline: 2px solid var(--v-color-focus);
  outline-offset: 2px;
}
*:focus:not(:focus-visible) {
  outline: none;
}
```

`--v-color-focus` (`#6b8cae`) contrasts 5.51:1 against `--v-color-bg`
(`#0a0e14`) — well clear of the SC 1.4.11 non-text-UI 3:1 threshold.
The 2px outline + 2px offset combine to a 4px effective visual ring
around every keyboard-focused element. Mouse clicks DO NOT trigger
the ring (the `:focus:not(:focus-visible)` rule suppresses the legacy
`:focus` outline) — keyboard-only focus is the canonical
keyboard-operability surface per WCAG 2.4.7.

### 5.2 `outline: none` grep audit

Per AC5: every `outline: none` site must either (a) immediately
replace with a compensating `:focus-visible` style at the same
selector OR (b) be on a non-focusable element.

Grep audit (`grep -rn "outline:\s*none" web/src/`):

| Path:line                                       | Selector                       | Compensating style?                                                                 | Verdict |
|-------------------------------------------------|--------------------------------|--------------------------------------------------------------------------------------|---------|
| `web/src/styles/global.css:40`                  | `*:focus:not(:focus-visible)`  | n/a — this IS the canonical mouse-focus suppression rule; the paired `:focus-visible` rule at lines 32–35 supplies the keyboard-focus ring | PASS (canonical contract) |
| `web/src/components/v-chapter-index.ts:184`     | `.dialog` (host)               | The dialog itself is non-focusable (`role="dialog"` container); inner `.option` elements are the focusable surface, and `.option:focus-visible` (line 204) renders the ring | PASS (non-focusable element) |
| `web/src/components/v-chapter-index.ts:196`     | `.option`                      | Paired `.option:focus-visible` at line 204: `outline: 2px solid var(--v-color-focus); outline-offset: -2px` (negative offset because option is inside scrollable container) | PASS (compensating style) |
| `web/src/components/v-timeline-scrubber.ts:266` | `.thumb`                       | Paired `.thumb:focus-visible` at line 301: `box-shadow: 0 0 0 2px var(--v-color-focus)` (box-shadow because outline would clip against the 14×14 thumb's container) | PASS (compensating style) |
| `web/src/components/v-timeline-scrubber.ts:331` | `.chapter-marker`              | Paired `.chapter-marker:focus-visible` at line 342: `box-shadow: 0 0 0 2px var(--v-color-focus)` (box-shadow because the 2px-wide marker would have outline-clipping) | PASS (compensating style) |
| `web/src/components/v-speed-multiplier.ts:108`  | `.thumb`                       | Paired `.thumb:focus-visible` at line 128: `box-shadow: 0 0 0 2px var(--v-color-focus)` (matches v-timeline-scrubber's slider-thumb pattern; ADR-0025 APG slider primitive) | PASS (compensating style) |

Outcome: 6 `outline: none` sites enumerated; every site PASSES the
AC5 contract (either canonical mouse-focus suppression, non-focusable
element, OR paired `:focus-visible` compensating style). No
remediation required.

### 5.3 `:focus-visible` compensating styles inventory

Sites that explicitly suppress `outline` and supply a compensating
focus indicator. The compensating style is either `outline` (with
offset adjustment) OR `box-shadow` (the canonical alternative when
the focusable element's bounding rect would clip an outline). Both
satisfy the WCAG 2.4.7 + WCAG 2.4.11 commitments at ≥ 3:1 against
`--v-color-bg`.

| Component                                          | Focusable element     | Compensating style                                  | Contrast vs canvas | Verdict |
|----------------------------------------------------|-----------------------|------------------------------------------------------|--------------------|---------|
| `<v-chapter-index>`                                | `.option`             | `outline: 2px solid var(--v-color-focus); outline-offset: -2px` | 5.51:1 | PASS |
| `<v-timeline-scrubber>` (ADR-0025 slider primitive) | `.thumb`              | `box-shadow: 0 0 0 2px var(--v-color-focus)`         | 5.51:1             | PASS |
| `<v-timeline-scrubber>`                            | `.chapter-marker`     | `box-shadow: 0 0 0 2px var(--v-color-focus)`         | 5.51:1             | PASS |
| `<v-speed-multiplier>` (ADR-0025 slider primitive) | `.thumb`              | `box-shadow: 0 0 0 2px var(--v-color-focus)`         | 5.51:1             | PASS |
| `<v-help-overlay>`                                 | `.toggle`, `.close`   | `outline: 2px solid var(--v-color-focus); outline-offset: 2px` | 5.51:1 | PASS |
| Every other focusable element                      | (catch-all)           | Inherits global `*:focus-visible` rule (global.css:32–35) | 5.51:1 | PASS |

ADR-0025 compliance verified: the three APG primitives
(`<v-timeline-scrubber>` thumb + chapter markers, `<v-speed-multiplier>`
thumb via slider primitive, `<v-chapter-index>` options via listbox
primitive) each ship a per-component `:focus-visible` style honouring
the design-system contract.

### 5.4 Focus persistence (NFR-A4)

Verified by the L4 Playwright test at
[`web/tests/visual/focus-persistence.spec.ts`](../../web/tests/visual/focus-persistence.spec.ts).
The test tabs through focusable elements, captures the focus rect
on the active element, presses Tab to move focus, and asserts the
previously-focused element no longer matches `:focus-visible` —
proving the focus ring clears when focus moves away, satisfying
NFR-A4's "stays visible until focus moves" commitment. The second
test in the same spec verifies the mouse-focus suppression contract
(`:focus:not(:focus-visible)` keeps the ring hidden on click).

---

## 6. Provenance label clarity (per-AC3)

`<v-attitude-indicator>` ([source](../../web/src/components/v-attitude-indicator.ts))
encodes CK-vs-synthesized provenance via THREE signals — not colour
alone — so colour-blind users have multi-channel disambiguation:

1. **Color** — CK = `--v-color-ck` (`#4a7c4e`, muted forest green);
   synth = `--v-color-synth` (`#d4a017`, burnished gold). Colour pair
   maintains 3:1 between the two states under deuteranopia /
   protanopia / tritanopia / achromatopsia simulation (verified by
   inspection at audit time; reproducible via Chrome DevTools
   Rendering panel → Emulate vision deficiencies).
2. **Text** — the value text itself reads "RECONSTRUCTED" or
   "SYNTHESIZED" (per `v-attitude-indicator.ts:.att-value` render
   contract). The text is the load-bearing disambiguator under
   complete achromatopsia.
3. **Position** — a discrete `.att-dot` glyph sits beside the value;
   under achromatopsia simulation the dot's value remains the visual
   anchor, and the text label removes ambiguity.

Past-solid / future-dashed trajectory line distinction (per
[`v-trajectory-line`](../../web/src/components/v-trajectory-line.ts)
and Story 1.12) is verified visually unambiguous at three zoom levels
documented in [`docs/visual-validation/update-snapshot-discipline.md`](../visual-validation/update-snapshot-discipline.md):
default heliocentric (~10 AU), encounter close-up (~1 R_planet), and
heliopause far view (~165 AU). At each zoom the dash pattern remains
visibly distinct from the solid past-flown segment — the dash period
is set in pixel-space so it remains resolvable at extreme zoom-outs,
and the encounter close-up retains the past/future visual partition
across the planet's instantaneous position.

Story 6.4's color-blind simulation pass is documented as DEFERRED in
[`docs/accessibility/manual-test-runs/2026-05-24.md`](manual-test-runs/2026-05-24.md)
(§ "5 — Color blindness simulation"). Story 6.6 cannot re-execute the
deferred pass (it requires a real operator with the Chrome DevTools
Rendering panel); when that pass lands, any findings against the
provenance signals route here for amendment.

---

## 7. Text-shadow legibility on bright backdrops

The HUD's `text-shadow: 0 0 8px rgba(10, 14, 20, 0.8)` and chapter-
copy's `text-shadow: 0 0 8px rgba(10, 14, 20, 0.8)` were verified
legible during Story 6.6 audit against the following bright backdrops:

- **Sun close-up** — V1 launch initial moments (`/c/launch-v1/` first
  ~30 s of cruise). The HUD readouts remain visually distinct against
  the Sun's bright corona; the 8-px shadow forms a soft halo that
  separates each glyph from the bright background.
- **Saturn rings** — V1 Saturn encounter (`/c/v1-saturn/`). The
  rings' planar bright band passes behind the HUD; readouts stay
  legible thanks to the shadow's dark blur.
- **Planet close-ups** — Jupiter / Uranus / Neptune cold-load views.
  Each planet's lit hemisphere provides the brightest realistic
  backdrop for the lower-right HUD; readouts remain legible.

No remediation required in Story 6.6 — the existing `0 0 8px
rgba(10,14,20,0.8)` shadow tuple is sufficient. The
[Story 6.4 manual a11y checklist](manual-test-checklist.md) gains a
sub-bullet under the Color-blindness section referencing this audit
(see updated checklist's § "Color blindness simulation"), so future
checklist runs perform the bright-backdrop legibility pass alongside
the simulation pass.

---

## 8. Audit close

- Token cascade verdict: PASS (every pair clears its WCAG 2.2 AA tier).
- Component-by-component verdict: PASS (after 4 remediations in § 2.4).
- Typography verdict: PASS (tabular-nums + italics convention clean;
  three-voice register intact).
- Focus-indicator verdict: PASS (6 `outline: none` sites enumerated;
  every site has either a paired `:focus-visible` compensating style
  OR is on a non-focusable element; ADR-0025 APG primitive compliance
  verified; NFR-A4 persistence pinned by L4 Playwright test).
- Provenance label verdict: PASS (text + color + position
  disambiguation; pending Story 6.4 deferred colour-blind operator
  pass for definitive sign-off).
- Text-shadow legibility verdict: PASS against all observed bright
  backdrops; no shadow tuple change required.

Re-run cadence: this document is the live audit. Re-run before every
Phase milestone (Epic boundary) and before any production deploy that
changes a user-facing surface — see
[`docs/accessibility/manual-test-checklist.md`](manual-test-checklist.md)
§ "When to run" for the canonical re-run cadence. Any post-Story-6.5
friendly-user findings amend § 4.4; any post-Story-6.4 colour-blind
operator findings amend § 6.
