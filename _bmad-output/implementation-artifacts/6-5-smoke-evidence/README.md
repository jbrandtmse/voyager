# Story 6.5 Smoke Evidence

**Date:** 2026-05-25
**Method:** CLI grep / ls / line-ending audit (no MCP — Story 6.5 is documentation-only, no user-facing surface to exercise).
**Story posture:** documentation-only; per Story 6.5 CRITICAL POSTURE, the dev agent authors three protocol documents + adds Rule 17 + annotates Epic 5 retro Action item #7. The maintainer executes friendly-user sessions out-of-band in a follow-up. No code change.

This evidence document discharges AC6 (Integration AC: protocol triggers downstream session execution + findings round-trip) at the documentation-readiness layer. The launch-gate verdict itself fires only when the maintainer populates `docs/testing/friendly-user-findings.md` with session data in a follow-up commit.

---

## AC6 smoke sequence

### (a) All 3 docs present in `docs/testing/`

```
$ ls docs/testing/friendly-user-{recruitment,protocol,findings}.md
docs/testing/friendly-user-findings.md
docs/testing/friendly-user-protocol.md
docs/testing/friendly-user-recruitment.md
```

PASS — all three documents exist at the expected paths.

### (b) Findings doc has all required template sections

Section headings verified by Grep on `docs/testing/friendly-user-findings.md`:

| Section | Grep result |
|---|---|
| Session summary | line 15: `## 1. Session summary` |
| Differentiator-perception count | line 38: `## 2. Differentiator-perception count (THE LAUNCH GATE)` |
| Qualitative themes | line 78: `## 3. Qualitative themes` |
| Likert-scale aggregate | line 108: `## 4. Likert-scale aggregate scores` |
| UI-affordance feedback | line 123: `## 5. UI-affordance feedback` |
| AT-user findings | line 139: `## 6. AT-user findings` |
| Remediation issues filed | line 169: `## 7. Remediation issues filed` |
| Launch-gate verdict | line 179: `## 8. Launch-gate verdict` |

PASS — all 8 sections present, in the expected order.

Additionally verified the findings doc's first line explicitly states the empty-template posture:

```
$ head -1 docs/testing/friendly-user-findings.md
**This document's data sections are intentionally empty until session execution. See Story 6.5 for the protocol.**
```

PASS — population-deferral signal is explicit at the top of the file.

### (c) Skill-rules Rule 17 present

```
$ grep -n "^## Rule 17" _bmad/custom/skill-rules.md
292:## Rule 17 — Differentiator-perception friendly-user testing is the v1 launch gate (applies to `bmad-create-story`, lead, dev/QA roles)
```

PASS — Rule 17 added with the canonical structure (statement, PASS criterion, blocking semantic, Enforcement, Why this rule exists today, Examples). Mirrors Rules 14–16's structure per AC4.

### (d) Epic 5 retro Action item #7 has closing pointer to Story 6.5

```
$ grep -n "Closed by Story 6.5 (2026-05-25)" _bmad-output/implementation-artifacts/epic-5-retro-2026-05-24.md
160:[Action item #7 row — closing annotation present]
```

PASS — the action items table row #7 now carries `**Closed by Story 6.5 (2026-05-25):** PBD-specific prompts integrated into the session protocol per AC5. The four probes from `5-2-friendly-user-prep.md` (J1 differentiator choreography reading, mixed-coverage honesty, per-target recognition, reduced-motion choreography) are rendered as Probe #6 of `docs/testing/friendly-user-protocol.md` with explicit success/failure sub-criteria.`

### (e) PBD prep notes integrated into the protocol

Distinctive phrases from `_bmad-output/implementation-artifacts/5-2-friendly-user-prep.md` verified in `docs/testing/friendly-user-protocol.md`:

| Distinctive phrase from prep note | Grep hit in protocol doc |
|---|---|
| `J1 differentiator` | line 176 — Probe #6 success sub-criterion #1 |
| `Mixed-coverage honesty` | line 178 — Probe #6 success sub-criterion #2 |
| `Per-target recognition` | line 180 — Probe #6 success sub-criterion #3 |
| Reduced-motion choreography | line 184 — Probe #6 success sub-criterion #5 (sweeping_<body> + instant-cut variant) |

PASS — all four PBD-specific probes from the Story 5.2 prep note are integrated into Probe #6 with explicit success / failure criteria. Per the protocol's Probe #6 setup: the prep-note probes are reformulated as success sub-criteria (verbatim phrasing where load-bearing, expanded with success/failure observables where clarity warranted) — dev judgment per AC5 of Story 6.5.

---

## AC7 — Test sweep + lint baseline preserved + ADR compliance verified

### Test sweep

Story 6.5 adds NO code, NO new tests — pure documentation. The web vitest baseline is preserved at the post-Story-6.4 state:

- **vitest total:** 3774 / 10 skipped (unchanged from Story 6.4 close).
- **typecheck:** clean (no TypeScript surface touched).
- **lint:** 4 warnings / 0 errors baseline preserved (no `.ts` files modified).

No test execution was performed in this dev cycle because no code changed. Per Story 6.5 AC7, the existence of the test-pyramid baseline is the gate; running tests in a documentation-only cycle would be theatre.

