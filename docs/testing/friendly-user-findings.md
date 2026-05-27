**This document's data sections are intentionally empty until session execution. See Story 6.5 for the protocol.**

# Voyager Friendly-User Findings

**Authored as template:** Story 6.5 (2026-05-25).
**Population status:** **EMPTY — TO BE POPULATED AFTER SESSION EXECUTION.**
**Launch-gate state:** **PENDING** — verdict cannot be rendered until session execution.

This document aggregates findings from the pre-launch friendly-user testing pass. Recruitment is governed by [`./friendly-user-recruitment.md`](./friendly-user-recruitment.md). Session protocol is at [`./friendly-user-protocol.md`](./friendly-user-protocol.md). Skill-rules enforcement of the launch-gate verdict (Rule 17) is at [`_bmad/custom/skill-rules.md`](../../_bmad/custom/skill-rules.md).

**Population workflow:** the maintainer (or a session facilitator under maintainer direction) runs sessions per the protocol; raw notes are kept locally per session; aggregate findings are synthesized into this document IN A FOLLOW-UP COMMIT, replacing the "TO BE POPULATED" markers below with real data. The "Launch-gate verdict" section renders PASS or BLOCKED against the populated data. Story 6.5's initial commit ships THIS TEMPLATE — that commit does NOT signal launch-gate satisfaction; that signal only fires when the maintainer's follow-up commit populates the data and renders the verdict.

---

## 1. Session summary

**Session dates:** TO BE POPULATED AFTER SESSION EXECUTION

**Total sessions run:** TO BE POPULATED AFTER SESSION EXECUTION

**Sample size breakdown:**

| Dimension | Count | Notes |
|---|---|---|
| Total first-time users (non-AT) | TO BE POPULATED AFTER SESSION EXECUTION | |
| AT users | TO BE POPULATED AFTER SESSION EXECUTION | Per UX-DR38, ≥ 1 required for launch-gate satisfaction |
| Gender breakdown (M / F / NB / decline) | TO BE POPULATED AFTER SESSION EXECUTION | Target: ≥ 40% non-male |
| Age range | TO BE POPULATED AFTER SESSION EXECUTION | Target: 25–55 with ≥ 2 in 30–45 |
| Geographic / cultural diversity | TO BE POPULATED AFTER SESSION EXECUTION | Target: ≥ 2 outside maintainer's primary network |
| Recruitment channel mix | TO BE POPULATED AFTER SESSION EXECUTION | Network vs. vendor; vendor name if applicable |

**Recruitment channel summary:** TO BE POPULATED AFTER SESSION EXECUTION (one paragraph: which channels were used, how many participants per channel, any vendor engagement details).

