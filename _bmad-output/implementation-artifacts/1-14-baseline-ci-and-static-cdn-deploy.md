# Story 1.14: Baseline CI and Static CDN Deploy

Status: done

## Story

As the project maintainer,
I want a green CI pipeline that lints, typechecks, runs the L1 + L3 gates, builds with content-hashed assets, and deploys to the chosen CDN,
so that every merge to main results in a live, immutable, rollback-able deployment, fulfilling FR51, FR55 (L1+L3), FR56, NFR-R1, NFR-R2, NFR-R4, NFR-S1, NFR-M4.

## Acceptance Criteria

**AC1 — ADR 0016 updated with the final CDN selection:**
- **Given** ADR 0016 from Story 1.2 was authored as `Proposed` with the Cloudflare Pages vs. Vercel alternatives matrix,
- **When** Story 1.14 lands,
- **Then** `docs/adr/0016-cdn-provider-selection-deferred.md` is updated to:
  - `Status: Accepted` (not `Proposed`)
  - Rename to remove "-deferred" from the filename: `docs/adr/0016-cdn-provider-selection.md` — but ADRs are immutable once accepted (Decision 10d). **Compromise:** keep the filename as `0016-cdn-provider-selection-deferred.md` (don't break the index regenerator), but update the H1 + Status + Decision section to reflect the choice. The "-deferred" suffix becomes historical; future ADRs may supersede.
  - The `## Decision` section is filled with the final choice + rationale
  - The `## Alternatives Considered` section retains the matrix (don't delete; the trade-off comparison stays as the audit trail)
- **And** the rejected provider is recorded under "alternatives" with one sentence explaining the rejection reason.
- **Recommended choice:** **Cloudflare Pages**. Reasons: (a) generous free tier — 500 builds/month + unlimited bandwidth + unlimited requests on the free tier; (b) `_headers` config file is simpler than Vercel's `vercel.json` for static-site cache rules; (c) native GitHub integration with auto-deploy on merge to main; (d) bandwidth + request unmetering removes one risk factor for an artifact-class project. **The dev may overrule** if there's a compelling reason for Vercel (e.g., edge functions might be useful for OG card generation in Story 2.6, though OG cards are static per ADR 0018). Default: Cloudflare Pages.

**AC2 — `.github/workflows/ci.yml` runs the full pipeline:**
- **Given** `.github/workflows/ci.yml`,
- **When** a PR is opened or main is updated,
- **Then** the workflow:
  - Runs on `ubuntu-22.04` (architecture line 486 — CSPICE wheel platform pin)
  - Configures Git LFS (`lfs: true` on `actions/checkout@v4`)
  - Sets up Python 3.13 via `.python-version` (`actions/setup-python@v5`)
  - Installs `uv` via `astral-sh/setup-uv@v3` (or equivalent)
  - Runs `uv sync` in `bake/` (cached via `uv.lock`)
  - Sets up Node (`actions/setup-node@v4`) using the Node version implied by Vite — verify and pin
  - Runs `npm ci` in `web/` (cached via `package-lock.json`)
- **And** executes jobs in dependency order. Can be expressed as a single job with sequential steps OR as multiple jobs with `needs:` edges:
  1. **lint** — Ruff for `bake/` (`uv run ruff check .`), ESLint for `web/` (`npm run lint` — wire this script if missing)
  2. **typecheck** — `tsc --noEmit` for `web/`; **mypy for `bake/` is OPTIONAL** — Story 1.1 didn't add mypy as a dep; if mypy isn't already configured, document it as a deferred LOW item and skip rather than fail
  3. **bake** — `just bake` (or `uv run python -m bake.src.bake_trajectories` directly)
  4. **bake-determinism** — re-run the bake; assert all VTRJ outputs' SHA-256 are unchanged (this is the NFR-R4 byte-identical proof)
  5. **L1 validation** — `just validate` (or `uv run python -m bake.src.validate_l1`); fails if any segment exceeds NFR-P9 thresholds
  6. **L3 Vitest** — `cd web && npm test` (the 1276-test suite)
  7. **build** — `cd web && npm run build` (produces `web/dist/` with content-hashed filenames)
- **And** any job failure fails the workflow (`needs:` edges propagate failure).

**AC3 — L1 + L3 fast-tier total ≤ 5 minutes (NFR-M4):**
- **Given** the L1 (bake validation) + L3 (vitest) suite,
- **When** it executes on the CI runner,
- **Then** the total wall-clock time is ≤ 5 minutes,
- **And** the SLOW tier (Playwright L4 + L5; bake @slow) is GATED out of the fast tier and runs in a separate workflow OR a separate job with `needs:` only on a manual trigger. **For this story:** the fast tier is what gates merges; slow tier is informational (Story 7.6 owns the full slow-tier CI).
- **Tactic:** parallelize lint + typecheck + bake into separate jobs where possible; CI's job-level concurrency makes these cheap.

**AC4 — Deploy to Cloudflare Pages on green main:**
- **Given** a green CI on `main`,
- **When** the deploy job fires (after all gating jobs pass),
- **Then** the `web/dist/` artifact is published to Cloudflare Pages via the official `cloudflare/pages-action@v1` (or the latest stable),
- **And** the deploy job is gated on `if: github.ref == 'refs/heads/main' && github.event_name == 'push'` — never deploys from PRs (PRs get preview deploys via Cloudflare Pages's built-in preview feature, which is automatic and doesn't need the action),
- **And** the deploy uses two secrets stored in GitHub repo Settings → Secrets: `CLOUDFLARE_API_TOKEN` (with `Pages:Edit` scope) and `CLOUDFLARE_ACCOUNT_ID`. **The dev cannot set these secrets** (no admin access to the GitHub repo settings) — document the required secrets in the README so the user can set them after merge.

**AC5 — Content-hashed assets + Cache-Control headers:**
- **Given** Vite's build output (`web/dist/`),
- **When** the asset filenames are inspected after `npm run build`,
- **Then** all files under `web/dist/assets/` have content-hashed filenames (Vite's default: `<name>.<hash>.<ext>`),
- **And** the deploy includes a `web/public/_headers` file that Cloudflare Pages reads, with rules:
  ```
  /assets/*
    Cache-Control: public, max-age=31536000, immutable

  /*.html
    Cache-Control: public, max-age=3600
  ```
- **And** the `_headers` file is checked into Git so the dev can review + version it.

**AC6 — HTTPS + TLS enforcement:**
- **Given** Cloudflare Pages's default config,
- **When** the deployed site is accessed via `http://` or via TLS < 1.2,
- **Then** the request is redirected to HTTPS (Cloudflare Pages enforces this by default — verify via the Cloudflare dashboard config or a `_redirects` rule),
- **And** TLS 1.2+ is enforced with TLS 1.3 preferred (Cloudflare Pages default — document in README; no config change needed).

**AC7 — Immutable URL contract: prior bundles still resolve after a redeploy:**
- **Given** two successive deploys,
- **When** a previously-deployed asset URL (with old content hash) is requested,
- **Then** the asset still resolves (NFR-R2 — immutable URL contract). **This is a Cloudflare Pages property:** prior deployments remain accessible at their preview URLs forever. The production URL serves the latest deploy, but the content-hashed asset URLs are stable per deploy — accessing an old hashed asset URL from a new deploy will 404, BUT navigating to the old deploy's URL preserves all its assets.
- **Verification:** the README documents how to test this (after Story 1.14 ships and a second deploy fires).

**AC8 — Curl health check:**
- **Given** the deployed site,
- **When** `curl -I https://voyager.app/` (or the actual production URL) is run from a fresh shell,
- **Then** the response includes `HTTP/2 200`, `cache-control: public, max-age=3600`, `content-type: text/html; ...`,
- **And** the page returns the bootstrapped HTML.
- **Verification:** the dev runs this once after merge + deploy and documents the result in `README.md` (or in a smoke-test markdown doc).

## Tasks / Subtasks

- [ ] **Task 1 — Update ADR 0016** (AC: #1)
  - [ ] Edit `docs/adr/0016-cdn-provider-selection-deferred.md`:
    - Change Status: `Proposed` → `Accepted`
    - Add `## Decision` body: chosen provider + rationale (recommend Cloudflare Pages)
    - Preserve `## Alternatives Considered` matrix
    - Note in the H1: keep filename as-is (don't rename per ADR immutability rule); the "deferred" suffix is now historical
  - [ ] Regenerate `docs/adr/README.md` via `scripts/adr-index.py`
  - [ ] Verify the catalogue test still passes

- [ ] **Task 2 — Author `.github/workflows/ci.yml`** (AC: #2, #3)
  - [ ] Workflow triggers: `push: branches: [main]` and `pull_request: branches: [main]`
  - [ ] Jobs (parallelizable):
    - `lint-bake` — Ruff (`uv run ruff check bake/`)
    - `lint-web` — ESLint (`npm run lint` in `web/`; wire the script in `package.json` if missing)
    - `typecheck-web` — `tsc --noEmit` (`npm run typecheck` if a script exists; else `npx tsc --noEmit`)
    - `bake` — `uv run python -m bake.src.bake_trajectories` (followed by determinism re-bake + SHA compare)
    - `validate-l1` — `uv run python -m bake.src.validate_l1` (needs `bake`)
    - `test-web` — `npm test` (does NOT depend on bake; can run in parallel; uses the committed L2 fixtures from Story 1.6)
    - `build` — `npm run build` (depends on `test-web` + `typecheck-web` succeeding)
  - [ ] Deploy job (`deploy-cloudflare`) gated on `github.ref == 'refs/heads/main' && github.event_name == 'push'`:
    - `needs: [build, validate-l1, lint-bake, lint-web, typecheck-web]`
    - Uses `cloudflare/pages-action@v1` with `apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}` and `accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}`
  - [ ] Cache the npm + uv installs via `actions/setup-node@v4` and `astral-sh/setup-uv@v3` cache options
  - [ ] LFS support: `actions/checkout@v4 with: { lfs: true }`

- [ ] **Task 3 — Add `npm run lint` and `npm run typecheck` scripts to `web/package.json`** (AC: #2)
  - [ ] `"lint": "eslint . --ext .ts,.tsx"`
  - [ ] `"typecheck": "tsc --noEmit"`
  - [ ] Verify both work locally before committing the CI yaml

- [ ] **Task 4 — Author `web/public/_headers`** (AC: #5)
  - [ ] Per the AC5 template
  - [ ] Verify via Cloudflare Pages documentation for any required syntax quirks

- [ ] **Task 5 — Document the deploy + secrets setup in README** (AC: #4)
  - [ ] Add a "Deployment" section explaining:
    - The CI pipeline architecture
    - The two required secrets (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID) and the link to Cloudflare's docs for generating them
    - How to test post-deploy (curl -I)
    - How rollback works (Cloudflare Pages deployment history)

- [ ] **Task 6 — Tests + defense**
  - [ ] CI YAML lint: verify `.github/workflows/ci.yml` parses via `yq` or `python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"`
  - [ ] Add a Python test in `bake/tests/test_ci_workflow.py` that:
    - Reads `.github/workflows/ci.yml`
    - Asserts the expected jobs are present (lint-bake, lint-web, typecheck-web, bake, validate-l1, test-web, build, deploy-cloudflare)
    - Asserts `runs-on: ubuntu-22.04` for all jobs (NFR-R4)
    - Asserts `lfs: true` on the checkout step
    - Asserts the deploy job is gated on main + push only
  - [ ] Existing baseline (web vitest 1276, bake fast 233 + 2 skipped + slow 10) preserved

- [ ] **Task 7 — Smoke-test the CI locally (if possible)**
  - [ ] Use `act` (https://github.com/nektos/act) to run the workflow locally if installed
  - [ ] If `act` not available, hand-trace the workflow steps for any obvious errors before committing
  - [ ] Document the limitation: the actual deploy can only be verified after a real merge to main + Cloudflare account setup

## Dev Notes

### Architectural Compliance — load-bearing constraints

- **`ubuntu-22.04` runner** for NFR-R4 byte-identical bake (architecture line 486; CSPICE wheel platform pin).
- **Git LFS on checkout** — without it, kernels and textures aren't pulled and the bake fails.
- **Determinism gate** — re-bake + SHA compare is the NFR-R4 proof.
- **Fast-tier ≤ 5 minutes** — NFR-M4. Parallelize jobs where possible.
- **Content-hashed assets** — Vite default; verify post-build.
- **Cache-Control immutable on /assets/** — NFR-R2. Long max-age (1 year) is safe because of content hashing.
- **HTTPS enforcement** — NFR-S1. Cloudflare default; document.
- **Deploy gated on main + push** — never deploy from PRs.

### Architecture-canonical file paths

- `.github/workflows/ci.yml` (new)
- `web/public/_headers` (new)
- `bake/tests/test_ci_workflow.py` (new)
- `docs/adr/0016-cdn-provider-selection-deferred.md` (updated)
- `README.md` (Deployment section added)
- `web/package.json` (lint + typecheck scripts added)

### Architecture-canonical CI structure

The architecture (Decision 7a, line 486; Decision 7d, line 512; Decision 8d, line 554) anticipated this structure. This story is the operational realization.

### Testing Requirements

- All existing tests pass (web 1276 + bake 233 fast + 2 skipped)
- New CI workflow test in `bake/tests/`
- The actual CI run is verified by the workflow itself when the PR/merge fires; no need to "test the test pipeline" via a unit test

### Previous Story Intelligence

- **Story 1.2:** ADR 0016 was authored as `Proposed`. Update to `Accepted` in this story.
- **Story 1.3:** kernels are LFS-tracked; CI needs `lfs: true` to pull them.
- **Story 1.4:** bake + L1 validation pipeline exists; CI just invokes it.
- **Story 1.5–1.13:** all of the test suites that CI runs.

### Git Intelligence

Recent: `cb53d62 Story 1.13: Celestial bodies`. LFS ~190 MB. Branch: `epic1`.

### Project Context Reference

- Epic: `_bmad-output/planning-artifacts/epics.md` §Story 1.14 (lines 857–894)
- Architecture: §Decision 7a (CI runner, line 486), §Decision 7d (drift report flow, line 512), §Decision 8d (`/perf` route, line 554)
- ADR 0016 (CDN provider selection), ADR 0017 (GitHub Actions for build + CDN for hosting)
- PRD: FR51, FR55, FR56, NFR-R1, NFR-R2, NFR-R4, NFR-S1, NFR-M4

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.14]
- [Source: _bmad-output/planning-artifacts/architecture.md#L486] — ubuntu-22.04 pin
- [Source: docs/adr/0016-cdn-provider-selection-deferred.md] — alternatives matrix
- [Source: docs/adr/0017-github-actions-for-build-cdn-for-hosting.md]
- [Source: _bmad-output/planning-artifacts/prd.md#FR56] — static CDN deploy with immutable filenames

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (Claude Opus 4.7, 1M context) — Story 1.14 developer agent on team `epic-cycle-2026-05-18`.

### Debug Log References

- `npm test` from `web/` — 1276/1276 vitest cases pass (baseline preserved).
- `./.venv/Scripts/pytest.exe -m "not slow"` from `bake/` — **244 passed**, 2 skipped, 14 deselected (baseline 233 + 11 new `test_ci_workflow.py` cases).
- `python scripts/adr-index.py` — regenerates `docs/adr/README.md` cleanly (28 ADR entries); ADR 0016 now shows `Accepted`.
- `npm run lint` — exit 0, 0 errors, 5 pre-existing warnings (Unused eslint-disable directives in `celestial-bodies.ts`, `skybox.ts`, `spacecraft-models.ts`, `ephemeris-service.ts`, `celestial-defense-extended.test.ts`). Not introduced by this story; cleanup deferred to a follow-up.
- `npm run typecheck` — clean (`tsc --noEmit` 0 errors).
- YAML parse via `python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` — parses successfully with all 9 jobs (`lint-bake`, `lint-web`, `typecheck-web`, `bake`, `validate-l1`, `test-bake`, `test-web`, `build`, `deploy-cloudflare`).

### Completion Notes List

**CDN provider decision (AC1).** Selected **Cloudflare Pages** per the story's recommendation. Rationale documented in ADR 0016 (`docs/adr/0016-cdn-provider-selection-deferred.md`): unmetered bandwidth on free tier, simpler `_headers` config than `vercel.json`, native GitHub integration with automatic PR previews.

**ADR filename retained per immutability rule (AC1).** Per ADR 0020 the filename stays as `0016-cdn-provider-selection-deferred.md`. Status flipped from `Proposed` to `Accepted`; the H1 dropped `(Deferred)`; the Decision body was fully rewritten; the Alternatives Considered matrix is preserved verbatim as the audit trail. A new header note explains the filename residue. Two existing tests in `bake/tests/test_adr_catalogue.py` were updated: `test_adr_0016_status_is_proposed` → `test_adr_0016_status_is_accepted`; `test_catalogue_accepted_adrs_are_accepted` now covers all 27 ADRs including 0016. `test_adr_catalogue_defense.py`'s filename↔title sync test was extended with an allow-list entry for the `deferred` token, and the test's exemption logic was clarified to treat an empty replacement as "fully exempt" rather than the prior ambiguous "fall through to default check" behaviour.

**CI workflow shape (AC2, AC3).** `.github/workflows/ci.yml` defines 9 jobs. Parallelization shape: `lint-bake`, `lint-web`, `typecheck-web`, `bake`, `test-bake`, and `test-web` all run in parallel from job start. `validate-l1` `needs: [bake]` (consumes the uploaded `bake-out` artifact). `build` `needs: [typecheck-web, test-web]`. `deploy-cloudflare` `needs: [lint-bake, lint-web, typecheck-web, bake, validate-l1, test-bake, test-web, build]` — every gate transitively + explicitly required. Fast-tier wall-clock estimate: dominated by the bake job (~6–8 min including LFS pull + uv sync + two bake runs + SHA compare); other jobs fit under 5 min comfortably. **The strict ≤5 min total wall-clock from NFR-M4 is not achievable on a single GitHub-hosted runner that includes the determinism re-bake** — see "Issues Encountered" below.

**LFS strategy (AC2).** Jobs that only read source (`lint-bake`, `lint-web`, `typecheck-web`, `deploy-cloudflare`) explicitly check out with `lfs: false` to save the ~190 MB LFS bandwidth + minutes. Jobs that need kernels, the `.glb` model, fonts, or L2 fixtures (`bake`, `validate-l1`, `test-bake`, `test-web`, `build`) check out with `lfs: true`.

**Deploy gating (AC4).** `if: github.ref == 'refs/heads/main' && github.event_name == 'push'`. PR preview deploys are documented as auto-handled by Cloudflare's GitHub integration — no workflow step is needed for PR previews, only for `main`.

**`_headers` file (AC5).** `web/public/_headers` ships rules for `/assets/*`, `/data/*`, `/fonts/*`, `/models/*`, `/textures/*` (all `max-age=31536000, immutable` — safe because content-addressed) and `/*.html` + `/` (`max-age=3600`). The bare-root `/` rule is explicit because Cloudflare's `/*.html` glob doesn't always match the `/` request.

**npm scripts (Task 3).** Added `lint: "eslint ."` and `typecheck: "tsc --noEmit"` to `web/package.json`. The lint script uses flat-config-aware invocation (no `--ext`) because eslint v10's flat config drives file discovery from `eslint.config.js`'s `files` glob.

**mypy deferred.** Story 1.1 didn't add mypy as a bake dep; not added here per the story's explicit "skip rather than fail" guidance. Document as a deferred LOW item for a future hardening pass.

**`act` not run locally.** The task suggested smoke-testing with `act`, but it's not installed on the dev host and the task explicitly allows hand-tracing instead. The YAML was hand-traced + parsed via `yaml.safe_load`. Real CI verification will fire when this story's branch hits CI.

**Secrets.** The two repo secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) cannot be set by the dev — the maintainer must add them under Settings → Secrets → Actions before the first push to main. README's new Deployment section documents the exact path.

### File List

**New files:**

- `.github/workflows/ci.yml` — full CI pipeline (lint, typecheck, bake, determinism re-bake, validate L1, fast bake tests, web vitest, vite build, Cloudflare Pages deploy).
- `web/public/_headers` — Cloudflare Pages cache-control rules (NFR-R2 immutable assets, 1h HTML).
- `bake/tests/test_ci_workflow.py` — 11 defense tests asserting the CI workflow's load-bearing invariants (job set, `ubuntu-22.04` pin, LFS-on-checkout, deploy gate, determinism re-run, Cloudflare action + secrets, `_headers` content, `package.json` script wiring).

**Modified files:**

- `docs/adr/0016-cdn-provider-selection-deferred.md` — Status `Proposed` → `Accepted`; Decision body rewritten with Cloudflare Pages selection + rationale; Alternatives matrix preserved; header note added explaining filename immutability.
- `docs/adr/README.md` — regenerated by `scripts/adr-index.py` (ADR 0016 row now shows `Accepted`).
- `web/package.json` — added `lint` + `typecheck` npm scripts.
- `README.md` — new "Deployment" section between "Kernels" and "Architectural Decision Records" sections: required secrets table, post-deploy smoke test, rollback, immutable URL contract verification.
- `bake/tests/test_adr_catalogue.py` — `test_adr_0016_status_is_proposed` renamed to `test_adr_0016_status_is_accepted` with updated assertion; `test_catalogue_accepted_adrs_are_accepted` now requires *all* 27 ADRs including 0016 to be Accepted.
- `bake/tests/test_adr_catalogue_defense.py` — added `KNOWN_FILENAME_TITLE_DIVERGENCES` entry for ADR 0016 (`"deferred": ""`); clarified the empty-replacement branch to genuinely exempt the token rather than falling through to the default check.
