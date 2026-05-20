# ADR 0021 — Chapter Copy in TS Template Literals (Not External MD Files)

Status: Accepted
Date: 2026-05-18
Deciders: Voyager project maintainer

## Status

Accepted. Hand-written chapter prose lives in TypeScript backtick template literals inside each chapter spec module. External Markdown files for chapter copy are rejected.

## Context

Each of the 11 chapters has 1–3 paragraphs of editorial prose displayed by `<v-chapter-copy>` during the chapter's active window (FR23). Copy can include limited inline emphasis (italics, line breaks) but no images and no inline links (those go to the About page).

Two architectural shapes are possible:

1. **External `.md` files** loaded at runtime. Common in CMS-y projects; allows non-developers to edit content.
2. **Inline TypeScript template literals** in the chapter spec module (per ADR 0014). Type-checked, version-controlled with the chapter that consumes it, no runtime fetch.

The project has no CMS, no non-developer copy authors, and a strict no-runtime-fetch posture for first-party content (NFR-S9 forbids cross-origin runtime fetches; even same-origin fetches add a render-blocking step).

[Source: _bmad-output/planning-artifacts/architecture.md#Decision-4d]

## Decision

**Chapter copy lives in TypeScript backtick template literals inside each chapter spec file** at `web/src/chapters/<chapter-id>.ts`.

- The copy is the `copy` field of the `ChapterSpec` (ADR 0014).
- `<v-chapter-copy>` renders a small Markdown subset: italics (`*…*` or `_…_`) and line breaks. No images, no links, no headings.
- Type-checked: TypeScript ensures every chapter has a `copy` field; the build fails if missing.
- Version-controlled: chapter copy and chapter logic move together in the same commit and the same diff.

PBD copy lives inside `PaleBlueDotScene.ts` as part of the module (per the hybrid pattern in ADR 0014).

## Consequences

**Positive:**
- Single source of truth per chapter; copy and behavior are co-located.
- No runtime fetch: bundle includes the copy as static strings; first-paint includes the prose.
- Type-checking catches missing-copy bugs at build time.
- AI agents authoring or editing chapter content do so in the same file as the chapter logic — easier to maintain coherence.

**Negative:**
- Non-developer copy editing is impossible without a TypeScript edit. Acceptable: there are no non-developer copy authors on this project; the maintainer writes all prose.
- Multi-paragraph copy in template literals can get long. Mitigated: 1–3 short paragraphs per chapter is the spec; no chapter exceeds a screenful.
- Localization (if ever needed in v2+) would require revisiting; backticks aren't i18n-friendly. Accepted as a v1 constraint; revisit only if localization becomes a feature.

**Obligations on downstream stories:**
- Epic 5 / Epic 6 chapter authoring stories write copy directly in the chapter spec TS files.
- `<v-chapter-copy>` (Epic 6 / Story 6.x) implements the minimal Markdown subset (italics, line breaks) without invoking a Markdown parser library — a small hand-rolled renderer (<50 lines) is sufficient.

## Alternatives Considered

- **External `.md` files loaded at runtime.** Rejected: introduces a fetch (adds load latency, fail mode); decouples copy from logic; tempts CMS-style abstractions we don't need.
- **External `.md` files imported at build time via Vite's `?raw` query.** Rejected as a *replacement*: gains some of the type-safety back, but the build-time vs runtime ambiguity adds confusion; the inline template literal is dead-simple.
- **JSON-of-copy files (`chapters.json`).** Rejected: same downsides as external MD plus loses Markdown ergonomics; TypeScript template literals give better authoring experience.
- **A full Markdown renderer (`marked`, `markdown-it`).** Rejected: ~30–50 KB bundle weight for two features (italics, line breaks); the hand-rolled subset is ~50 LOC.
- **CMS (Contentful, Sanity).** Rejected categorically: violates NFR-Sc1 (no server), introduces a runtime dependency, adds cost; overkill for 11 chapters of static prose.
