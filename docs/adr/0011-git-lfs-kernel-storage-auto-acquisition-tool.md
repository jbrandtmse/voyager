# ADR 0011 — Git LFS for Kernel Storage + Auto-Acquisition Tool for Population

Status: Accepted
Date: 2026-05-18
Deciders: Voyager project maintainer

## Status

Accepted. NAIF SPICE kernels live under `kernels/` tracked by Git LFS. `bake/src/acquire_kernels.py` is the only authorized way to populate that directory.

## Context

NAIF SPICE kernels (SPK, CK, PCK, LSK, FK) are 10s to 100s of MB each, totaling ~1–3 GB across the Voyager mission set. They are:

- Binary, non-human-readable, non-diffable.
- Public-domain or attribution-only — no licensing barrier to redistribution.
- Slowly evolving — NAIF publishes refinements occasionally, not on a schedule.
- Mission-critical for byte-identical bake reproducibility (NFR-R4).

Three storage strategies were considered:

1. **Plain Git** — kernels checked into the repo as regular files. Repo bloats to GB-scale; clones become slow; `git log` includes binary churn.
2. **`.gitignored` + CI-fetched** — kernels never tracked; CI runs `acquire_kernels.py` on each build. Reproducibility requires NAIF URLs and SHA-pinning; fresh clones cannot bake without the network.
3. **Git LFS** — kernels tracked by path patterns; large objects live in LFS storage; clones use `git lfs pull` to fetch them bit-exact.

The hands-off-maintenance commitment forbids any "manually download these files into kernels/" step.

[Source: _bmad-output/planning-artifacts/architecture.md#Decision-1a]
[Source: _bmad-output/planning-artifacts/architecture.md#Automated-Asset-Acquisition]

## Decision

**Git LFS for storage, auto-acquisition tool for population.**

- Kernels live under `kernels/` tracked by Git LFS via `.gitattributes` (`*.bsp`, `*.bc`, `*.tf`, `*.tsc`, `*.tls`, `*.pck`).
- `bake/src/acquire_kernels.py` reads `kernels/kernels-manifest.json` (URL + SHA-256 per kernel) and fetches from NAIF / PDS Rings Node. Idempotent (no-op if SHA matches).
- A fresh clone runs `git lfs pull` for bit-exact kernel retrieval. CI runs `just acquire` to verify LFS-tracked files SHA-match the manifest before bake.
- A kernel update is a PR that updates one `expected_sha256` entry; CI auto-runs `just acquire`, `just bake`, `just drift-report`; merge produces a new bake.

**Manual download-and-commit is forbidden as a workflow.** The acquisition tool is the only blessed path.

## Consequences

**Positive:**
- Bit-exact reproducibility from a fresh clone (NFR-R4).
- Onboarding a contributor (or future-self after a long break) reduces to `git clone && just bootstrap`.
- The kernel-update operational flow (NFR-M2 ≤30 min) is a small PR with CI doing the heavy lifting.
- LFS handles repo-size sanity: regular `git clone` is fast; `git lfs pull` is the explicit kernel-fetch step.

**Negative:**
- Git LFS quota: GitHub's free tier offers 1 GB storage + 1 GB/month bandwidth. The kernel set may exceed this; LFS data packs / GitHub paid tier ($5/month for 50 GB storage) is acceptable per the cost analysis (≤$15/year operating budget).
- Contributors must have Git LFS installed locally. Acceptable: documented in the README; LFS is a one-time `git lfs install` per machine.
- The `acquire_kernels.py` tool must handle NAIF's FTP and PDS Rings Node HTTP endpoints. The retry/cache/SHA-verify pattern is shared across all `acquire_*.py` scripts (per architecture Category 9).

**Obligations on downstream stories:**
- `.gitattributes` declares LFS patterns for the kernel extensions (already in place from Story 1.1).
- `bake/src/acquire_kernels.py` is implemented in Epic 2 / Story 2.x with retry, SHA verification, and idempotent behavior.
- `kernels/kernels-manifest.json` is the authoritative kernel inventory; any kernel update PR touches this file plus the LFS-tracked kernel.
- CI runs `just verify-acquired` to SHA-check LFS-tracked files against the manifest.

## Alternatives Considered

- **Plain Git (kernels in repo).** Rejected: GB-scale repos break clone times, GitHub's 100 MB per-file limit, and meaningful diff/blame on binaries is impossible.
- **`.gitignored` + CI-fetched at build time.** Rejected: fresh clones cannot bake offline; NAIF availability becomes a runtime build dependency; bake determinism is harder to verify when the inputs are re-fetched on every CI run.
- **Cloud object store (S3, Cloudflare R2) for kernels.** Rejected: introduces a third-party service with auth and billing for what Git LFS already solves. The `acquire_*.py` tools could in principle fetch from a private bucket, but using NAIF + PDS Rings Node directly is the canonical source.
- **Tarball release artifacts attached to GitHub releases.** Rejected: still requires a manual or scripted fetch; LFS gives the same outcome with a `git clone` UX that contributors already know.
