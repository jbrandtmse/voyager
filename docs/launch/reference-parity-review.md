# Reference-Parity Review (v1 launch gate)

**Story:** 6.6 — Final Contrast, Typography, and Provenance-Label Polish (template)
**Status:** TEMPLATE — VERDICT TO BE POPULATED AFTER EXTERNAL REVIEW
**Created:** 2026-05-25
**PRD reference:** [`_bmad-output/planning-artifacts/prd.md`](../../_bmad-output/planning-artifacts/prd.md) § Success criteria — reference-parity gate

This document is the v1 launch-gate reference-parity record. The PRD
commits the launch to a qualitative gate: the maintainer + 2–3 external
reviewers compare Voyager side-by-side with three reference projects
and render a verdict. The launch ships only if ≥ 2 of 3 reviewers
verdict "linkable next to the reference set without an apology".

Like Story 6.5's friendly-user-findings document, this is a
documentation-only template at Story 6.6 commit time. The maintainer
populates § 5 (Per-reviewer verdicts) and § 6 (Aggregate verdict) in
a follow-up commit after the out-of-band review session. Story 6.6's
`committed` log entry signals **visual-polish readiness, not
launch-gate satisfaction** — the PASS signal only fires when the
follow-up commit lands a populated verdict.

---

## 1. Methodology

The reference-parity review is a structured side-by-side comparison
where each reviewer opens Voyager AND each reference project in
adjacent browser tabs, spends ~10 minutes on each (alternating
between them), and renders a written verdict on whether Voyager is
"linkable" alongside the reference set without an apology. The
verdict is per-reviewer and qualitative; the aggregate verdict
follows a ≥ 2 of 3 threshold.

**Per-reviewer protocol:**

1. Open Voyager production-build (latest `main` or release tag) in one
   browser tab. Maintainer prepares the URL ahead of the session and
   shares it with each reviewer.
2. Open each reference project (see § 2 below) in adjacent tabs.
3. Spend at least 10 minutes on each project, alternating between
   them. Reviewers explore the simulation surface (Voyager), the
   interactive scrubber + chapter arcs in Apollo in Real Time, the
   editorial scrolling experience in the NYT long-scroll, and the
   technical / interactive showcase in the FWA Three.js winner.
4. Render a written verdict per reviewer in § 5 using the per-reviewer
   verdict template. The verdict is one of:
   - **"Linkable without apology"** — Voyager holds its own next to
     the reference set; no qualitative gaps would embarrass the
     maintainer if a Voyager link landed in the same post as one of
     the references.
   - **"Not yet"** — Voyager has 1–3 specific qualitative gaps that
     would be visible if linked alongside the references. List them
     in the verdict template.

**Aggregate verdict criterion (binding, per PRD):**

- **PASS** — ≥ 2 of 3 reviewers verdict "linkable without apology".
- **BLOCKED** — < 2 of 3 reviewers verdict "linkable without apology".

A BLOCKED verdict triggers scoped follow-up work documented in § 6
(by gap area: typography, visual polish, narrative depth, technical
fidelity, …) and re-routes through a re-review with the same or
updated reviewer roster after the scoped work lands.

---

## 2. Reference set

The reference set is calibrated to Voyager's positioning: an
interactive, browser-deployed, science-narrative experience that
combines real-spacecraft trajectory data with editorial scrolling
and a 3D simulation surface. Each reference project is chosen to
test a different facet of Voyager's pitch.

