# Contributing to Voyager

This file collects process-level conventions for the Voyager repo that aren't natural fits for an ADR (architectural decisions live under [`docs/adr/`](docs/adr/)) or for the per-story BMAD planning artifacts. If a topic has an ADR, the ADR is the source of truth — this document only covers cross-cutting workflow rules.

## Git LFS additions

NAIF SPICE kernels, planetary textures, and spacecraft GLB models are tracked by Git LFS per [ADR 0011](docs/adr/0011-git-lfs-kernel-storage-auto-acquisition-tool.md) (kernel storage strategy) and the patterns declared in [`.gitattributes`](.gitattributes). Adding to the LFS footprint has clone-time and CDN-bandwidth implications that are easy to under-budget at story-planning time, so this section documents the disclosure and pre-clearance bar.

### Current footprint

As of 2026-05-23, the repo's LFS footprint is **74 files / ~2.5 GB**, dominated by three single-file outliers from the Story 4-11 satellite SPK procurement pass:

| File | Size | Story |
| --- | --- | --- |
| `kernels/jup365.bsp` | ~1.1 GB | Story 4-11 (Jupiter satellite SPK) |
| `kernels/sat441.bsp` | ~662 MB | Story 4-11 (Saturn satellite SPK) |
| `kernels/ura184_part-3.bsp` | ~387 MB | Story 4-11 (Uranus satellite SPK) |

The remainder of the footprint is one to two-MB-class planetary textures (PNG / KTX2 / JPG sources under `web/public/textures/` and `web/textures-src/`), tens-of-MB-class lower-precision SPK kernels under `kernels/`, ~1.7 MB of spacecraft GLB models, and ~120 KB of subsetted woff2 typography.

To audit the current footprint locally:

```bash
git lfs ls-files -s
# Total in bytes:
git lfs ls-files -s | awk '
  { match($0, /\(([0-9.]+) (KB|MB|GB|B)\)/, a)
    s=a[1]+0; u=a[2]
    if(u=="GB") s*=1024^3; else if(u=="MB") s*=1024^2; else if(u=="KB") s*=1024
    t+=s; c++ }
  END { printf "files=%d total=%.1f MB (%.2f GB)\n", c, t/1024/1024, t/1024^3 }'
```

### Disclosure threshold (sprint-planning pre-clearance)

Any story planning to add LFS-tracked content above either of the following thresholds **must** disclose the planned addition at `/bmad-create-story` time:

- **Per-story total:** > **500 MB** across all files the story adds.
- **Single file:** > **250 MB** for any individual file.

Disclosure means a line in the story's Dev Notes section naming the planned additions, the estimated per-file sizes, the total, and the rationale (which fidelity tier or content gap the additions close). Example:

> _LFS additions: this story acquires the `sat441` Saturn satellite SPK kernel (~662 MB) and the `mar097` Mars satellite SPK kernel (~14 MB) to render Phobos/Deimos during the V1 Mars flyby reconstruction. Total ≈ 676 MB._

A story that crosses the threshold without disclosing it at planning time is a process violation (sibling to Rule 2 / Rule 5 — the production-vs-implementation gap should never be discovered during dev or review).

The thresholds were calibrated from Story 4-11's 2.3 GB satellite SPK pass, which was originally estimated as 100–500 MB. The single-file 387 MB outlier (`ura184_part-3.bsp`) is the canonical "above-threshold single file" example; the 1.1 GB `jup365.bsp` is the canonical "above-threshold total" example. Both were essential to the story (no smaller variant available from NAIF/PDS), but the lack of pre-disclosure left the procurement-doubled-footprint cost as a Story 4-11 retrospective lesson.

A disclosure is **not** a veto. The maintainer reviews the rationale and either pre-clears the addition or proposes an alternative (smaller kernel, lower-resolution texture, deferred to a later story). The point is to make the cost visible at the cheapest point in the cycle — planning, not dev — so the calibration data lives in the story file rather than scattered across cycle logs.

### Clone-time options for contributors

A fresh clone of this repo defaults to `git lfs install` (per ADR 0011's hands-off-maintenance commitment) and downloads the full LFS footprint. For contributors who only need the source code (e.g., dev-mode work that doesn't bake kernels or render high-resolution textures), skip the LFS smudge filter:

```bash
# Skip LFS download at clone time:
GIT_LFS_SKIP_SMUDGE=1 git clone https://github.com/<org>/voyager.git
cd voyager
# Later, selectively fetch what you need:
git lfs pull --include='kernels/de440.bsp'      # just the JPL ephemeris
git lfs pull --include='web/public/textures/*'  # just the rendered textures
# Or fetch everything:
git lfs pull
```

Selective `--include` patterns are the right answer for narrow workflows (Web-only contributor → `web/public/**`; bake-only contributor → `kernels/de440.bsp` + the per-spacecraft SPKs they're touching). The CI bake job runs `git lfs pull` unconditionally to honour ADR 0011's bit-exact reproducibility commitment — local contributors choose their own tier.

The standard `bake/src/acquire_kernels.py` tool (per ADR 0011) re-fetches kernels from NAIF / PDS Rings Node by SHA; running it after `GIT_LFS_SKIP_SMUDGE=1` produces a bit-identical local kernel set without ever touching LFS bandwidth. This is the recommended path for contributors who do bake work but want to avoid the LFS quota cost.

### LFS quota awareness

GitHub's LFS quota is **1 GB storage + 1 GB/month bandwidth** on the free tier; GitHub Pro / Team / Enterprise plans get more. The current 2.5 GB footprint already exceeds the free-tier storage budget — the project assumes GitHub LFS data packs (or a paid plan) per ADR 0011's cost analysis (≤$15/year). Any LFS addition that pushes the footprint past a 5 GB ceiling (the next data-pack tier) is automatically a pre-clearance trigger regardless of the per-story / per-file thresholds above.

### Cross-references

- [ADR 0011 — Git LFS for kernel storage + auto-acquisition tool](docs/adr/0011-git-lfs-kernel-storage-auto-acquisition-tool.md): why kernels live in LFS at all; canonical fetch path.
- [`.gitattributes`](.gitattributes): the authoritative pattern list of what's LFS-tracked (kernels, textures, GLBs, woff2 typography).
- [`_bmad/custom/voyager-skill-rules.md`](_bmad/custom/voyager-skill-rules.md) Rule 12: this policy is cross-referenced from the BMAD `bmad-create-story` rule pack so the disclosure obligation surfaces at planning time.

## Visual validation

Voyager ships an L4 Playwright visual-regression suite under `web/tests/visual/` with baselines committed to `web/tests/visual/__snapshots__/`. Updating those baselines via Playwright's `--update-snapshots` flag is a load-bearing workflow — done wrong, it captures-in latent layout defects (the Epic 5 BUG-E5-007 class of failure) because pixel-diff vs. self is clean when both sides are broken in the same way.

The full discipline — when `--update-snapshots` is the right answer, the AC1-cross-check vitest pattern that pins timing semantics, the pre-update verification gate, and the commit-evidence pattern — is documented at [`docs/visual-validation/update-snapshot-discipline.md`](docs/visual-validation/update-snapshot-discipline.md). Read it before running `npm run test:visual:update`.

Story 6.0's [`web/tests/build-dist-layout.test.ts`](web/tests/build-dist-layout.test.ts) is the canonical production-build layout regression gate that pairs with the visual suite — run it (or its parent vitest sweep) before any baseline update so the BUG-E5-007 defect class cannot re-enter the committed baselines.
