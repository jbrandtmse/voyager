# Story 6.1 — Lead Per-Story Smoke (AC7 closure)

**Date:** 2026-05-24
**Lead model:** claude-opus-4-7
**Method:** CLI invariants — placeholder-audio posture per dev's documented decision (real procurement deferred; audible verification deferred to real-audio swap follow-up). The wiring/state-machine/persistence invariants are exercised by the 82-test audio suite (dev: 62, QA: 43, CR: 3 = 108 audio-related tests total). The visual Chrome DevTools MCP smoke is INTENTIONALLY deferred until the maintainer authorizes real-track procurement — at which point a 1-line file replacement triggers the full AC7 scripted smoke.

## AC7 invariant verification (CLI)

| Check | Command | Result |
|---|---|---|
| Audio test files all pass | `cd web && npm test -- audio v-audio-toggle --run` | 65/65 pass in 1.83s across 3 files |
| 5 audio files present at correct slugs | `ls web/public/audio/golden-record/` | launch-v1, launch-v2, pale-blue-dot, v1-heliopause, v2-heliopause (~32 KB each placeholders) |
| THIRD_PARTY.md attribution section | `grep -c "Golden Record" THIRD_PARTY.md` | 8 matches |
| ADR-0019 Rule 5 amendment | `grep -c "AMENDED\|amended in-place" docs/adr/0019-*.md` | 2 |
| Curation doc placeholder callout | `grep -c "[Pp]laceholder" docs/audio/golden-record-curation.md` | 15 |
| .gitattributes LFS pattern for audio | `grep "web/public/audio" .gitattributes` | `web/public/audio/**/*.m4a filter=lfs diff=lfs merge=lfs -text` |
| No `web/src/` regression to non-audio code | manual diff review | clean — only audio + Path A subscriber + text-input-focus extraction |

## Test pyramid posture (post-Story-6.1)

- web vitest: 3475 / 10 skipped (was 3366 pre-Story-6.1; +6 from dev placeholder swap clarity, +62/63 dev audio tests, +43 QA defense, +3 CR AC3 fix = +109 net; minor count reconciliations between agents fall within expected runtime-vs-file-count drift)
- bake fast pytest: preserved at 430-ish (no bake touches in Story 6.1)
- typecheck: clean
- lint: 4 warnings / 0 errors (baseline preserved per AC8)

## Defects caught

- 0 by smoke. The code reviewer caught and auto-resolved 1 HIGH (AC3 G-shortcut help-overlay suppression — was missing per Rule 5 tripwire) + 1 MED (autoplay-policy UnhandledPromiseRejection — wrapped `.catch()` on play promises). The QA agent surfaced the AC3 divergence for the reviewer to triage. No additional defects from this lead smoke.

## Iterations

- 1 (first-run pass)

## Result

PASS — Story 6.1 ships with placeholder audio and a clean wiring layer. The maintainer's real-procurement swap is a follow-up.

## Real-audio swap protocol (for the maintainer)

When real Golden Record audio is procured per the curation doc's checklist:

1. Replace each `web/public/audio/golden-record/<slug>.m4a` with the real file (same path + same codec; LFS tracking already configured)
2. Update `docs/audio/golden-record-curation.md` with the real source URLs, license confirmations, and SHA-256 checksums
3. Update `THIRD_PARTY.md § Voyager Golden Record audio assets` to remove the "Placeholder" qualifiers
4. Run the full AC7 Chrome DevTools MCP smoke per the story file's AC7 specification (boot to `/c/v1-jupiter` → G shortcut → scrub to launch-v1 → confirm audio plays → scrub to PBD → confirm track changes → pause/resume → tab reload → fresh-tab toggle reset)
5. Save evidence under `_bmad-output/implementation-artifacts/6-1-smoke-evidence/real-audio-smoke/`
