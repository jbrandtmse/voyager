# ADR 0013 — Lit 3+ Web Components over React / Preact / Svelte

Status: Accepted
Date: 2026-05-18
Deciders: Voyager project maintainer

## Status

Accepted. UI components are Lit 3+ Web Components, named with the `<v-*>` prefix. React, Preact, Svelte, and all React-coupled UI ecosystems are rejected.

## Context

The Voyager simulator's UI surface is small (~8–10 components: HUD subcomponents, scrubber, chapter index, play/pause, speed slider, audio toggle, help overlay, fallback page, about page, attribution panel). The dominant rendering surface is the Three.js canvas; HUD/UI is overlaid via regular DOM. 60-FPS data (date counter, distance readout) bypasses framework reactivity entirely and updates DOM directly.

The framework choice affects: bundle size (NFR-P4), accessibility primitives availability (NFR-A1–A8), Web Component standards alignment, and the maintenance horizon (NFR-M6 hands-off).

[Source: _bmad-output/planning-artifacts/ux-design-specification.md#Implementation-Approach]
[Source: _bmad-output/planning-artifacts/ux-design-specification.md#Design-System-Components]
[Source: _bmad-output/planning-artifacts/architecture.md#Decision-5]

## Decision

**UI framework: Lit 3+ (~6 KB gzipped).**

- Custom Elements + Shadow DOM where encapsulation pays off; Light DOM where chapter-copy content must inherit global typographic styles.
- Components extend `LitElement`. Reactive properties via `@property` / `@state` decorators. Templates via the `html` tagged-template literal.
- Element-name convention: `<v-*>` kebab-case prefix (e.g., `<v-timeline-scrubber>`, `<v-hud-date>`).
- Class-name convention: `V*` PascalCase mirror (e.g., `VTimelineScrubber`, `VHudDate`).
- File-name convention: `web/src/ui/v-timeline-scrubber.ts` (kebab-case matches element name).

**Styling:** vanilla CSS + CSS custom properties as the design-token primitive. Scoped via Shadow DOM stylesheets per component. No Tailwind, no CSS-in-JS, no preprocessors beyond PostCSS for autoprefixing.

**Reactivity bridge to the service graph:** services expose `subscribe(callback)`; components subscribe via a `ServiceController<T>` (Lit Reactive Controller pattern). For 60-FPS HUD updates, bypass Lit reactivity entirely — register a per-frame callback with `RenderEngine.onFrame((et) => { this.dateEl.textContent = formatDate(et) })` and mutate DOM directly.

## Consequences

**Positive:**
- Tiny runtime cost (~6 KB) vs React (~40 KB) or Preact (~10 KB + DOM-diffing). Defends NFR-P4 first-paint budget.
- Web Components are a *standard*, not a framework. If Lit ever proves to add cost without pulling weight, the rewrite to plain `HTMLElement` is mechanical.
- Shadow DOM gives free style encapsulation — no naming collisions, no CSS-in-JS.
- Reactive decorators eliminate hand-written `render()` boilerplate across 10 components.
- Aligns with UX spec's framework analysis verbatim — no architecture-vs-UX-spec drift.

**Negative:**
- Lit is less well-known than React; ecosystem of third-party Lit components is smaller. Acceptable: we explicitly reject component libraries (per ADR 0025).
- Shadow DOM complicates global theming. Mitigated by CSS custom properties (which pierce shadow boundaries).
- AI agents may default to React patterns; the project's `<v-*>` naming + `LitElement` discipline must be enforced via lint rules and code review.

**Obligations on downstream stories:**
- Epic 6 / Epic 7 stories that author UI components extend `LitElement` and use the `<v-*>` naming.
- A `forbidden-frameworks` test (already present from Story 1.1) gates the lockfile against React/Preact/Svelte/Vue.
- Service-to-component reactivity uses the `ServiceController<T>` pattern; no global store, no signals library, no event bus.

## Alternatives Considered

- **React + Three.js (`react-three-fiber`).** Rejected: ~40 KB bundle tax for a UI surface dominated by canvas; r3f imposes React patterns on Three.js scene management which conflicts with our service-graph architecture (ADR 0015). The HUD/UI surface is small enough that React's component-tree wins don't apply.
- **Preact (~10 KB).** Rejected: still imports React's component model; doesn't give Web Components' standards-track durability; no meaningful win over Lit at our scale.
- **Svelte.** Rejected: Svelte's compile-time approach is brilliant but introduces a build step opaque to non-Svelte developers; doesn't produce Web Components by default (a `svelte:options customElement` opt-in exists but is partial); ecosystem smaller than Lit for Web-Component-first workflows.
- **Plain `HTMLElement` subclasses (no framework).** Rejected: would require hand-rolling property reflection, render scheduling, and template updates across 10 components. Lit gives this for 6 KB. If Lit ever costs more than it saves, this is the fallback.
- **Vue 3 with `defineCustomElement`.** Rejected: ~30 KB runtime; ecosystem geared toward .vue SFCs; less pure-Web-Component than Lit.
