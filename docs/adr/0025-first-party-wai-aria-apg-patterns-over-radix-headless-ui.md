# ADR 0025 — First-Party WAI-ARIA APG Patterns over Radix / Headless UI

Status: Accepted
Date: 2026-05-18
Deciders: Voyager project maintainer

## Status

Accepted. Accessibility primitives are hand-rolled following the W3C WAI-ARIA Authoring Practices Guide (APG) patterns. The framework-agnostic micro-libraries `focus-trap` (~3 KB) and `tabbable` (~2 KB) are the only third-party UI dependencies. Component libraries (Material, Ant, Chakra, MUI, Radix UI, Headless UI, Ariakit, shadcn/ui, Tailwind UI) and React-coupled a11y libraries (React Aria) are all rejected.

## Context

The UI surface is ~8–10 components: timeline scrubber, HUD + subcomponents, chapter index modal, chapter copy panel, play button, speed slider, audio toggle, help overlay, about page, attribution panel. WCAG 2.2 AA conformance is mandatory (NFR-A1); full keyboard reachability (NFR-A3); visible focus (NFR-A4); semantic markup (NFR-A7); screen-reader floor for non-canvas surfaces (NFR-A8).

Three sources of accessibility behavior exist in the 2026 ecosystem:

1. **React-coupled libraries** (Radix UI, React Aria, Headless UI, Ariakit). High-quality, but every one of them ships React as a peer dependency. The project rejects React (ADR 0013).
2. **Framework-agnostic libraries** (Reach UI is archived; few options remain). `focus-trap` and `tabbable` are the well-maintained survivors.
3. **W3C WAI-ARIA APG patterns** — free, framework-agnostic specifications for every common widget (slider, listbox, dialog, menu, tablist, etc.).

For a UI surface this small, implementing APG patterns directly is genuinely cheaper than picking a library and customizing it. The UX spec's analysis put implementation cost at ~3 days for the full a11y-primitive layer.

[Source: _bmad-output/planning-artifacts/ux-design-specification.md#Implementation-Approach]
[Source: _bmad-output/planning-artifacts/ux-design-specification.md#A11y-primitives]

## Decision

**First-party WAI-ARIA APG implementations** under `web/src/primitives/` for the patterns we use:

- `primitives/slider-keyboard.ts` — APG Slider pattern (for `<v-timeline-scrubber>` and `<v-speed-multiplier>`).
- `primitives/listbox-keyboard.ts` — APG Listbox pattern (for `<v-chapter-index>`).
- `primitives/dialog.ts` — APG Dialog (Modal) pattern (for `<v-help-overlay>` and `<v-about-page>` modal openings).

**Two third-party micro-libraries** (framework-agnostic, well-maintained):

- `focus-trap` (~3 KB) — modal focus containment.
- `tabbable` (~2 KB) — focusable-element enumeration.

**Total third-party UI surface: ≤5 KB.** Everything else (`role`, `aria-*`, focus management, keyboard handlers) is hand-rolled following APG patterns.

**No component library at all.** Material, Ant, Chakra, MUI, Radix UI, Headless UI, Ariakit, shadcn/ui, Tailwind UI are all rejected categorically.

## Consequences

**Positive:**
- Total runtime cost for the a11y layer is ≤5 KB.
- Zero framework lock-in beyond Lit (ADR 0013); the primitives are plain TypeScript modules consumable from any Web Component.
- AI agents and future-self read APG specs as the canonical reference, not library-specific documentation.
- WCAG 2.2 AA conformance is enforced behavior-by-behavior, not library-by-library; easier to argue in an a11y review.

**Negative:**
- Implementation requires care: each APG pattern has subtle keyboard handling (slider `Home`/`End`/`PageUp`/`PageDown`, listbox aria-activedescendant rules, dialog focus restoration). Mitigated by direct reading of the APG spec; tests assert the behaviors.
- New patterns (if a future story needs, say, a menubar) require fresh APG implementations rather than a library import. Acceptable: the component count is small and stable.

**Obligations on downstream stories:**
- Epic 6 / Epic 7 a11y-primitive stories implement each `primitives/*-keyboard.ts` per the corresponding APG pattern with test coverage of the keyboard contract.
- Components compose primitives via mixin or delegation — no APG keyboard logic embedded directly in component code.
- L3 Vitest unit tests assert the keyboard handlers' behavior per APG.
- L5 Playwright E2E tests assert screen-reader-relevant ARIA state for the listbox and dialog patterns.
- `focus-trap` and `tabbable` are added as `dependencies` in `web/package.json` when the first modal lands (Epic 6 / Story 6.x).

## Alternatives Considered

- **Radix UI Primitives.** Rejected: React-coupled (peer-dep on React DOM); doesn't compose with Lit Web Components.
- **React Aria (Adobe).** Rejected: React-coupled; same peer-dep issue. The underlying behaviors are studied carefully but reimplemented as framework-agnostic primitives.
- **Headless UI (Tailwind Labs).** Rejected: React- and Vue-coupled; no Web Components story.
- **Ariakit (formerly Reakit).** Rejected: React-coupled.
- **Reach UI.** Rejected: archived; abandoned upstream.
- **A custom thin abstraction over Radix.** Rejected: doesn't escape the React peer-dep; introduces a wrapper-around-wrapper.
- **No primitives layer; embed APG keyboard handlers inline in each component.** Rejected: duplicates handler code across components; harder to test in isolation; the primitives layer is small and pays for itself with two consumers.
