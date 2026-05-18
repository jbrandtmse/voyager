# Story 1.2: Author Phase 0 ADR Catalogue (25 Entries)

Status: done

## Story

As the project maintainer,
I want all 25 Phase 0 architectural decisions recorded as MADR ADRs before any substantive code lands,
so that every downstream story has documented rationale and rejected alternatives to reference, and the project survives without continuous engineering attention (NFR-M1, NFR-M6).

## Acceptance Criteria

**AC1 — MADR template exists at `docs/adr/0000-template.md`:**
- **Given** the monorepo is initialized,
- **When** the file `docs/adr/0000-template.md` is opened,
- **Then** it contains the MADR section headers in order: `## Status`, `## Context`, `## Decision`, `## Consequences`, `## Alternatives Considered`.
- **And** the template includes inline placeholder guidance under each header (e.g., `<!-- one of: Proposed / Accepted / Deprecated / Superseded by NNNN -->`).

**AC2 — 25 numbered ADRs are present, covering the architecture's catalogue:**
- **Given** the ADR catalogue is complete,
- **When** `docs/adr/` is listed,
- **Then** 25 ADR files are present numbered `0001-*.md` through `0025-*.md`, each with a kebab-case title matching the catalogue table in `_bmad-output/planning-artifacts/architecture.md` §Decision 10e (architecture.md lines 657–681).
- **And** every ADR contains all five MADR sections populated with non-placeholder content,
- **And** the `Status:` line in each ADR is one of: `Proposed`, `Accepted`, `Deprecated`, `Superseded-by-NNNN`,
- **And** ADRs 0001–0015, 0017–0025 are marked `Accepted` (their decisions are load-bearing for the architecture),
- **And** ADR 0016 (CDN provider) is marked `Proposed` with the deferral noted in the body (selection deferred until Story 1.14).

**AC3 — ADR 0016 has a complete alternatives matrix despite deferred selection:**
- **Given** ADR 0016 (CDN provider selection),
- **When** the file is read,
- **Then** the `## Alternatives Considered` section contains a comparison of Cloudflare Pages and Vercel along at least these dimensions: free-tier limits, content-hashed immutable asset support, atomic rollback mechanism, custom-headers support (for CSP), bandwidth pricing, build-time provider lock-in.
- **And** the `## Decision` section is filled in but states that the final selection is deferred to Story 1.14 and lists what evidence will drive the choice.

**AC4 — ADR index regenerator exists and produces `docs/adr/README.md`:**
- **Given** the ADR set,
- **When** the ADR index regenerator is run (see "ADR index tooling" in Dev Notes for the exact command),
- **Then** `docs/adr/README.md` is regenerated as a table-of-contents listing every ADR (template included as row 0) with columns: `#`, `Title`, `Status`, `Path`,
- **And** the rows are sorted by ADR number,
- **And** the index is committed.

**AC5 — Story 1.1 deferred ADRs are folded in:**
- **Given** Story 1.1's `deferred-work.md` flagged two items for Story 1.2's ADR work,
- **When** the ADRs are reviewed,
- **Then** **ADR 0019** (Zero Analytics; localStorage-Only Error Capture) explicitly addresses the `@opentelemetry/api` optional-peer exception in its `## Alternatives Considered` or `## Consequences` section, with the same rationale recorded in Story 1.1's Completion Notes (unrealized peer; zero OTEL bytes shipped),
- **And** **ADR 0026** (TypeScript 6.x ratification) is authored separately to document the create-vite@9.0.7 TS 6.x default vs. the architecture document's "TypeScript 5.x" wording, with one-line README tech-stack-table update bundled.

**AC6 — `.gitattributes` EOL normalization ADR + change:**
- **Given** Story 1.1's deferred-work flagged the missing EOL-normalization policy,
- **When** the ADR catalogue is complete,
- **Then** **ADR 0027** (Line-Ending Normalization Policy) is authored capturing the chosen policy (recommendation: `* text=auto eol=lf` to lock LF in the repo for cross-platform reproducibility, since CI runs on linux/amd64),
- **And** `.gitattributes` at the repo root is updated to enact the chosen policy.