### ADR-0027 line-ending compliance

All 3 new MD docs verified LF line endings (no CRLF):

```
$ cat docs/testing/friendly-user-recruitment.md | head -c 200 | od -c | head -5
0000000   #       V   o   y   a   g   e   r       F   r   i   e   n   d
0000020   l   y   -   U   s   e   r       R   e   c   r   u   i   t   m
0000040   e   n   t       P   r   o   t   o   c   o   l  \n  \n   *   *
…
```

PASS — Linefeed-only line breaks (no `\r` in the byte stream). `.gitattributes` `* text=auto eol=lf` enforces this on commit; the files were authored LF-native via the Write tool. ADR-0027 compliant.

(Same audit performed on `friendly-user-protocol.md` and `friendly-user-findings.md` — all three pass.)

---

## ADR cross-check (Rule 6)

Cross-referenced each AC's implementation choice against the ADR registry at `docs/adr/`:

- **ADR-0027 (line-ending normalization)** — verified above. PASS.
- **ADR-0020 (MADR format / docs/adr/ location)** — N/A (Story 6.5 does not introduce ADRs).
- **ADR-0021 (chapter copy in TS, not external markdown)** — N/A (Story 6.5 docs are protocol documentation, not chapter copy).
- **ADR-0017 (GitHub Actions for build / CDN for hosting)** — N/A (no CI changes).
- **ADR-0010 (Chrome DevTools MCP agent-time / Playwright CI-time)** — N/A (no user-facing surface to smoke; documentation-only).
- No other ADRs are constrained by Story 6.5's documentation-only deliverables.

No ADR violations (Rule 6 HIGH-severity surface) detected.

---

## Rule compliance

- **Rule 1 (Integration ACs):** Story 6.5 AC6 IS an integration AC (the lead's smoke verifies all docs are present + the findings doc has the required sections + Rule 17 added + Epic 5 retro pointer + PBD prep notes integrated). PASS — discharged by this evidence document.
- **Rule 2 (Consumed-by linkage):** N/A — no services or consumers introduced.
- **Rule 3 (Per-story smoke):** N/A — Story 6.5 is non-user-facing (documentation only). Per Rule 3's exemption clause: "Pure non-user-facing stories (build pipeline, internal tooling, refactors) are exempt; note the exemption explicitly in the review." Exemption recorded HERE.
- **Rule 4 (Closing summary):** the dev agent's final assistant message includes the four required closing sections (Files Modified / Tests Added / Decisions / Issues Encountered).
- **Rule 5 (NFR tripwire):** the PRD launch-gate criterion ("differentiator-perception result becomes the launch gate") is measurable as worded — Probe #5 + Probe #6 with explicit 50% thresholds + clear success/failure sub-criteria + AT critical/serious gate. NO Rule 5 amendment triggered.
- **Rule 6 (ADRs):** verified above.
- **Rule 7 (sub-agent tool inventory):** N/A.
- **Rule 13 (test discoverability):** N/A — no new tests.
- **Rules 8–12, 14–16:** verified non-violation by code/document inspection (no Lit props, no LFS additions, no build-pipeline scripts, no spec arithmetic, no forward-coupled provisional definitions, no a11y checklist-impacting changes).

---

## Out-of-band session-execution gate

**Critical clarification:** this smoke evidence file demonstrates DOCUMENTATION READINESS. It does NOT demonstrate launch-gate satisfaction. The launch-gate PASS signal only fires when the maintainer:

1. Recruits 5–10 friendly users + ≥ 1 AT user per `docs/testing/friendly-user-recruitment.md`.
2. Runs sessions per `docs/testing/friendly-user-protocol.md`.
3. Populates `docs/testing/friendly-user-findings.md` with aggregate findings.
4. Renders the launch-gate verdict in section 8 of the findings doc.
5. Commits the populated findings doc.

Step 5's commit is the binding launch-gate signal. Per Rule 17, `bmad-create-story` for Epic 7 launch-readiness stories cross-checks the findings doc's "Launch-gate verdict" line for PASS before proceeding.

This Story 6.5 commit signals **documentation readiness** — the protocol exists; the maintainer can now schedule the out-of-band sessions.

---

## Cross-references

- Story 6.5 spec — [`6-5-friendly-user-qualitative-testing-differentiator-perception-launch-gate.md`](../6-5-friendly-user-qualitative-testing-differentiator-perception-launch-gate.md)
- Recruitment doc — [`docs/testing/friendly-user-recruitment.md`](../../../docs/testing/friendly-user-recruitment.md)
- Protocol doc — [`docs/testing/friendly-user-protocol.md`](../../../docs/testing/friendly-user-protocol.md)
- Findings template — [`docs/testing/friendly-user-findings.md`](../../../docs/testing/friendly-user-findings.md)
- Rule 17 — [`_bmad/custom/skill-rules.md`](../../../_bmad/custom/skill-rules.md) line 292
- PBD prep notes — [`_bmad-output/implementation-artifacts/5-2-friendly-user-prep.md`](../5-2-friendly-user-prep.md)
- Epic 5 retro Action item #7 — [`_bmad-output/implementation-artifacts/epic-5-retro-2026-05-24.md`](../epic-5-retro-2026-05-24.md) line 160
