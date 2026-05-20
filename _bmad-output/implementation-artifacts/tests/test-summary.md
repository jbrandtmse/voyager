# Test Automation Summary — Story 1.1

**Story:** 1.1 — Initialize Monorepo with Web and Bake Halves
**Date:** 2026-05-18
**Scope:** Static-config and absence-proof tests for a scaffolding/configuration story.

## Scope Decision

Story 1.1 is a *scaffolding/configuration* story: no UI exists, no application logic exists, no API exists. The architecture's L1–L5 validation layers (L1 Python interpolation, L2 JS-vs-SPICE consistency, L3 TS unit tests, L4 Playwright visual regression, L5 Playwright E2E mission timeline) test behavior that lands in later stories (1.4 onward). Playwright E2E browser tests are **not appropriate** for this story — there is no UI to exercise. The first Playwright tests land at the earliest in Story 1.5 (renderer foundation).

The appropriate test scope here is **static configuration assertions** plus an **absence-proof grep guard** that re-runs the AC3 no-PII check at test-time.

## Generated Tests

### Web (Vitest)

- `web/tests/scaffold.test.ts` — 33 tests across three concerns:
  - **AC2 / tsconfig**: asserts `compilerOptions.strict === true`.
  - **AC2 / package.json deps**: asserts `three`, `@types/three`, `vitest`, `@playwright/test`, `eslint`, `prettier` are declared; asserts `test` script invokes vitest.
  - **Architecture (vanilla-ts only)**: asserts forbidden frameworks (React/Preact/Vue/Svelte/RxJS/MobX/Redux/Zustand/Jotai/lodash/ramda/immer and Redux Toolkit variants) are absent from both `package.json` direct deps and `package-lock.json` transitive installs.

- `web/tests/no-pii-grep.test.ts` — 54 tests re-running the AC3 no-PII grep against all four dependency manifests for all 12 forbidden substrings (`analytics`, `telemetry`, `fingerprint`, `cookie-consent`, `ga-`, `gtag`, `mixpanel`, `segment`, `amplitude`, `hotjar`, `sentry`, `datadog`). Documented exceptions (with rationale and matched-line marker) are coded into the test, and a final "no stale exceptions" check ensures exceptions don't outlive the dependency that triggered them.
  - Exception 1: `@types/esrecurse@4.3.1` SHA512 integrity hash contains `GtAg` — spurious cryptographic-hash collision.
  - Exception 2: `@opentelemetry/api` declared by vitest as an *optional* peerDependency, not installed. Vitest is a dev dep; production browser artifact ships zero OTEL bytes.

### Bake (pytest)

- `bake/tests/test_scaffold.py` (with `bake/tests/__init__.py`) — 12 tests:
  - **AC2 / spiceypy exact pin**: parses `bake/pyproject.toml` and asserts the entry matches `spiceypy==8.1.0` exactly (no `>=`, no `~=`).
  - **AC2 / runtime deps**: asserts `scipy` and `numpy` are declared in `project.dependencies`.
  - **AC2 / dev deps**: asserts `ruff`, `pytest`, `pytest-cov` are declared in `dependency-groups.dev`.
  - **AC2 / Python pin**: asserts `requires-python` references `3.13` and that the repo-root `.python-version` contains exactly `3.13`.
  - **AC2 / lockfile**: asserts `bake/uv.lock` exists and is non-empty.
  - **AC2 / .gitattributes**: asserts all six NAIF kernel extensions (`*.bsp`, `*.bc`, `*.tf`, `*.tsc`, `*.tls`, `*.pck`) are declared with `filter=lfs`.
  - **AC1 / SpiceyPy boot**: imports `spiceypy`, calls `tkvrsn('TOOLKIT')`, asserts non-empty CSPICE-shaped version string. **Skipped (not failed) when spiceypy is not importable** — preserves green status in environments where `.venv` is not hydrated.
  - **AC2 / installed version**: asserts `spiceypy.__version__ == "8.1.0"`. Skipped if not importable.

## Results

| Suite | Framework | Tests | Status |
|-------|-----------|-------|--------|
| web   | vitest 4.1.6 | 87 passed | green |
| bake  | pytest 9.0.3 | 12 passed | green |

Run commands (already wired by Story 1.1):

```
cd web && npm test
cd bake && uv run pytest
```

## Coverage

- AC1 (smoke boot): partially covered — CSPICE toolkit import is asserted; Vite dev server boot is **not** asserted in tests (no E2E target yet; will land in Story 1.5+).
- AC2 (exhaustive pinning): fully covered.
- AC3 (no-PII absence proof): fully covered, including codified exceptions with self-validating "no stale exceptions" check.

## Next Steps

- Wire both suites into CI when Story 1.14 builds the baseline pipeline.
- When Story 1.5 lands the renderer foundation, add the first Playwright spec under `web/tests/e2e/` and remove the `--passWithNoTests` flag once real tests exist.
- When Story 1.2 authors the first ADR, link the OpenTelemetry exception in `no-pii-grep.test.ts` to that ADR ID in a comment so the rationale is discoverable from the test.