**Disqualifications:** TO BE POPULATED AFTER SESSION EXECUTION (any participants who slipped through recruitment screening and were marked DISQUALIFIED post-session per the protocol's calibration rule; how many; impact on threshold math).

---

## 2. Differentiator-perception count (THE LAUNCH GATE)

This is the binding launch-gate input. The protocol's Probes #5 (V1 Jupiter unprompted attitude) and #6 (PBD unprompted reconstruction) are tabulated below.

### Probe #5 — V1 Jupiter unprompted attitude perception

**N perceived / Total measured:** TO BE POPULATED AFTER SESSION EXECUTION (e.g., "4 / 8 = 50%")

**Per-user outcome:**

| User # | AT? | Perceived (Y/N/Not Measured) | Verbatim quote |
|---|---|---|---|
| User #1 | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION |
| User #2 | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION |
| User #3 | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION |
| (add rows per participant) | … | … | … |

**Threshold (per Rule 17):** ≥ 50% of measured users perceive unprompted.

**Probe #5 verdict:** TO BE POPULATED AFTER SESSION EXECUTION (PASS / FAIL).

### Probe #6 — PBD unprompted reconstruction perception

**N perceived / Total measured:** TO BE POPULATED AFTER SESSION EXECUTION

**Per-user outcome:**

| User # | AT? | Perceived (Y/N/Not Measured) | Which success sub-criterion fired | Verbatim quote |
|---|---|---|---|---|
| User #1 | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION |
| (add rows per participant) | … | … | … | … |

PBD success sub-criteria (per protocol Probe #6): (1) J1 differentiator choreography reading; (2) mixed-coverage honesty; (3) per-target recognition; (4) photo plate composition; (5) reduced-motion choreography (if applicable).

**Threshold (per Rule 17):** ≥ 50% of measured users perceive unprompted.

**Probe #6 verdict:** TO BE POPULATED AFTER SESSION EXECUTION (PASS / FAIL).

---

## 3. Qualitative themes

Clustered from exit-interview open-ended quotes (Probe-Exit-Q1 through Probe-Exit-Q5). Target: 3–6 themes per cluster.

### "What was the most surprising moment?"

**Theme A:** TO BE POPULATED AFTER SESSION EXECUTION (theme statement; how many participants surfaced it; representative quotes).
**Theme B:** TO BE POPULATED AFTER SESSION EXECUTION
**Theme C:** TO BE POPULATED AFTER SESSION EXECUTION
(additional themes as data warrants)

### "What would you tell a friend about this?"

**Theme A:** TO BE POPULATED AFTER SESSION EXECUTION
**Theme B:** TO BE POPULATED AFTER SESSION EXECUTION
**Theme C:** TO BE POPULATED AFTER SESSION EXECUTION

### "What confused you?"

**Theme A:** TO BE POPULATED AFTER SESSION EXECUTION
**Theme B:** TO BE POPULATED AFTER SESSION EXECUTION
**Theme C:** TO BE POPULATED AFTER SESSION EXECUTION

### "What would you change about it?" (optional question)

**Theme A:** TO BE POPULATED AFTER SESSION EXECUTION
**Theme B:** TO BE POPULATED AFTER SESSION EXECUTION

---

## 4. Likert-scale aggregate scores

Per the protocol's exit-interview Likert ratings (1–5 scale per dimension).

| Dimension | Mean | StdDev | Min | Max | Per-user values |
|---|---|---|---|---|---|
| **Awe** | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION |
| **Restraint** | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION |
| **Trust** | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION |
| **Recognition** | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION |

**Notes:** TO BE POPULATED AFTER SESSION EXECUTION (any dimension where the mean ≤ 3 OR the stdev is high enough to indicate divided response, with rationale).

---

## 5. UI-affordance feedback

Specific defects or improvement suggestions, mapped to the relevant story / file / component. The findings doc captures the FEEDBACK; remediation issue tracking is in section 7.

| User # | Probe context | Affordance | Issue surfaced | Mapped to story / file | Severity |
|---|---|---|---|---|---|
| TO BE POPULATED AFTER SESSION EXECUTION | … | … | … | … | … |

Severity convention (mirrors `bmad-code-review`):
- **Critical:** breaks core functionality; launch-blocking.
- **Serious:** prevents a primary user flow; launch-blocking when accumulated.
- **Moderate:** discoverability issue, friction; non-blocking but should be fixed.
- **Minor:** polish; non-blocking.

---

## 6. AT-user findings

One detailed section per AT user. If only 1 AT user, just one section.

### User #N (AT) — [pseudonym only; AT setup described]

**AT setup:** TO BE POPULATED AFTER SESSION EXECUTION (e.g., "macOS VoiceOver, Safari 17, keyboard-only").

**Main-protocol probe outcomes:** TO BE POPULATED AFTER SESSION EXECUTION (rows from the Probe #5 / Probe #6 tables in section 2 above; this section repeats their contribution for clarity).

**AT-Probe outcomes (per protocol's AT-user special-handling probes A through E):**

| AT-Probe | Outcome | Notes |
|---|---|---|
| A — Screen-reader landing announcement | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION |
| B — Chapter navigation keyboard-only | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION |
| C — Scrubber operation under AT | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION |
| D — Help overlay open + dismiss | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION |
| E — Attitude indicator announcement | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION |

**Critical / serious AT findings:** TO BE POPULATED AFTER SESSION EXECUTION (any defects classified as critical or serious per the AT-finding severity rubric in [`./friendly-user-protocol.md`](./friendly-user-protocol.md) § "AT-finding severity rubric" — these are launch-blocking per AC4 of Story 6.5 and Rule 17).

**Moderate / minor AT findings:** TO BE POPULATED AFTER SESSION EXECUTION (filed for remediation but not launch-blocking).

**AT-user verbatim quotes — most load-bearing:** TO BE POPULATED AFTER SESSION EXECUTION (the AT user's framing of the experience often surfaces issues no automated test would catch).

(Add additional `User #N (AT)` sections per AT participant.)

---

## 7. Remediation issues filed

Issues filed from findings → status tracking. The project's defect-tracking landing is currently `_bmad-output/implementation-artifacts/deferred-work.md` (per Story 6.5 § Out of Scope — permanent issue-tracking is Epic 7 ops). Each issue references the section above that surfaced it.

| Issue ID / commit ref | Title | Source (findings section) | Severity | Status | Mapped to story |
|---|---|---|---|---|---|
| TO BE POPULATED AFTER SESSION EXECUTION | … | … | … | … | … |

---

## 8. Launch-gate verdict

**This section renders the binding PASS / BLOCKED verdict against the populated data above. Per Rule 17 of [`_bmad/custom/skill-rules.md`](../../_bmad/custom/skill-rules.md).**

### Verdict

**Launch-gate verdict:** **PENDING — TO BE POPULATED AFTER SESSION EXECUTION**

### Verdict logic (per Rule 17)

| Condition | Threshold | Actual (post-session) | Pass? |
|---|---|---|---|
| Probe #5 (V1 Jupiter unprompted attitude perception) | ≥ 50% of measured users | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION |
| Probe #6 (PBD unprompted reconstruction perception) | ≥ 50% of measured users | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION |
| AT-user critical / serious findings unresolved | 0 | TO BE POPULATED AFTER SESSION EXECUTION | TO BE POPULATED AFTER SESSION EXECUTION |

**Overall verdict logic:** PASS iff ALL three conditions are met. BLOCKED otherwise.

### If PASS

- The launch gate is satisfied per the PRD's commitment + UX-DR38.
- This commit serves as the binding launch-gate signal; Epic 7 launch-readiness stories (per Rule 17 enforcement) reference the PASS verdict line above.
- Any moderate / minor findings filed are tracked for post-launch resolution but do not block the v1 ship.

### If BLOCKED — redesign-and-rerun routing

A BLOCKED verdict triggers the explicit re-run path enumerated below. The protocol of [`./friendly-user-protocol.md`](./friendly-user-protocol.md) is re-entered AFTER the remediation scope below is implemented; fresh participants are recruited (no re-use of original participants, who can no longer produce an unprompted-perception signal).

**If Probe #5 fails (V1 Jupiter):**

- **Camera framing prominence.** Review the V1 Jupiter encounter's camera transition — is the body-centered framing reading as a deliberate shift, or as ambient motion? Candidate remediations: stronger framing dwell, slower transition entry, clearer camera-mount affordance.
- **Scan-platform articulation visibility.** Is the platform's rotation visible from the chosen camera distance? Candidate: tighter framing during sweep, exaggerated articulation amplitude, visual emphasis (subtle highlight on the platform mount).
- **Boresight cone prominence.** Is the boresight rendered at the camera-distance band that makes it readable? Candidate: opacity / scale adjustment, conditional rendering based on encounter framing.
- **Chapter copy lede.** Does the chapter copy's first sentence draw attention to attitude / pointing? Candidate: re-author copy to lead with the differentiator without lecturing.

Scope: **V1 Jupiter chapter only**, unless findings indicate cross-chapter regression risk.

**If Probe #6 fails (PBD):**

- **PBD choreography pacing.** Is the per-substate dwell long enough for first-time users to read each aim? Candidate: extend substate durations; longer hold at each `sweeping_<body>` peak.
- **Photo plate compositing.** Are the plates visible enough? Candidate: opacity ramp, position adjustment, longer hold during `composite_active`.
- **Chapter copy on reconstruction provenance.** Is the chapter copy clarifying mixed-coverage reconstruction without overwhelming? Candidate: copy refinement.

Scope: **PBD chapter only**, unless findings indicate substates.ts amendment is needed (Rule 15 forward-coupled definition territory).

**If AT critical / serious findings unresolved:**

- All identified critical / serious AT findings are remediated as Story 6.6 polish OR a dedicated remediation story BEFORE re-run.
- AT user is re-recruited (the same AT user OR a different one) for the re-run sessions. The re-run protocol re-runs the FULL set of probes for the AT user, not just the previously-failing AT-Probes.

**Re-run cycle:**

1. Remediation work lands as PRs against the relevant stories.
2. The maintainer re-runs Story 6.5 — fresh recruits, full protocol, re-populated findings doc, fresh launch-gate verdict.
3. The findings doc is amended IN PLACE with a "Re-run round 2" section appended at the bottom (preserve original PASS / BLOCKED data per Rule 5 discipline).

---

## 9. Session notes archive

Per-session raw notes are kept locally by the facilitator (encrypted; no PII committed) until the findings doc PASS verdict lands; at that point, raw notes are either retained per the maintainer's data-retention policy or destroyed per the participant's consent terms.

**Raw notes retention reference:** TO BE POPULATED AFTER SESSION EXECUTION (one-line statement describing where local raw notes are kept, encryption posture, and planned destruction date).

---

## Amendment log

(none yet — original template landed in Story 6.5, 2026-05-25.)

When sessions execute and data populates, append amendment-block entries below noting WHEN the doc was populated, by WHOM (maintainer / facilitator), and against WHICH commit.

---

## Cross-references

- **Recruitment** — [`./friendly-user-recruitment.md`](./friendly-user-recruitment.md).
- **Session protocol** — [`./friendly-user-protocol.md`](./friendly-user-protocol.md).
- **PBD prep notes (source for Probe #6)** — [`_bmad-output/implementation-artifacts/5-2-friendly-user-prep.md`](../../_bmad-output/implementation-artifacts/5-2-friendly-user-prep.md).
- **Manual a11y checklist (cross-reference for AT findings)** — [`docs/accessibility/manual-test-checklist.md`](../accessibility/manual-test-checklist.md).
- **Skill-rules Rule 17 (launch-gate enforcement)** — [`_bmad/custom/skill-rules.md`](../../_bmad/custom/skill-rules.md).
- **PRD launch-gate commitment** — [`_bmad-output/planning-artifacts/prd.md`](../../_bmad-output/planning-artifacts/prd.md).
- **UX-DR38** — [`_bmad-output/planning-artifacts/ux-design-specification.md`](../../_bmad-output/planning-artifacts/ux-design-specification.md).