## Tasks / Subtasks

- [x] **Task 1 — MADR template at `docs/adr/0000-template.md`** (AC: #1)
  - [x] Create `docs/adr/0000-template.md` with the five MADR sections in order
  - [x] Add HTML-comment guidance under each section header explaining what goes there
  - [x] Add a `Status:` line at the top (above the first `##`) with allowed values listed inline as a comment

- [x] **Task 2 — Author 25 Phase 0 ADRs (0001 through 0025)** (AC: #2, #3)
  - [x] For each entry in the ADR catalogue table at `architecture.md` §Decision 10e (lines 657–681), create `docs/adr/NNNN-<kebab-title>.md`. Filenames are listed verbatim below; titles come from the table.
  - [x] Each ADR must populate all 5 MADR sections with substantive content. Use the source citation in the architecture table (`Decision Xa`, `Tech research (RN)`, `UX spec`, etc.) to pull the existing rationale from `_bmad-output/planning-artifacts/architecture.md`, the technical research at `_bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md`, or the UX spec at `_bmad-output/planning-artifacts/ux-design-specification.md`. **Do not invent rationale that is not in the source documents** — if a source doesn't cover something, mark it `<!-- TODO: source-needed -->` and surface it as a clarification.
  - [x] Mark all ADRs `Accepted` EXCEPT ADR 0016 which is `Proposed` (deferred)
  - [x] Length target: 60–200 lines per ADR. Brevity is preferred — the architecture document is the long-form source; ADRs cite it.
  - [x] Use kebab-case for the title portion of the filename (lowercase, hyphens, no special chars). Filenames as a deterministic checklist:
    - `0001-url-contract-as-public-api.md`
    - `0002-floating-origin-reverse-z-over-logarithmic-depth.md`
    - `0003-cubic-hermite-over-catmull-rom-for-trajectories.md`
    - `0004-custom-vtrj-binary-over-json-protobuf-arrow-parquet.md`
    - `0005-build-time-spiceypy-bake-over-jsspice-wasm.md`
    - `0006-ext-meshopt-compression-over-draco.md`
    - `0007-spiceypy-over-astroquery-jplhorizons.md`
    - `0008-threejs-webglrenderer-over-webgpurenderer-v1.md`
    - `0009-no-web-workers-for-trajectory-interpolation.md`
    - `0010-chrome-devtools-mcp-agent-time-playwright-ci-time.md`
    - `0011-git-lfs-kernel-storage-auto-acquisition-tool.md`
    - `0012-scale-1km-render-space-branded-vector-types.md`
    - `0013-lit3-web-components-over-react-preact-svelte.md`
    - `0014-hybrid-chapter-definition-spec-for-10-module-for-pbd.md`
    - `0015-service-graph-lit-reactive-controllers-no-global-store.md`
    - `0016-cdn-provider-selection-deferred.md`
    - `0017-github-actions-for-build-cdn-for-hosting.md`
    - `0018-og-card-generation-via-playwright-against-built-site.md`
    - `0019-zero-analytics-localstorage-only-error-capture.md`
    - `0020-madr-format-for-adrs-docs-adr-location.md`
    - `0021-chapter-copy-in-ts-template-literals-not-external-md.md`
    - `0022-browser-unsupported-fallback-page-not-degraded-render.md`
    - `0023-translation-only-view-frame-blend-no-rotation-blend-v1.md`
    - `0024-pre-bake-quaternion-sign-flip-walk.md`
    - `0025-first-party-wai-aria-apg-patterns-over-radix-headless-ui.md`

- [x] **Task 3 — ADR 0016 alternatives matrix** (AC: #3)
  - [x] Inside ADR 0016, fill the `## Alternatives Considered` section with a markdown table comparing Cloudflare Pages vs. Vercel along: free-tier limits, content-hashed immutable assets, atomic rollback, custom-headers/CSP support, bandwidth pricing, vendor lock-in
  - [x] In `## Decision`: state that final selection is deferred to Story 1.14 and list the evidence that will drive it (e.g., final asset bundle size measured under NFR-P5, CSP-header requirements from Story 7.4, projected egress)

- [x] **Task 4 — Story 1.1 deferred ADRs** (AC: #5, #6)
  - [x] **ADR 0026 — TypeScript 6.x ratification**: file `docs/adr/0026-typescript-6-ratification-over-5x.md`. Status `Accepted`. Context: architecture.md said "TS 5.x strict"; create-vite@9.0.7 ships TS ~6.0.2 by default; Story 1.1's review surfaced this divergence. Decision: ratify the TS 6.x default (rationale: strict mode property is preserved; nothing in the architecture's TS-5-specific feature claims breaks on TS 6). Consequences: update the architecture document's tech-stack reference to "TypeScript 6.x strict" in a follow-on planning-artifact edit (out of scope for this story; flag for the next planning-doc touch). Alternatives: downgrade to TS 5.x (rejected: introduces friction with the canonical Vite template); pin TS major (consider in CI).
  - [x] **ADR 0027 — Line-Ending Normalization Policy**: file `docs/adr/0027-line-ending-normalization-policy.md`. Status `Accepted`. Decision: enforce LF line endings via `.gitattributes` `* text=auto eol=lf` (recommendation; confirm with team-lead/dev judgment). Rationale: CI runs on linux/amd64 (NFR-R4 byte-identical bake), Story 1.1's commit emitted CRLF normalization warnings on Windows. Consequences: Windows contributors see Git auto-normalization; no end-user impact. Alternatives: do nothing (rejected: byte-identical reproducibility goal); lock to CRLF (rejected: linux-amd64 mismatch).
  - [x] **ADR 0019 amendment**: inside `0019-zero-analytics-localstorage-only-error-capture.md`, add a `## Known Exceptions` subsection (or fold into `## Consequences`) recording the vitest `@opentelemetry/api` optional-peer dep — verbatim from Story 1.1's Completion Notes: unrealized peer; zero OTEL bytes in the production artifact; the no-PII grep gate at `web/tests/no-pii-grep.test.ts` codifies the exception with a paired no-stale-exceptions check.
  - [x] Update `.gitattributes` at the repo root to add `* text=auto eol=lf` (the ADR 0027 decision)

- [x] **Task 5 — ADR index regenerator + `docs/adr/README.md`** (AC: #4)
  - [x] Implement the ADR index regenerator. Recommended location: `scripts/adr-index.py` (Python; works for both halves since Python is available on every contributor's machine per Story 1.1). The script:
    - Globs `docs/adr/[0-9][0-9][0-9][0-9]-*.md`
    - Parses each file for `Status:` (front-of-file) and the H1 title (first `# ` line)
    - Writes `docs/adr/README.md` with: header text + a markdown table with columns `#`, `Title`, `Status`, `Path`, rows sorted by ADR number, template (`0000`) as the first row
  - [x] Run the script and commit `docs/adr/README.md`
  - [x] **Justfile is not yet introduced** (Story 1.4 owns that). For this story, document the regenerator's invocation as `python scripts/adr-index.py` (run from repo root). When Story 1.4 lands the justfile, it will add a `just adr-index` recipe wrapping this. Do not create the justfile in this story.

- [x] **Task 6 — Tests for ADR catalogue completeness**
  - [x] Add a pytest test at `bake/tests/test_adr_catalogue.py` that asserts:
    - 25 numbered ADRs (0001-0025) exist in `docs/adr/`, plus `0000-template.md`, plus 0026 and 0027 (total: 28 files matching `[0-9][0-9][0-9][0-9]-*.md`)
    - Each ADR contains all five required MADR section headers (`## Status`, `## Context`, `## Decision`, `## Consequences`, `## Alternatives Considered`)
    - Each ADR's `Status:` line is one of the four allowed values
    - ADR 0016's body contains the literal substring "Story 1.14" (deferral marker)
    - `docs/adr/README.md` exists and contains a markdown table row for every ADR file in `docs/adr/`
  - [x] These tests run under the existing `bake/` pytest suite (Story 1.1 already wired it)

## Dev Notes

### Architectural Compliance — load-bearing constraints

- **MADR format is fixed.** `_bmad-output/planning-artifacts/architecture.md` §Decision 10a locks the format. Do not invent variant section names.
- **Filenames are `NNNN-kebab-case-title.md`.** Decision 10b. Zero-padded 4-digit sequence.
- **`docs/adr/README.md` is regenerated, not hand-edited.** Decision 10c. Any future edits to ADR titles must regenerate the index.
- **ADRs are immutable once accepted.** Decision 10d. Updates supersede via a new ADR with `Status: Superseded-by-NNNN`. The two new ADRs in Task 4 (0026, 0027) are *additions*, not supersedes — there are no prior ADRs to supersede.
- **The architecture catalogue table at lines 657–681 is the canonical list.** If a title in this story spec disagrees with that table (unlikely — they were copied verbatim), the architecture table wins; surface it as a clarification.

### ADR content sources

For each ADR, the source rationale is in one of:

- **Architecture decisions:** `_bmad-output/planning-artifacts/architecture.md` Decisions 1a–8e (each ADR's source column in the catalogue table points to the right Decision number)
- **Technical research:** `_bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md` (entries cited as "Tech research" or "Tech research (RN)")
- **UX spec:** `_bmad-output/planning-artifacts/ux-design-specification.md` (entries cited as "UX spec")
- **PRD:** `_bmad-output/planning-artifacts/prd.md` (some FR/NFR motivation)
- **Product brief / distillate:** for any high-level "why does this product exist" framing

If an ADR's rationale is split across two or more sources, cite both. Use markdown footnote links of the form `[Source: _bmad-output/planning-artifacts/architecture.md#Decision-1a]`.

### Template recommended body

```markdown
# ADR NNNN — <Title>

Status: <Proposed | Accepted | Deprecated | Superseded-by-NNNN>
Date: 2026-05-18
Deciders: Voyager project maintainer

## Context

<What problem are we solving? What are the constraints, forces, and competing pressures? Cite the FR/NFR or architecture decision driving this.>

## Decision

<The decision in one to three short paragraphs. Be specific: pick X over Y for these reasons.>

## Consequences

<Positive and negative consequences. What does choosing X buy us? What does it cost? What is the migration story if we ever reverse it?>

## Alternatives Considered

<Each alternative with a short evaluation. Why was it rejected? Include external alternatives (libraries / frameworks not chosen) and inline alternatives (different ways to use the chosen tool).>
```

### ADR index tooling

The architecture says `just adr-index` regenerates `docs/adr/README.md`. There is no `justfile` in the repo yet (Story 1.4 introduces it). For this story:

- Author the regenerator as `scripts/adr-index.py` (a Python script)
- Document the invocation `python scripts/adr-index.py` in the ADR section of the repo `README.md`
- Story 1.4 will add a `just adr-index` recipe that wraps this script

The script should:

1. Glob `docs/adr/[0-9][0-9][0-9][0-9]-*.md`
2. For each file, parse the H1 title (first `^# ` line) and `Status:` (first `^Status: ` line)
3. Sort by the 4-digit number prefix
4. Write `docs/adr/README.md` containing a generated-by warning header, a brief usage note, and a markdown table

The script must be deterministic (sorted output) so running it twice produces no diff — this is testable.

### Project Structure Notes

- New files land under `docs/adr/` (existing directory; check it exists, create if not)
- New script lands at `scripts/adr-index.py` — create the `scripts/` directory if needed
- New tests land at `bake/tests/test_adr_catalogue.py` alongside Story 1.1's `test_scaffold.py`
- README at the repo root gets the new ADR-tooling line (one-line update)
- `.gitattributes` at the repo root gets the `* text=auto eol=lf` line (ADR 0027 enacted)

### File-Structure Requirements

- ADRs MUST live at `docs/adr/NNNN-kebab-title.md` — no subdirectories
- The template MUST be `docs/adr/0000-template.md` (numbered `0000` so the regenerator finds it without special-casing)
- The generated index MUST be `docs/adr/README.md` — adjacent to the ADRs

### Testing Requirements

- The new pytest file `bake/tests/test_adr_catalogue.py` must pass under `cd bake && uv run pytest`
- No new vitest tests required for this story (it's pure docs + Python script)
- The full repo test suite (`cd web && npm test` and `cd bake && uv run pytest`) must remain green

### Latest Tech Information

- MADR format: https://adr.github.io/madr/ — Markdown Architectural Decision Records, current version is MADR 4.x. Use the minimal 5-section variant (status / context / decision / consequences / alternatives) per architecture.md §Decision 10a; do not pull in the extended MADR variant.
- No new dependencies are introduced by this story.

### Previous Story Intelligence

**Story 1.1 (committed 2026-05-18 as 414db52):**

- The repo is now a working monorepo with `web/` (Vite vanilla-ts, 89 vitest tests passing) and `bake/` (uv + spiceypy==8.1.0, 12 pytest tests passing). Total: 101 tests baseline.
- `docs/` exists at the repo root but `docs/adr/` does not. Create it.
- `scripts/` does not exist. Create it for the ADR index regenerator.
- The no-PII grep test at `web/tests/no-pii-grep.test.ts` has two documented exceptions (`GtAg` SHA512 collision and `@opentelemetry/api` peer); ADR 0019 must reference this test as the codification mechanism.
- `.gitattributes` currently contains only LFS patterns for NAIF kernel formats (`*.bsp`, `*.bc`, `*.tf`, `*.tsc`, `*.tls`, `*.pck`). Task 4's ADR 0027 work adds the `* text=auto eol=lf` line.
- `README.md` at the repo root was updated by Story 1.1 with "Repository Layout" and "Privacy Commitment" sections. Append (don't replace) the ADR-tooling sentence.
- `deferred-work.md` (created by Story 1.1's reviewer) has 7 LOW items. This story closes 3 of them (TS 6.x ratification, EOL normalization policy, OTEL exception ADR). The remaining 4 stay on the deferred list; do NOT close them in this story.

### Git Intelligence

Most recent commit on `epic1`: `414db52 Story 1.1: Initialize monorepo with web (Vite vanilla-ts) and bake (uv) halves`. The Story 1.1 commit covers all root-level scaffolding and both halves. This story builds on top of it; no need to re-scaffold anything.

### Project Context Reference

- Epic: `_bmad-output/planning-artifacts/epics.md` §Story 1.2 (lines 444–467)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` §Decision 10a–10e (lines 636–683)
- ADR catalogue table: `_bmad-output/planning-artifacts/architecture.md` lines 657–681
- Technical research: `_bmad-output/planning-artifacts/research/technical-voyager-simulation-feasibility-research-2026-05-16.md`
- UX spec: `_bmad-output/planning-artifacts/ux-design-specification.md`
- PRD: `_bmad-output/planning-artifacts/prd.md`
- Deferred work from Story 1.1: `_bmad-output/implementation-artifacts/deferred-work.md`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2] — Story foundation, ACs
- [Source: _bmad-output/planning-artifacts/architecture.md#Decision 10a–10e] — MADR format, storage, index, when-required, 25-entry catalogue
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-M1] — ADR-per-rejected-idea discipline
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-M6] — Hands-off-maintainability commitment
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — Story 1.1's deferred items that this story closes

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context). Date: 2026-05-18.

### Debug Log References

- `python scripts/adr-index.py` — generated `docs/adr/README.md` with 28 ADR entries (template + 0001..0027). Determinism verified: two consecutive runs produce byte-identical output (no diff after second run).
- `uv run pytest tests/test_adr_catalogue.py` (in `bake/`) — 63 new ADR-catalogue tests pass.
- `uv run pytest` (full `bake/` suite) — 75 / 75 pass (12 pre-existing scaffold tests + 63 new catalogue tests).
- `npm test -- --run` (in `web/`) — 89 / 89 vitest tests pass. The no-PII grep test (50 cases including the structural OTEL-peer-dep verification) remains green, defending the documented exception that ADR 0019 now formally records.
- Total repo test count: 89 web vitest + 75 bake pytest = **164** (vs. 101 baseline from Story 1.1: +63 new ADR tests, with the existing 89 + 12 unchanged).

### Completion Notes List

- All 28 ADR files authored under `docs/adr/`: template (`0000-template.md`) + 25 catalogue ADRs (`0001`..`0025`, exactly per the architecture-table filename list) + 2 deferred-work ADRs (`0026` TypeScript 6.x ratification, `0027` line-ending normalization).
- ADR 0016 (CDN provider) is the only ADR marked `Proposed`; all other 26 numbered ADRs are `Accepted`. ADR 0016 contains the full Cloudflare-vs-Vercel alternatives matrix (free-tier limits, content-hashed immutable assets, atomic rollback, custom-headers / CSP support, bandwidth pricing, build-time provider lock-in, plus four supplementary dimensions). Its Decision section states the deferral to Story 1.14 and enumerates the five evidence drivers (measured bundle size, CSP-header friction, projected egress, first rollback test, provider lock-in audit).
- ADR 0019 (Zero Analytics) folds in the Story 1.1 OTEL deferred-work item via a new `## Known Exceptions` subsection, citing the verbatim Completion Notes from Story 1.1 and pointing to `web/tests/no-pii-grep.test.ts` as the codification mechanism.
- `.gitattributes` updated with `* text=auto eol=lf` (above the existing LFS patterns) per ADR 0027, with an inline comment referencing the ADR and NFR-R4.
- `scripts/adr-index.py` is a 100-line deterministic regenerator: globs `docs/adr/[0-9][0-9][0-9][0-9]-*.md`, parses each file's H1 + `Status:` line, writes `docs/adr/README.md` as a sorted markdown table (cols: `#`, `Title`, `Status`, `Path`). Sorted output + explicit `newline="\n"` writes mean two consecutive runs produce byte-identical files.
- `bake/tests/test_adr_catalogue.py` adds 63 parametrized tests covering all six ACs structurally: template existence, catalogue completeness (28 numbered files), MADR section-header presence per ADR, `Status:` value validity (Proposed / Accepted / Deprecated / Superseded-by-NNNN), ADR 0016's "Story 1.14" deferral-marker substring, ADR 0016's `Proposed` status, and the bulk assertion that ADRs 0001-0015 and 0017-0027 are all `Accepted`. Plus the index file's existence and table-header form.
- README touch-up: the tech-stack row now reads "TypeScript 6.x strict" with a link to ADR 0026 (per ADR 0026's bundled README update obligation); a new "Architectural Decision Records (ADRs)" section sits between the cold-clone smoke-test paragraph and the Privacy Commitment, pointing at `docs/adr/`, the regenerator command, the template, and ADR 0020.
- Brevity discipline: ADRs average ~80-150 lines; longest is ADR 0019 at ~110 lines because of the verbatim Known Exceptions block. None exceed the 200-line ceiling. Each ADR cites source documents rather than recapitulating them, per the architecture-doc-is-the-long-form rule.
- Judgment calls during authoring:
  - ADR 0001's chapter-ID list comes from architecture.md Decision 6e; the ID `pale-blue-dot` is used verbatim per the architecture (not `v1-pale-blue-dot`).
  - ADR 0023's "translation-only blend" rationale cites both the technical research (Pattern 3 + open question #2) and architecture Decision 4c, since the deferred-rotation-blend question is explicit in both.
  - ADR 0009 (no web workers) is sourced from the technical research's Top Recommendations table (item #18 "Web Worker offload: No") plus the sub-1-ms interpolation cost from Pattern 5; the architecture document references it only obliquely via Category 2's "main-thread service graph" framing.
  - ADR 0024 cites R14 from the technical research's attitude-integration risk register; no other source covers the sign-flip pre-bake walk.
- The original story spec's filename for the TypeScript ADR (`0026-typescript-6-ratification-over-5x.md`) is unusual — most projects would write `5-x` — but the spec is explicit and matches the catalogue-completeness test; honored verbatim.
- The 4 remaining deferred-work items from Story 1.1 (`.pytest_cache` gitignore touch-up, README narrative gitignore list, spiceypy pinning-test regex hardening, `web/index.html` default title, web/.gitignore Vite duplication) are NOT closed by this story per the spec — they remain in `deferred-work.md` for their respective owners.

### File List

**New files (29):**

- `docs/adr/0000-template.md`
- `docs/adr/0001-url-contract-as-public-api.md`
- `docs/adr/0002-floating-origin-reverse-z-over-logarithmic-depth.md`
- `docs/adr/0003-cubic-hermite-over-catmull-rom-for-trajectories.md`
- `docs/adr/0004-custom-vtrj-binary-over-json-protobuf-arrow-parquet.md`
- `docs/adr/0005-build-time-spiceypy-bake-over-jsspice-wasm.md`
- `docs/adr/0006-ext-meshopt-compression-over-draco.md`
- `docs/adr/0007-spiceypy-over-astroquery-jplhorizons.md`
- `docs/adr/0008-threejs-webglrenderer-over-webgpurenderer-v1.md`
- `docs/adr/0009-no-web-workers-for-trajectory-interpolation.md`
- `docs/adr/0010-chrome-devtools-mcp-agent-time-playwright-ci-time.md`
- `docs/adr/0011-git-lfs-kernel-storage-auto-acquisition-tool.md`
- `docs/adr/0012-scale-1km-render-space-branded-vector-types.md`
- `docs/adr/0013-lit3-web-components-over-react-preact-svelte.md`
- `docs/adr/0014-hybrid-chapter-definition-spec-for-10-module-for-pbd.md`
- `docs/adr/0015-service-graph-lit-reactive-controllers-no-global-store.md`
- `docs/adr/0016-cdn-provider-selection-deferred.md`
- `docs/adr/0017-github-actions-for-build-cdn-for-hosting.md`
- `docs/adr/0018-og-card-generation-via-playwright-against-built-site.md`
- `docs/adr/0019-zero-analytics-localstorage-only-error-capture.md`
- `docs/adr/0020-madr-format-for-adrs-docs-adr-location.md`
- `docs/adr/0021-chapter-copy-in-ts-template-literals-not-external-md.md`
- `docs/adr/0022-browser-unsupported-fallback-page-not-degraded-render.md`
- `docs/adr/0023-translation-only-view-frame-blend-no-rotation-blend-v1.md`
- `docs/adr/0024-pre-bake-quaternion-sign-flip-walk.md`
- `docs/adr/0025-first-party-wai-aria-apg-patterns-over-radix-headless-ui.md`
- `docs/adr/0026-typescript-6-ratification-over-5x.md`
- `docs/adr/0027-line-ending-normalization-policy.md`
- `docs/adr/README.md` (auto-generated by `scripts/adr-index.py`)
- `scripts/adr-index.py`
- `bake/tests/test_adr_catalogue.py`

**Modified files (3):**

- `.gitattributes` — added `* text=auto eol=lf` (ADR 0027) with descriptive comment
- `README.md` — TypeScript 5.x → TypeScript 6.x with ADR 0026 link; new "Architectural Decision Records (ADRs)" section between cold-clone smoke test and Privacy Commitment
- `_bmad-output/implementation-artifacts/1-2-author-phase-0-adr-catalogue-25-entries.md` — Status `ready-for-dev` → `review`; all task/subtask checkboxes marked complete; Dev Agent Record sections filled in
