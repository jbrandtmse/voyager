# ADR 0017 — GitHub Actions for Build + CDN for Hosting

Status: Accepted
Date: 2026-05-18
Deciders: Voyager project maintainer

## Status

Accepted. The CI/CD pipeline runs on GitHub Actions (`ubuntu-22.04`); the CDN (provider deferred per ADR 0016) hosts the resulting `web/dist/` artifact.

## Context

A static-CDN architecture (NFR-Sc1) decouples build from hosting. The question is what runs the build and what runs the deploy:

- A CDN's built-in builder (Cloudflare Pages or Vercel) could in principle run the bake + build directly, but couples CI logic to the provider and limits LFS / determinism control.
- A general-purpose CI (GitHub Actions, GitLab CI, CircleCI) gives full environment control and stays portable across CDN providers.

The architecture's deterministic-bake commitment (NFR-R4 byte-identical, linux/amd64-pinned CSPICE wheels) plus the LFS-tracked kernel inventory (ADR 0011) point firmly at GitHub Actions.

[Source: _bmad-output/planning-artifacts/architecture.md#Decision-7a]
[Source: _bmad-output/planning-artifacts/architecture.md#Decision-7c]
[Source: _bmad-output/planning-artifacts/architecture.md#Decision-7e]
[Source: _bmad-output/planning-artifacts/architecture.md#Decision-7f]

## Decision

**CI runner: GitHub Actions, `ubuntu-22.04`.**

- Native Git LFS support (`actions/checkout@v4` with `lfs: true`).
- 2,000 free min/mo (private repo) / 3,000 (Pro) / unlimited (public).
- Deterministic build image; matches linux/amd64 pinning for CSPICE wheel reproducibility.

**Single workflow, sequential job graph by data dependency:**

```text
on: [push to main, pull_request]
job: validate-build-deploy (ubuntu-22.04)
  1.  Checkout (with LFS)
  2.  Setup Python 3.13 + uv          (cached)
  3.  Setup Node 22 + npm             (cached)
  4.  uv sync                         (Python deps from lockfile)
  5.  npm ci                          (Node deps from lockfile)
  6.  just verify-acquired            (SHA-verify LFS-tracked assets vs manifest)
  7.  just lint                       (ruff + eslint + prettier; fail-fast)
  8.  just bake                       (Python bake → VTRJ binaries + manifest)
  9.  just bake-determinism           (re-bake, verify byte-identical; NFR-R4)
  10. just test-fast                  (L1+L2+L3; ≤5 min budget; NFR-M4)
  11. just build                      (vite build → web/dist/)
  12. just og-cards                   (Playwright → web/dist/og/*.png)
  13. just test-slow                  (L4+L5; ≤15 min budget; NFR-M4)
  14. just build-manifest             (emit build-manifest.json artifact; NFR-M5)
  15. just deploy                     (only on main; CDN provider CLI)
```

**Deploy gates** (FR55, FR56, FR58):

- Deploys only from `main`.
- Deploys only after every prior step is green.
- Rollback: `just rollback <deployment-id>` invokes the CDN provider's rollback API; previous deployment becomes active without rebuild (NFR-R3 ≤5 min).

**Caching strategy** (NFR-R2):

- All built assets use content-hashed immutable filenames (`voyager-lod0.{hash}.glb`, `v1_1977-1987.{hash}.bin.br`).
- `Cache-Control: public, max-age=31536000, immutable`.
- HTML and entry-point JS use 1-hour TTL so deploys propagate quickly.
- Configured via `_headers` (Cloudflare) or `vercel.json` `headers:` block (Vercel) — provider choice deferred per ADR 0016.

## Consequences

**Positive:**
- LFS-native checkout: kernels arrive bit-exact in CI without a separate fetch step.
- Deterministic environment: pinned Python patch version, pinned Node version, pinned uv.lock and package-lock.json.
- Provider-agnostic deploy: switching CDN provider is a step-15 change, not a workflow rewrite.
- Cost: $0 for public repos; covered by the ≤$15/year operating budget either way.
- Single workflow makes the data-dependency DAG visible top-to-bottom.

**Negative:**
- 2,000 free min/mo cap on private repos. Mitigation: the project is intended for public-repo OSS posture; if it ever moves private, the cap is generous for solo development.
- Single ubuntu-22.04 image — Windows/macOS CI is not run because CSPICE wheels are linux/amd64-pinned anyway (Decision 1d). Cross-platform regression on the runtime side is caught by Playwright running headless Chromium on the same image.

**Obligations on downstream stories:**
- Story 1.4 introduces the justfile that this workflow invokes.
- The CI workflow file (`.github/workflows/ci.yml`) is authored in Epic 7 / Story 7.x; until then, individual steps may be run locally via `just <step>`.
- The deploy step (15) is a provider-specific CLI invocation that lands when ADR 0016 is resolved.

## Alternatives Considered

- **Run build inside Cloudflare Pages / Vercel build environment.** Rejected: couples CI to provider; LFS support varies; bake-determinism harder to verify; provider can change build-environment behavior unilaterally.
- **GitLab CI.** Rejected: the repo lives on GitHub; moving CI to GitLab introduces a cross-platform mirror operation for no benefit.
- **CircleCI / Buildkite.** Rejected: free-tier limits comparable or worse than GitHub Actions; LFS support is fine but the integration story with the repo is one step further.
- **Self-hosted runner.** Rejected: violates hands-off-maintenance (NFR-M6).
- **Matrix builds across multiple OS.** Rejected: CSPICE wheel reproducibility pins us to linux/amd64; matrix doesn't add coverage for the workload that matters.
