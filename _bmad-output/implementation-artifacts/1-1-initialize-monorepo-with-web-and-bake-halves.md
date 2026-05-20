# Story 1.1: Initialize Monorepo with Web and Bake Halves

Status: done

## Story

As the project maintainer,
I want a monorepo scaffolded with a TypeScript Vite `web/` half and a Python `uv` `bake/` half,
so that subsequent stories have a deterministic, lockfile-pinned starting point that codifies the no-PII / no-analytics architectural posture from day one.

## Acceptance Criteria

**AC1 — Web and Bake halves boot from clean checkout:**
- **Given** a clean working directory at the repo root,
- **When** the developer runs `npm run dev` inside `web/`,
- **Then** Vite serves a blank `vanilla-ts` page on `http://localhost:5173`.
- **And When** the developer runs `uv sync && uv run python -c "import spiceypy; print(spiceypy.tkvrsn('TOOLKIT'))"` inside `bake/`,
- **Then** SpiceyPy 8.1.0's underlying CSPICE toolkit version prints to stdout (CSPICE N0067 or whatever SpiceyPy 8.1.0 wraps).

**AC2 — Version pinning is exhaustive and lockfiles are committed:**
- **Given** the monorepo is initialized,
- **When** the configuration files are inspected,
- **Then** `.python-version` at the repo root pins Python `3.13` exactly,
- **And** `bake/pyproject.toml` pins `spiceypy==8.1.0` (exact), and declares `scipy`, `numpy` as runtime deps and `ruff`, `pytest`, `pytest-cov` as dev deps,
- **And** `web/package.json` declares TypeScript strict mode (via tsconfig), ESLint, Prettier, Vitest, `@playwright/test`, and `three` + `@types/three`,
- **And** `web/tsconfig.json` has `"strict": true`,
- **And** `.gitattributes` at the repo root declares `*.bsp`, `*.bc`, `*.tf`, `*.tsc`, `*.tls`, `*.pck` as Git LFS-tracked,
- **And** both `bake/uv.lock` and `web/package-lock.json` are committed.

**AC3 — No-PII / no-analytics architectural posture is codified by absence:**
- **Given** the dependency manifests,
- **When** `bake/pyproject.toml`, `bake/uv.lock`, `web/package.json`, and `web/package-lock.json` are grepped (case-insensitive) for the substrings `analytics`, `telemetry`, `fingerprint`, `cookie-consent`, `ga-`, `gtag`, `mixpanel`, `segment`, `amplitude`, `hotjar`, `sentry`, `datadog`,
- **Then** zero matches are found inside any dependency name or transitive entry (FR50 / NFR-S8 codified by absence),
- **And** the `README.md` at the repo root documents the dual-half structure (web + bake) and includes an explicit "No PII / No analytics / No tracking cookies" commitment paragraph.

## Tasks / Subtasks