| # | Reference                          | URL                                                                 | Tests facet                                        |
|---|------------------------------------|---------------------------------------------------------------------|----------------------------------------------------|
| 1 | Apollo in Real Time (Apollo 17)    | <https://apolloinrealtime.org/17/>                                  | Interactive timeline-based historical reconstruction |
| 2 | NYT long-scroll science feature    | TBD by maintainer at review time. Recent examples: NYT "Year in Science" 2024; NYT "Apollo 11: As They Shot It" 2019 (<https://www.nytimes.com/interactive/2019/07/16/multimedia/apollo-11-50-years-photos.html>) | Editorial long-scroll narrative                    |
| 3 | Current FWA Three.js winner        | Maintainer picks a recent winner from <https://thefwa.com/cases/categories/threejs/> at review time | Technical / interactive Three.js showcase          |

**Selection guidance for the NYT and FWA picks (maintainer):** the
NYT pick should be a long-scroll editorial feature — not a daily news
piece. The FWA pick should be a winner in the last 12 months at
review time (the catalog rotates quarterly). Document the exact URLs
and the date of selection in § 5 below per reviewer.

---

## 3. Reviewer roster

The roster is 1 maintainer + 2–3 external reviewers. The maintainer
verdict is non-binding (the maintainer is too close to the work to
judge "linkable without apology" objectively); the external verdicts
are the binding ≥ 2 of 3 input.

**External reviewer recruitment shape** mirrors
[Story 6.5's friendly-user recruitment](../testing/friendly-user-recruitment.md)
methodology — see that doc for vendor list, persona match criteria,
consent / privacy commitments, compensation, and timeline. If the
same external reviewers from the Story 6.5 friendly-user session can
do double duty, document the dual role in their § 5 reviewer entry.
Dual-role reviewers are not a methodological conflict — the
friendly-user protocol tests perception of Voyager's differentiators
(attitude reconstruction, PBD); the reference-parity review tests
linkability alongside reference projects. The two questions are
orthogonal.

**Reviewer roster table (populated by maintainer at review time):**

| # | Name / handle | External or maintainer | Recruitment source         | Dual role with Story 6.5? |
|---|---------------|------------------------|----------------------------|----------------------------|
| 1 | TBD           | maintainer             | n/a                        | n/a                        |
| 2 | TBD           | external               | TBD (vendor / contact)     | TBD                        |
| 3 | TBD           | external               | TBD (vendor / contact)     | TBD                        |
| 4 | TBD           | external (optional)    | TBD                        | TBD                        |

---

## 4. Session execution log

The maintainer logs session execution here at review time. Per-session
entries record date, time, attending reviewers, Voyager release tag
under review, the NYT and FWA URLs chosen for that session, and any
session-level notes.

| Date | Reviewers | Voyager release tag | NYT URL chosen | FWA URL chosen | Notes |
|------|-----------|---------------------|----------------|----------------|-------|
| TBD  | TBD       | TBD                 | TBD            | TBD            | TBD   |

---

## 5. Per-reviewer verdicts

Each reviewer's verdict is rendered as a sub-section below. The
template is identical per reviewer; populate or duplicate as needed.

### 5.1 Reviewer 1 — TBD (maintainer, non-binding)

- **Voyager release tag reviewed:** TBD
- **NYT URL reviewed:** TBD
- **FWA URL reviewed:** TBD
- **Verdict:** TBD ("Linkable without apology" OR "Not yet")
- **If "Not yet", 1–3 specific qualitative gaps:**
  - TBD
- **Free-form commentary:** TBD

### 5.2 Reviewer 2 — TBD (external, binding)

- **Voyager release tag reviewed:** TBD
- **NYT URL reviewed:** TBD
- **FWA URL reviewed:** TBD
- **Verdict:** TBD ("Linkable without apology" OR "Not yet")
- **If "Not yet", 1–3 specific qualitative gaps:**
  - TBD
- **Free-form commentary:** TBD

### 5.3 Reviewer 3 — TBD (external, binding)

- **Voyager release tag reviewed:** TBD
- **NYT URL reviewed:** TBD
- **FWA URL reviewed:** TBD
- **Verdict:** TBD ("Linkable without apology" OR "Not yet")
- **If "Not yet", 1–3 specific qualitative gaps:**
  - TBD
- **Free-form commentary:** TBD

### 5.4 Reviewer 4 — TBD (external, optional / tie-break)

- **Voyager release tag reviewed:** TBD
- **NYT URL reviewed:** TBD
- **FWA URL reviewed:** TBD
- **Verdict:** TBD ("Linkable without apology" OR "Not yet")
- **If "Not yet", 1–3 specific qualitative gaps:**
  - TBD
- **Free-form commentary:** TBD

---

## 6. Aggregate verdict

**Aggregate verdict:** **TO BE POPULATED AFTER EXTERNAL REVIEW**

Per-reviewer count:

- "Linkable without apology": TBD / 3 binding
- "Not yet": TBD / 3 binding

**Decision rule:**

- PASS if ≥ 2 of 3 binding reviewers verdict "Linkable without apology".
- BLOCKED otherwise.

**Final verdict line (populate one):**

- **PASS** (≥ 2/3 binding "linkable without apology") — launch is
  cleared on the reference-parity gate. Routing: Epic 7's
  pre-launch checklist (Story 7.9 — Public launch playbook and
  launch-gate pre-flight) consumes this verdict as a precondition.
- **BLOCKED** (< 2/3 binding "linkable without apology") — launch is
  blocked on the reference-parity gate. Aggregate gaps from the
  reviewer "Not yet" sub-bullets and route scoped follow-up work:
  - **Typography / contrast** — amends route to a follow-up against
    [`docs/accessibility/contrast-audit-launch-week.md`](../accessibility/contrast-audit-launch-week.md).
  - **Visual polish** — amends route to per-component CSS PRs against
    `web/src/components/**` or `web/src/styles/**`.
  - **Narrative / editorial depth** — amends route to chapter-copy
    PRs against `web/src/chapters/**/copy.ts` files.
  - **Technical fidelity / interactive depth** — amends route to a
    new Epic 7 polish story (scope TBD by maintainer).
  Once scoped work lands, re-run the protocol against the same
  reviewer roster (fresh tabs, fresh release tag) and amend this
  document with a "Re-run round 2" section appended.

---

## 7. Cross-references

- PRD launch-gate commitment: [`_bmad-output/planning-artifacts/prd.md`](../../_bmad-output/planning-artifacts/prd.md)
  § "Success criteria — reference-parity gate"
- Story 6.5's friendly-user gate (orthogonal, runs in parallel):
  [`docs/testing/friendly-user-findings.md`](../testing/friendly-user-findings.md)
- Contrast / typography audit underpinning Voyager's "linkable" claim:
  [`docs/accessibility/contrast-audit-launch-week.md`](../accessibility/contrast-audit-launch-week.md)
- Epic 7 Story 7.9 — Public launch playbook + launch-gate pre-flight
  is the consuming story for the PASS verdict.
- BMAD Rule 17 — friendly-user gate is binding; this rule cross-cuts
  with the reference-parity gate (both must clear before v1 ship):
  [`_bmad/custom/skill-rules.md`](../../_bmad/custom/skill-rules.md)
  § "Rule 17".
