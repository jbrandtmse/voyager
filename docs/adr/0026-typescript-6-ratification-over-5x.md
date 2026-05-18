# ADR 0026 — TypeScript 6.x Ratification over 5.x

Status: Accepted
Date: 2026-05-18
Deciders: Voyager project maintainer

## Status

Accepted. The project ratifies the TypeScript 6.x default shipped by `create-vite@9.0.7`'s `vanilla-ts` template. The architecture document's "TypeScript 5.x strict" wording (architecture.md line 38) requires a follow-on planning-artifact edit (out of scope for this story; flagged for the next planning-doc touch).

## Context

The architecture document (originally written 2026-05-17) referenced "TypeScript 5.x strict" as the runtime language target. When Story 1.1 initialized the monorepo via `npm create vite@latest -- --template vanilla-ts`, create-vite@9.0.7 (the canonical Vite scaffold in May 2026) shipped TypeScript `~6.0.2` as its default for the vanilla-ts template.

Story 1.1's reviewer flagged this as deferred work — the load-bearing property the architecture document depended on was `strict: true` mode, not the major version per se, but the discrepancy needed an explicit decision:

- (a) Ratify TS 6.x and update the architecture wording.
- (b) Downgrade to TS 5.x and document why.

[Source: _bmad-output/implementation-artifacts/deferred-work.md] (item: "web/package.json pins typescript: ~6.0.2, which deviates from the architecture document's TypeScript 5.x strict wording")
[Source: _bmad-output/implementation-artifacts/1-1-initialize-monorepo-with-web-and-bake-halves.md] (Story 1.1 Completion Notes)

## Decision

**Ratify TypeScript 6.x.**

- `web/package.json` continues to pin `typescript: ~6.0.2` (the create-vite@9.0.7 default).
- The architecture document's "TypeScript 5.x" reference is updated to "TypeScript 6.x" in the next planning-artifact touch-up (out of scope for Story 1.2; bundled with whatever next-pass planning edit happens). Until then, this ADR is the authoritative version reference.
- The load-bearing property in the architecture is `strict: true`, which is preserved on TS 6.x.

## Consequences

**Positive:**
- Stays on the canonical Vite vanilla-ts template path. No fork from create-vite's default.
- Strict mode and the rest of the architecture's TS-related claims (branded types, structural type-checking discipline) work identically on TS 6.x.
- AI agents working from the canonical "create-vite vanilla-ts" mental model don't get a hidden version downgrade.

**Negative:**
- The architecture document's TS-5-specific wording is now out-of-date until the next planning-doc edit. Mitigated by this ADR being the current source of truth for the version reference.
- TS 6.x is newer; some third-party type-definition packages may lag on TS 6 compatibility. Mitigation: pin TS as a CI guard (already done in Story 1.1's `test_typescript_is_pinned_to_canonical_vite_minor` test).

**Obligations on downstream stories:**
- The next planning-artifact maintenance story updates `architecture.md` line 38 ("TypeScript 5.x strict") to "TypeScript 6.x strict" and updates the README tech-stack table accordingly. Story 1.2 bundles a one-line README update (the tech-stack reference) alongside this ADR.
- If a TS 6 → 7 jump happens upstream, a new ADR supersedes this one with a re-evaluation.
- The existing `web/tests/scaffold.test.ts` pinning test stays in force; CI catches drift if create-vite later changes its TS default.

## Alternatives Considered

- **Downgrade to TypeScript 5.x.** Rejected. Introduces friction with the canonical Vite template (every fresh `npm create vite` would re-introduce TS 6); requires a forked tsconfig story; no benefit since the architecture's TS-feature claims all work on TS 6.
- **Pin TS to a specific 6.x major.** Already done implicitly by `~6.0.2` (allows patch updates, not minor). The Story 1.1 pinning test enforces "canonical Vite minor"; a future Vite version that bumps to TS 7 would require a new ADR.
- **Wait for an actual TS 6-incompatibility before deciding.** Rejected: deferred-work items become silently stale; the ADR makes the decision explicit now.
- **Use a non-Vite scaffold (e.g., tsc + esbuild manual).** Rejected: contradicts the architecture's starter-template choice (vanilla-ts via create-vite, per the Starter Template Evaluation section).