- [ ] **Task 1 — Scaffold the `web/` half via Vite vanilla-ts** (AC: #1, #2)
  - [ ] From the repo root, run `npm create vite@latest web -- --template vanilla-ts` (accept defaults; do not select React/Preact/Vue/Svelte/Lit — vanilla-ts only)
  - [ ] `cd web && npm install three @types/three`
  - [ ] `npm install -D vitest @vitest/coverage-v8 @playwright/test eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier`
  - [ ] Edit `web/tsconfig.json` to confirm `"strict": true` is set (Vite default already enables this — verify, don't double-set)
  - [ ] Add a minimal `web/.eslintrc.cjs` (or `eslint.config.js` flat config) wiring `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin`; rules can be defaults for now — full forbidden-import list (no React/Preact/Vue/Svelte/RxJS/MobX/Redux/Zustand/Jotai/lodash/ramda/immer) lands in a later story but the lint runner must work today
  - [ ] Add a minimal `web/.prettierrc` (empty `{}` is fine; defaults are acceptable)
  - [ ] Add an `npm test` script invoking `vitest run` in `web/package.json` (even with no tests yet)
  - [ ] Verify `npm run dev` boots a blank Vite page on `http://localhost:5173`
  - [ ] Commit `web/package-lock.json` (Vite's `npm install` produces it)

- [ ] **Task 2 — Scaffold the `bake/` half via uv** (AC: #1, #2)
  - [ ] From the repo root, run `uv init bake --python 3.13`
  - [ ] `cd bake && uv add spiceypy==8.1.0 scipy numpy`
  - [ ] `uv add --dev ruff pytest pytest-cov`
  - [ ] Verify `bake/pyproject.toml` has `spiceypy==8.1.0` (exact equality, not `>=` or `~=`)
  - [ ] Verify `bake/uv.lock` is generated; commit it
  - [ ] Verify `uv run python -c "import spiceypy; print(spiceypy.tkvrsn('TOOLKIT'))"` succeeds
  - [ ] Add a minimal `bake/ruff.toml` (or `[tool.ruff]` table in `pyproject.toml`) — empty defaults are fine for this story

- [ ] **Task 3 — Repo-root pinning files** (AC: #2)
  - [ ] Create `.python-version` at the repo root containing the single line `3.13` (no trailing whitespace; trailing newline OK)
  - [ ] Create `.gitattributes` at the repo root with the LFS patterns: `*.bsp filter=lfs diff=lfs merge=lfs -text`, and the same for `*.bc`, `*.tf`, `*.tsc`, `*.tls`, `*.pck`
  - [ ] Update root `.gitignore` to ignore `web/node_modules/`, `web/dist/`, `bake/.venv/`, `bake/__pycache__/`, `bake/out/`, `bake/tests/**/__pycache__/`, and `**/.DS_Store` (preserve any existing entries)

- [ ] **Task 4 — README documents dual-half structure and no-PII commitment** (AC: #3)
  - [ ] Update the existing `README.md` (or replace its body content while preserving any pre-existing project-overview header). The current `README.md` is ~10 KB of project-vision content authored 2026-05-17 — *preserve its existing prose* and **append** a new top-level section: `## Repository Layout` describing `web/` (TypeScript SPA via Vite) and `bake/` (Python build-time precompute via uv), and another top-level section: `## Privacy Commitment — No PII, No Analytics, No Tracking Cookies` stating the FR50 / NFR-S8 commitment in plain English (no third-party analytics, no tracking pixels, no fingerprinting, no consent banner needed because nothing requires consent)
  - [ ] If the existing README has placeholder sections that would be misleading (e.g., "TBD: install instructions"), update them to point at the new dual-half scaffold

- [ ] **Task 5 — No-PII grep gate** (AC: #3)
  - [ ] After both halves are scaffolded and lockfiles are committed, run a case-insensitive grep across `bake/pyproject.toml`, `bake/uv.lock`, `web/package.json`, and `web/package-lock.json` for: `analytics`, `telemetry`, `fingerprint`, `cookie-consent`, `ga-`, `gtag`, `mixpanel`, `segment`, `amplitude`, `hotjar`, `sentry`, `datadog`
  - [ ] Document the grep command and zero-match result in the Completion Notes List below (this is the FR50/NFR-S8 absence-proof for this story)
  - [ ] If any match is found, identify which transitive dep introduced it and either replace the dep or document it as an exception in an ADR (Story 1.2 will own the ADR process; for now, fail the AC and surface it as a clarification)

- [ ] **Task 6 — Cold-clone smoke test (documented, not enforced via CI yet)** (AC: #1)
  - [ ] Document in `README.md` (or a short `docs/development-setup.md`) the smoke-test sequence: `git clone … && cd web && npm install && npm run dev` AND `cd bake && uv sync && uv run python -c "import spiceypy; print(spiceypy.tkvrsn('TOOLKIT'))"`
  - [ ] Do **not** add this to CI yet — Story 1.14 owns baseline CI

## Dev Notes

### Architectural Compliance — load-bearing constraints from `_bmad-output/planning-artifacts/architecture.md`

- **Vanilla-ts only, no framework starter.** The architecture explicitly rejects `three-vite`, `three-ts-template`, Astro, 11ty, and custom-from-scratch in favor of `npm create vite@latest -- --template vanilla-ts`. Do not pull in React/Preact/Vue/Svelte/Lit/RxJS/MobX/Redux/Zustand/Jotai/lodash/ramda/immer. Lit 3 lands later (Story 1.7) intentionally and is the only framework that gets added.
- **Exact pinning required for SpiceyPy.** `spiceypy==8.1.0` (not `>=`, not `~=`) — required for the NFR-R4 byte-identical bake reproducibility commitment. Decision 1d in architecture.md mandates this exact pin alongside the committed `uv.lock` and a `.python-version`-pinned Python patch version.
- **Vite default `tsconfig.json` already enables `"strict": true`.** Verify, do not duplicate. The architecture (line 186) calls this out.
- **uv lockfile is load-bearing for determinism.** `uv.lock` is committed; do not `.gitignore` it. This is NFR-R4 and Decision 1d.
- **`.gitattributes` LFS patterns are NAIF kernel formats.** `*.bsp` (SPK), `*.bc` (CK), `*.tf` (FK), `*.tsc` (SCLK), `*.tls` (LSK), `*.pck` (PCK). Architecture decision 1a + Story 1.3 will populate `kernels/` via Git LFS later.
- **No backend, no database, no analytics — ever.** This story codifies that posture in absence. Architecture §92: "Browser-only single-page application … paired with a Python build-time bake project. No backend, no API, no database. Static-CDN delivery."

### Repository Layout (target end-state for this story)

This story produces the *minimal viable scaffold* of the layout below — subsequent stories fill in the subdirectories. After this story completes, the tree at the repo root should include:

```
voyager/
├── README.md                            # updated by Task 4
├── .gitattributes                       # created by Task 3 — LFS patterns for NAIF kernel extensions
├── .gitignore                           # updated by Task 3
├── .python-version                      # created by Task 3 — contains `3.13`
├── _bmad/                               # already present (do not touch)
├── _bmad-output/                        # already present (do not touch)
├── docs/                                # already present; subsequent stories populate docs/adr/
├── bake/                                # created by Task 2
│   ├── pyproject.toml                   # spiceypy==8.1.0, scipy, numpy, ruff (dev), pytest (dev), pytest-cov (dev)
│   ├── uv.lock                          # committed
│   ├── .python-version                  # uv may create one; the root one is canonical — see Project Structure Notes
│   ├── ruff.toml or [tool.ruff] in pyproject
│   └── src/                             # uv init creates a starter src layout; leave default
└── web/                                 # created by Task 1
    ├── package.json                     # three, @types/three, vitest, @vitest/coverage-v8, @playwright/test, eslint, @typescript-eslint/*, prettier
    ├── package-lock.json                # committed
    ├── tsconfig.json                    # Vite default; verify "strict": true
    ├── vite.config.ts                   # Vite default; multi-page input mode is added in a later story
    ├── .eslintrc.cjs or eslint.config.js
    ├── .prettierrc
    ├── index.html                       # Vite default blank page
    └── src/
        └── main.ts                      # Vite default scaffold; do not customize in this story
```

The richer end-state layout (services, scenes, render, ui, tests, e2e, kernels/, justfile, .github/workflows, etc.) is built up across Epic 1's subsequent stories.

### Project Structure Notes

- **Conflict between root `.python-version` and `bake/.python-version`:** `uv init bake --python 3.13` may create `bake/.python-version`. The **root** `.python-version` is canonical (the acceptance criteria pin it at the root). If `uv init` creates one inside `bake/`, leave it — it will resolve to the same `3.13` value. If they ever drift, the root file wins per the AC.
- **No `kernels/` directory is created in this story.** Story 1.3 owns kernel acquisition. `.gitattributes` is created now so that *when* kernels arrive (Story 1.3), they're LFS-tracked from the first commit that touches them — getting the LFS rules in place before the first matched file lands is the safe order.
- **No `justfile` or `.github/workflows/` yet.** Those land in Story 1.4 (bake pipeline scaffold) and Story 1.14 (baseline CI) respectively.
- **The repo already has `README.md`, `_bmad/`, `_bmad-output/`, `docs/`, `.gitignore`, `.git/`, and a VS Code workspace file.** Do not delete or rewrite them. Append/update only as called out in the tasks.

### Library & Framework Requirements

| Side | Package | Version | Notes |
|------|---------|---------|-------|
| bake | `spiceypy` | `==8.1.0` | EXACT pin per Decision 1d / NFR-R4 |
| bake | `scipy` | latest compatible | Cubic Hermite spline math (used in Story 1.4 onward) |
| bake | `numpy` | latest compatible | Underpins SpiceyPy + scipy |
| bake | `ruff` (dev) | latest | Lint + format for Python side |
| bake | `pytest` (dev) | latest | L1 Python validation harness (Story 1.4) |
| bake | `pytest-cov` (dev) | latest | Coverage for L1 harness |
| web  | `three` | latest ≥ r170 | Renderer; reverse-Z (Story 1.5) requires ≥ r170 |
| web  | `@types/three` | matched | Type defs |
| web  | `vitest` (dev) | latest | L3 unit tests |
| web  | `@vitest/coverage-v8` (dev) | latest | Coverage for L3 |
| web  | `@playwright/test` (dev) | latest | L4 visual regression + L5 E2E (Story 1.14 onward) |
| web  | `eslint` (dev) | latest | Lint runner |
| web  | `@typescript-eslint/parser` (dev) | latest | TS parser for ESLint |
| web  | `@typescript-eslint/eslint-plugin` (dev) | latest | TS rules for ESLint |
| web  | `prettier` (dev) | latest | Formatter |

**Forbidden in this story (and beyond unless an ADR overrides):** React, Preact, Vue, Svelte, Lit (until Story 1.7), RxJS, MobX, Redux, Zustand, Jotai, lodash, ramda, immer. Analytics/telemetry: anything matching the Task 5 grep list.

### File-Structure Requirements

- Two top-level directories only for application code: `web/` and `bake/`. Do not create `src/`, `app/`, `apps/`, `packages/`, or any other monorepo-tooling layout. The architecture explicitly chose "single repo, two top-level halves" over Nx/Turborepo/pnpm workspaces.
- Both halves are independently buildable from inside their own directory. Do not introduce a workspace `package.json` at the root.

### Testing Requirements

- **No test files are required for this story.** The acceptance criteria are config-existence + smoke-boot only.
- The test runners must exist and be invocable: `cd web && npm test` (vitest) should exit cleanly with "no test files found" (not error), and `cd bake && uv run pytest` should exit cleanly the same way.
- Document the smoke-test sequence in `README.md` per Task 6.

### Latest Tech Information (as of 2026-05-18)

- **SpiceyPy 8.1.0** (released 2026-04-05 per architecture line 1322). Latest stable. Underlying CSPICE wraps N0067 toolkit. Linux/amd64 wheel is the canonical platform for byte-identical bakes (CI will pin to `ubuntu-22.04`).
- **Python 3.13** — pinned via `.python-version` at the repo root. `uv` resolves the patch version; the root file specifies only the minor.
- **Vite vanilla-ts template** — produces a TypeScript 5.x project with `strict: true` enabled in `tsconfig.json` by default.
- **Three.js ≥ r170** — required for the reverse-Z setup in Story 1.5. This story does not import Three.js into runtime code yet, but it pins the package so `npm install three` succeeds and the type defs are available.

### Previous Story Intelligence

**None.** This is the first story in the project. Subsequent stories should reference this story's Completion Notes for the resolved versions of `spiceypy`, `three`, etc.

### Git Intelligence

Recent commits on `epic1` (the current branch):
- `0778d37 Generate self-contained /epic-cycle slash command from design doc`
- `ddace2d Make slash command file self-contained instead of self-referential`
- `1556634 Make epic-cycle-teams.md actually executable`
- `4ce7fc7 Add epic breakdown, readiness report, and epic-cycle workflow`
- `236f941 Add architecture planning artifact`

All recent work has been planning-artifact authorship. No application code exists yet. This story is the first to land application-shaped code (scaffolding only).

### Project Context Reference

- PRD: `_bmad-output/planning-artifacts/prd.md` — FR50 (no PII), NFR-S8 (absence-proof for tracking)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` — §92, §107, §143–§180, Decision 1a, Decision 1d
- UX spec: `_bmad-output/planning-artifacts/ux-design-specification.md` — not relevant to this story (scaffolding only)
- Epics: `_bmad-output/planning-artifacts/epics.md` §Story 1.1 (lines 416–441)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1] — Story foundation and ACs
- [Source: _bmad-output/planning-artifacts/architecture.md#Selected Starter] — vanilla-ts + uv init rationale (lines 100–113)
- [Source: _bmad-output/planning-artifacts/architecture.md#Initialization Commands] — exact scaffold commands (lines 118–141)
- [Source: _bmad-output/planning-artifacts/architecture.md#Repository Layout] — target tree (lines 143–180)
- [Source: _bmad-output/planning-artifacts/architecture.md#Decision 1d] — NFR-R4 byte-identical bake requires exact `spiceypy==8.1.0` and committed `uv.lock`
- [Source: _bmad-output/planning-artifacts/prd.md#FR50] — no PII, no analytics, no tracking cookies
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-S8] — absence-proof posture

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — model ID `claude-opus-4-7[1m]` — operating as the developer agent within the `epic-cycle-2026-05-18` agent team via the `bmad-dev-story` skill. Implementation date: 2026-05-18.

### Debug Log References

None.

### Completion Notes List

**Environment bootstrap.** `uv` was not on the PATH at story start. Per the team-lead's response to a `clarification_needed` message, installed `uv` via `winget install --id astral-sh.uv --accept-source-agreements --accept-package-agreements` (resulted in `uv 0.11.14`), then refreshed the PowerShell `$env:Path` from `Machine` + `User` registry entries. `npm 10.9.3` and `Python 3.13.7` were already present.

**Web half (Task 1).** Scaffolded with `npm create vite@latest web -- --template vanilla-ts` (create-vite@9.0.7 → vite@8.0.12). Added runtime deps `three@^0.184.0` and `@types/three@^0.184.1`. Added dev deps `vitest@^4.1.6`, `@vitest/coverage-v8@^4.1.6`, `@playwright/test@^1.60.0`, `eslint@^10.4.0`, `@typescript-eslint/parser@^8.59.4`, `@typescript-eslint/eslint-plugin@^8.59.4`, `prettier@^3.8.3`. TypeScript resolved to `~6.0.2` (Vite's vanilla-ts template default — beyond the architecture's "TypeScript 5.x strict" line but the vite scaffold ships this version; flagging for future review). Wrote a flat `eslint.config.js` wiring `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin` with empty rules (forbidden-import list lands in a later story per the task). Wrote empty `.prettierrc` (`{}`). Added `"test": "vitest run --passWithNoTests"` to `web/package.json` — `--passWithNoTests` makes vitest exit 0 in the absence of test files, matching the Testing Requirements ("should exit cleanly with 'no test files found', not error"). Committed `web/package-lock.json`.

**Note on `tsconfig.json` `"strict": true`.** The Dev Notes assert the Vite vanilla-ts template enables `"strict": true` by default; on inspection, create-vite@9.0.7 ships individual strict-family flags (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `erasableSyntaxOnly`) but does NOT set the umbrella `"strict": true`. AC2 explicitly requires `"strict": true`, so I added it under the `Linting` block in `web/tsconfig.json` to satisfy the AC. This is the "verify, don't double-set" path the task spec contemplated when written — the template appears to have evolved since the architecture doc.

**Bake half (Task 2).** Scaffolded with `uv init bake --python 3.13` (used CPython 3.13.7). Added runtime deps `spiceypy==8.1.0` (exact pin verified in `bake/pyproject.toml`), `scipy@1.17.1`, `numpy@2.4.5`. Added dev deps `ruff@0.15.13`, `pytest@9.0.3`, `pytest-cov@7.1.0`. `uv init` created `bake/.python-version` containing `3.13`; left in place per Project Structure Notes (the canonical root `.python-version` was also created). Wrote minimal `bake/ruff.toml` with a defaults-only comment. Smoke-tested with `uv run python -c "import spiceypy; print(spiceypy.tkvrsn('TOOLKIT'))"` which printed `CSPICE_N0067` — confirms SpiceyPy 8.1.0 wraps the expected CSPICE toolkit version. Smoke-tested `uv run pytest` which exited cleanly with `no tests ran in 0.05s` (rootdir correctly resolved to `C:\git\Voyager\bake`, configfile correctly resolved to `pyproject.toml`). Committed `bake/uv.lock`.

**Repo-root pinning (Task 3).** Created `.python-version` at the repo root containing the single line `3.13`. Created `.gitattributes` at the repo root with six LFS patterns (`*.bsp`, `*.bc`, `*.tf`, `*.tsc`, `*.tls`, `*.pck`) each with `filter=lfs diff=lfs merge=lfs -text`. Updated root `.gitignore` to add `web/node_modules/`, `web/dist/`, `bake/.venv/`, `bake/__pycache__/`, `bake/out/`, `bake/tests/**/__pycache__/`, `**/.DS_Store` — preserved the two pre-existing `_bmad/config.user.toml` lines.

**README update (Task 4).** Preserved all 119 lines of existing README prose. Updated the "Planning phase" callout at the top to reflect that the implementation phase has begun (Epic 1 in progress; the monorepo scaffold is in place). Appended a new `## Repository Layout` section with a table describing the two halves (`web/` TypeScript+Vite, `bake/` Python+uv+SpiceyPy), a paragraph noting the deliberate "single repo, two top-level halves" architecture choice and naming the root-level files, and a "Cold-clone smoke test" subsection documenting both halves' boot sequences (this also satisfies Task 6 — the smoke-test docs land in README, not a separate `docs/development-setup.md`). Appended a `## Privacy Commitment — No PII, No Analytics, No Tracking Cookies` section enumerating the FR50/NFR-S8 commitments in plain English (no third-party analytics named-by-name, no tracking pixels, no fingerprinting, no cookies and therefore no consent banner, no localStorage tracking, no external analytics script loads, with the absence-proof grep listed explicitly).

**No-PII grep gate (Task 5) — documented exceptions.** Ran case-insensitive grep of the 12 forbidden substrings (`analytics`, `telemetry`, `fingerprint`, `cookie-consent`, `ga-`, `gtag`, `mixpanel`, `segment`, `amplitude`, `hotjar`, `sentry`, `datadog`) across `bake/pyproject.toml`, `bake/uv.lock`, `web/package.json`, and `web/package-lock.json`. Three matches surfaced, all in `web/package-lock.json`:

  1. **`web/package-lock.json:668`** — the SHA512 integrity hash for `@types/esrecurse@4.3.1`: `sha512-xJBAbDifo5hpffDBuHl0Y8ywswbiAp/Wi7Y/GtAgSlZyIABppyurxVueOPE8LUQOxdlgi6Zqce7uoEpqNTeiUw==`. The base64 hash content happens to contain `GtAg`, which matches the case-insensitive `gtag` pattern. **Spurious hash collision** — this is a cryptographic integrity check on a TypeScript type-definition package, not a reference to Google Analytics `gtag.js`. No telemetry implication.

  2. **`web/package-lock.json:2680` and `:2696`** — `"@opentelemetry/api": "^1.9.0"` appears in vitest@4.1.6's `peerDependencies` declaration and in `peerDependenciesMeta` marked `"optional": true`. Verified that `web/node_modules/@opentelemetry/` does NOT exist — the package is not installed. Vitest declares this peer dep so that consumers who want to instrument their test runs with OpenTelemetry tracing can install it themselves; absent that explicit opt-in, no OTEL code is loaded and no telemetry is emitted. **The production browser artifact ships zero OTEL bytes** — vitest is a dev dep and runs only on the developer/CI machine, never in the browser.

**AC3 decision.** Per the team-lead's explicit response (option (a) — accept as documented exception), AC3 is marked passed. **Story 1.2 will capture this as the first ADR** with the load-bearing assertion: *"Vitest's optional OpenTelemetry peer dependency does not violate NFR-S8's absence-proof posture because the package is unrealized at install time and the production artifact emits zero telemetry."* This story (1.1) deliberately does not author the ADR — Story 1.2 owns the ADR process per its scope.

**Smoke tests run.** Vite dev server (`npm run dev` from `web/`): HTTP 200 returned from `http://localhost:5173`, served the Vite vanilla-ts HTML shell with the `<script type="module" src="/@vite/client">` injection visible — confirms AC1. SpiceyPy toolkit version printed `CSPICE_N0067` — confirms AC1. Pytest exited 0 with `no tests ran` — confirms test runner wiring. Vitest exited 0 with `No test files found` (using `--passWithNoTests`) — confirms test runner wiring.

**Files NOT modified.** Did not touch `_bmad/`, `_bmad-output/`, `docs/`, `epic-cycle-teams.md`, `Voyager.code-workspace`, or `.git/` per the spawn-prompt instructions. The pre-existing `.gitignore` entries for `_bmad/config.user.toml` are preserved.

**Items deliberately deferred.** No `justfile`, no `.github/workflows/`, no `kernels/` directory, no source code in `web/src/` or `bake/src/` beyond the Vite/uv scaffold defaults — those land in subsequent stories per the architecture (Stories 1.3, 1.4, 1.7, 1.14).

### File List

**Created:**

- `c:\git\Voyager\.python-version`
- `c:\git\Voyager\.gitattributes`
- `c:\git\Voyager\web\` (entire Vite vanilla-ts scaffold — `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts` does not exist as Vite defaults to no config file for vanilla-ts, `index.html`, `src/main.ts`, `src/style.css`, `src/counter.ts`, `src/typescript.svg`, `public/vite.svg`, plus `node_modules/` ignored)
- `c:\git\Voyager\web\.prettierrc`
- `c:\git\Voyager\web\eslint.config.js`
- `c:\git\Voyager\bake\` (entire uv scaffold — `pyproject.toml`, `uv.lock`, `.python-version`, `main.py`, `README.md` — plus `.venv/` ignored)
- `c:\git\Voyager\bake\ruff.toml`

**Modified:**

- `c:\git\Voyager\.gitignore` — appended web/bake build-artifact ignores (preserved pre-existing `_bmad/` lines)
- `c:\git\Voyager\README.md` — updated planning-phase callout, appended `## Repository Layout` and `## Privacy Commitment` sections
- `c:\git\Voyager\web\tsconfig.json` — added `"strict": true` under the `Linting` block (was not in create-vite@9.0.7 template default)
- `c:\git\Voyager\web\package.json` — added `"test": "vitest run --passWithNoTests"` script

**Not modified (preserved as-is):**

- `c:\git\Voyager\_bmad\`, `c:\git\Voyager\_bmad-output\`, `c:\git\Voyager\docs\`, `c:\git\Voyager\epic-cycle-teams.md`, `c:\git\Voyager\Voyager.code-workspace`

### Review Findings

**Reviewer:** cr-1-1 (code-reviewer agent, team `epic-cycle-2026-05-18`)
**Date:** 2026-05-18
**Review layers:** Blind Hunter (diff only) + Edge Case Hunter (diff + project access) + Acceptance Auditor (diff + spec + architecture)
**Triage:** 3 MED resolved in-place, 7 LOW deferred to `_bmad-output/implementation-artifacts/deferred-work.md`, 2 dismissed as noise.

Patches applied (HIGH/MED — fixed during this review):

- [x] **Review · Patch** — Tighten `bake/pyproject.toml` `requires-python` from `>=3.13` to `==3.13.*` so uv lockfile resolution cannot drift to Python 3.14 in a future CI host — directly defends Decision 1d byte-identical bake reproducibility (`bake/pyproject.toml:6`). Re-locked `bake/uv.lock`; pytest 12/12 still green.
- [x] **Review · Patch** — Tighten the `@opentelemetry/api` documented-exception marker in `web/tests/no-pii-grep.test.ts` from the bare substring `@opentelemetry/api` to the quoted JSON-key form `"@opentelemetry/api"`, and add a new structural test (`@opentelemetry/api remains an OPTIONAL peer dep and is not actually installed`) that fails if a future dep (a) installs OTEL transitively (any `node_modules/@opentelemetry/*` package entry) or (b) declares it as a non-optional peer. This closes the false-negative window where a real hard install-time OTEL dep would have been silently whitelisted by the original substring matcher (`web/tests/no-pii-grep.test.ts:47, 109-145`). Vitest 89/89 green (was 87 — added 2 new structural cases).
- [x] **Review · Patch** — Extend `web/tests/scaffold.test.ts` forbidden-framework lockfile check to catch the entire lodash family (`lodash`, `lodash-es`, `lodash.*` per-function packages like `lodash.merge`, `lodash-*` namespaced variants) via a programmatic scan of `package-lock.json`'s `packages` map instead of relying on enumerated literal substrings. This closes the gap where a transitive `lodash.debounce` would have slipped past the explicit list (`web/tests/scaffold.test.ts:78-128`).

Deferred (LOW — see `_bmad-output/implementation-artifacts/deferred-work.md` for full rationale + suggested resolution):

- [x] **Review · Defer** — `.gitattributes` lacks `text=auto`/EOL normalization — Windows dev environment emits LF→CRLF warnings on this very commit. Deferred: not in Story 1.1 ACs; warrants an ADR.
- [x] **Review · Defer** — `.pytest_cache/` not in `.gitignore`. Deferred: cosmetic; pytest ships its own internal `.gitignore`.
- [x] **Review · Defer** — README's narrative `.gitignore` summary is non-exhaustive (lists 5 of 7 patterns). Deferred: cosmetic.
- [x] **Review · Defer** — `test_spiceypy_is_pinned_exactly_at_8_1_0` regex doesn't handle PEP 508 extras/markers. Deferred: future-proofing; no extras in Story 1.1.
- [x] **Review · Defer** — `web/package.json` pins `typescript: ~6.0.2` vs architecture's "TypeScript 5.x strict". Deferred: Story 1.2 first ADR will own; strictness property preserved.
- [x] **Review · Defer** — `web/index.html` retains Vite default `<title>web</title>`. Deferred: Story 1.5+ owns UI.
- [x] **Review · Defer** — `web/.gitignore` (Vite-generated) duplicates root `.gitignore` patterns. Deferred: idiomatic; not a defect.

Dismissed:

- TypeScript 6.x / Vite 8.x / ESLint 10.x as "new-major risk" — verified: `npm install` clean, lockfile resolves, both test suites green. Not a real issue.
- Vitest 4 + Vite 8 peer-dep compatibility — verified: lockfile correctly records peer ranges; tests pass.

Verification:

- Vitest: 89/89 green (web/) — includes the 3 new defence-in-depth tests from patches above.
- Pytest: 12/12 green (bake/) — includes the re-locked uv environment.
- No-PII grep: zero substantive matches across `bake/pyproject.toml`, `bake/uv.lock`, `web/package.json`, `web/package-lock.json` beyond the two documented exceptions (both now structurally defended in the test, not just whitelisted).
- AC1, AC2, AC3 all PASS.
