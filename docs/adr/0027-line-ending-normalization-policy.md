# ADR 0027 — Line-Ending Normalization Policy

Status: Accepted
Date: 2026-05-18
Deciders: Voyager project maintainer

## Status

Accepted. The repository enforces LF line endings via `.gitattributes` (`* text=auto eol=lf`). Windows contributors see Git auto-normalization on checkout; the canonical in-repo and on-CI line ending is LF.

## Context

Story 1.1's commit (414db52, 2026-05-18) emitted Git warnings on Windows: `LF will be replaced by CRLF` for `.gitignore` and `README.md`. Without an explicit policy, Git's `core.autocrlf` setting (which varies across developer machines and OS defaults) decides what ends up in the repo — a recipe for noisy diffs, mixed-line-ending files, and reproducibility breakage.

The bake side commits to NFR-R4 byte-identical bake reproducibility on linux/amd64 CI. CI runs on linux (LF-native). A repo that's a mix of CRLF and LF endings makes byte-equality assertions ambiguous and produces gratuitous churn in diffs across platforms.

[Source: _bmad-output/implementation-artifacts/deferred-work.md] (item: ".gitattributes lacks text=auto / EOL normalization")
[Source: _bmad-output/planning-artifacts/prd.md#NFR-R4] (byte-identical bake reproducibility)

## Decision

**Enforce LF line endings via `.gitattributes`:**

```
* text=auto eol=lf
```

(Added at the top of `.gitattributes`, above the existing LFS patterns.)

- `text=auto` — Git auto-detects text vs binary files.
- `eol=lf` — text files are normalized to LF in the repo and on checkout, regardless of the contributor's OS or `core.autocrlf` setting.

CI runs on linux/amd64 (LF-native), so the on-CI state matches the in-repo state byte-for-byte.

## Consequences

**Positive:**
- Single canonical line ending across the repo, regardless of contributor OS.
- No more `LF will be replaced by CRLF` warnings on Windows.
- Diffs stay clean across platforms — no cross-platform PR churn.
- NFR-R4 byte-identical bake is unambiguous: bake inputs have a single canonical encoding.
- LFS-tracked binary patterns (kernels) continue to work; `text=auto` correctly identifies them as binary.

**Negative:**
- Windows contributors using tools that *only* tolerate CRLF (rare in 2026 — most editors auto-detect) may need to configure their editor for LF. Mitigated by the universal `text=auto eol=lf` behavior in modern editors (VS Code, Visual Studio, Notepad++, IDEs).
- Existing files with CRLF will be normalized on next touch; this can cause a one-time "normalize line endings" churn commit. Mitigated by adding the rule before significant content lands in the repo (Story 1.2 is early; this is the right time).

**Obligations on downstream stories:**
- `.gitattributes` is updated in this story (Task 4 of Story 1.2) — the `* text=auto eol=lf` line is added above the existing LFS patterns.
- Future contributors are not required to take any action; Git handles normalization on checkout.
- If a story ever needs to commit a CRLF-encoded test fixture (e.g., a Windows-formatted text artifact for round-trip testing), that file can opt out via `<path> -text` in `.gitattributes`.

## Alternatives Considered

- **Do nothing (leave `.gitattributes` without an EOL rule).** Rejected: relies on each contributor's `core.autocrlf` setting; produces mixed-encoding repos; defeats the byte-identical bake commitment for any text input.
- **Lock to CRLF (`* text=auto eol=crlf`).** Rejected: CI runs on linux/amd64 (LF-native); CRLF in-repo would force on-CI conversion before every text-input read; the linux/amd64 pinning was made specifically to keep the CI environment simple.
- **Per-file rules (only mark specific files).** Rejected: a global rule is easier to reason about; new files added in future stories pick up the policy automatically.
- **`core.autocrlf=true` in a `.gitconfig` committed to the repo.** Rejected: Git ignores in-repo `.gitconfig` files for security reasons; `.gitattributes` is the standards-track way to do this.
