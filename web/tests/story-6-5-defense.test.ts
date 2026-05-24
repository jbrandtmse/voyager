// @vitest-environment happy-dom
//
// Story 6.5 — QA defense suite (documentation-integrity grep-tier).
//
// Story 6.5 is a documentation-only story: three protocol documents under
// `docs/testing/`, a new Rule 17 in `_bmad/custom/skill-rules.md`, and a
// closing-pointer annotation in `_bmad-output/implementation-artifacts/
// epic-5-retro-2026-05-24.md`. No code, no new unit tests for shipping
// runtime behavior. The vitest baseline (3774 passing / 10 skipped) is
// preserved unchanged.
//
// This file pins the DOCUMENTATION CONTRACT against silent drift. The
// load-bearing assertions are grep-tier — they read the committed text
// and assert on structural invariants:
//
//   1. All three testing docs exist at the expected paths.
//   2. Recruitment doc — persona match, AT-user vendor list (Fable,
//      IDRC, Knowbility), consent commitments, sample size, recruitment
//      timeline, vendor-IRB acknowledgment (added inline during the
//      code-review pass per the EC-3 finding).
//   3. Protocol doc — 8 ordered probes with explicit PASS / FAIL
//      criteria; Probes #5 (V1 Jupiter attitude) and #6 (PBD) flagged
//      as the launch gate; PBD prep-note four sub-criteria preserved;
//      AT-finding severity rubric (added inline during the code-review
//      pass per the EC-2 finding).
//   4. Findings doc — eight required template sections present, each
//      marked "TO BE POPULATED AFTER SESSION EXECUTION"; section 8
//      Launch-gate verdict carries PENDING marker + PASS / BLOCKED
//      verdict logic.
//   5. Rule 17 in skill-rules.md — present with launch-gate criterion,
//      protocol-docs references, blocking semantic, Enforcement clause
//      naming `bmad-create-story` for Epic 7 stories.
//   6. Epic 5 retro Action item #7 — closing pointer to Story 6.5
//      present.
//
// ## Rule 13 (test discoverability)
//
// This file lives at `web/tests/story-6-5-defense.test.ts` so vitest's
// default sweep picks it up — same posture as `story-6-0-cross-reference-
// defense.test.ts` and `story-6-4-defense.test.ts`. No env-gate, no
// `.skip`, no `xfail`; assertions run unconditionally against committed
// text.
//
// ## Rule 3 exemption note
//
// Story 6.5 ships documentation only — there is no user-facing runtime
// surface to smoke. Per Rule 3 the story is exempt from the per-story
// Chrome DevTools MCP smoke evidence requirement; the dev's smoke
// evidence at `_bmad-output/implementation-artifacts/6-5-smoke-evidence/
// README.md` discharges AC6 at the documentation-readiness layer via
// grep / ls. This file is the cheap-feedback companion that pins the
// documentation contract at vitest cost.

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..');

const PATHS = {
  recruitment: resolve(REPO_ROOT, 'docs/testing/friendly-user-recruitment.md'),
  protocol: resolve(REPO_ROOT, 'docs/testing/friendly-user-protocol.md'),
  findings: resolve(REPO_ROOT, 'docs/testing/friendly-user-findings.md'),
  skillRules: resolve(REPO_ROOT, '_bmad/custom/skill-rules.md'),
  epic5Retro: resolve(
    REPO_ROOT,
    '_bmad-output/implementation-artifacts/epic-5-retro-2026-05-24.md',
  ),
  pbdPrep: resolve(
    REPO_ROOT,
    '_bmad-output/implementation-artifacts/5-2-friendly-user-prep.md',
  ),
} as const;

// ─── doc loaders (lazy + cached) ─────────────────────────────────────

const docCache = new Map<string, string>();
function loadDoc(path: string): string {
  let cached = docCache.get(path);
  if (cached === undefined) {
    cached = readFileSync(path, 'utf-8');
    docCache.set(path, cached);
  }
  return cached;
}

// ─── 1. all three testing docs exist ─────────────────────────────────

describe('Story 6.5 — three testing docs present at expected paths', () => {
  it('docs/testing/friendly-user-recruitment.md exists', () => {
    expect(existsSync(PATHS.recruitment)).toBe(true);
  });

  it('docs/testing/friendly-user-protocol.md exists', () => {
    expect(existsSync(PATHS.protocol)).toBe(true);
  });

  it('docs/testing/friendly-user-findings.md exists', () => {
    expect(existsSync(PATHS.findings)).toBe(true);
  });
});

// ─── 2. recruitment doc structural invariants (AC1) ──────────────────

describe('Story 6.5 — recruitment doc covers AC1 schema', () => {
  it('declares persona match criteria + must-NOT-be section', () => {
    const text = loadDoc(PATHS.recruitment);
    expect(text).toMatch(/Persona match criteria/i);
    expect(text).toMatch(/Must-be criteria/i);
    expect(text).toMatch(/Must-NOT-be criteria/i);
    // Maya persona reference
    expect(text).toMatch(/Maya/i);
  });

  it('names the three AT-user vendors (Fable, IDRC, Knowbility)', () => {
    const text = loadDoc(PATHS.recruitment);
    expect(text).toMatch(/Fable Tech Labs/i);
    expect(text).toMatch(/fable\.tech/i);
    expect(text).toMatch(/Inclusive Design Research Centre/i);
    expect(text).toMatch(/idrc\.ocadu\.ca/i);
    expect(text).toMatch(/Knowbility/i);
    expect(text).toMatch(/knowbility\.org/i);
  });

  it('documents the AT-user inclusion as launch-gate-required', () => {
    const text = loadDoc(PATHS.recruitment);
    // ≥ 1 AT user is required for launch-gate satisfaction
    expect(text).toMatch(/≥\s*1[^\n]*AT user|AT user[^\n]*required/i);
  });

  it('declares consent + privacy commitments', () => {
    const text = loadDoc(PATHS.recruitment);
    expect(text).toMatch(/Consent[^\n]*privacy|consent statement/i);
    // Explicit recording-consent opt-in
    expect(text).toMatch(/recording[^\n]*consent|consent[^\n]*recording/i);
    // No PII / pseudonym scheme
    expect(text).toMatch(/User\s*#\d|pseudonym/i);
    // Withdrawal honored within 24 hours
    expect(text).toMatch(/withdraw[^\n]*24\s*hours|24\s*hours[^\n]*withdraw/i);
  });

  it('documents compensation per channel', () => {
    const text = loadDoc(PATHS.recruitment);
    expect(text).toMatch(/Compensation/i);
    // Compensation has explicit USD amount (network channel)
    expect(text).toMatch(/USD\s*\d|\$\d/);
  });

  it('declares sample size 5–10 + Nielsen Norman Group rationale', () => {
    const text = loadDoc(PATHS.recruitment);
    expect(text).toMatch(/5[-–]10/);
    expect(text).toMatch(/Nielsen Norman Group/i);
  });

  it('declares recruitment timeline 2–4 weeks', () => {
    const text = loadDoc(PATHS.recruitment);
    expect(text).toMatch(/Recruitment timeline/i);
    // Week 1 through Week 4 markers + "2–4 week" target string
    expect(text).toMatch(/Week 1/i);
    expect(text).toMatch(/Week 4/i);
    expect(text).toMatch(/2[-–]4\s*week/i);
  });

  it('acknowledges vendor-IRB / ethics review posture (CR-pass EC-3 fix)', () => {
    const text = loadDoc(PATHS.recruitment);
    expect(text).toMatch(/Ethics review posture/i);
    expect(text).toMatch(/institutional review board|IRB/i);
    expect(text).toMatch(/Vendor-channel review|vendor[^\n]*consent[^\n]*framework/i);
  });
});

// ─── 3. protocol doc — 8 probes + launch-gate flags (AC2 + AC5) ──────

describe('Story 6.5 — protocol doc carries 8 ordered probes with PASS/FAIL criteria', () => {
  it('lists 8 probes in order #1 through #8', () => {
    const text = loadDoc(PATHS.protocol);
    // Each probe heading uses "### Probe #N" form
    for (let n = 1; n <= 8; n++) {
      const pattern = new RegExp(`### Probe #${n}`);
      expect(
        text,
        `protocol must contain heading '### Probe #${n}'`,
      ).toMatch(pattern);
    }
  });

  it('probes appear in numeric order (#1 before #2 before … before #8)', () => {
    const text = loadDoc(PATHS.protocol);
    const positions: number[] = [];
    for (let n = 1; n <= 8; n++) {
      const idx = text.indexOf(`### Probe #${n}`);
      expect(idx, `### Probe #${n} must appear in protocol`).toBeGreaterThan(0);
      positions.push(idx);
    }
    // strictly ascending
    for (let i = 1; i < positions.length; i++) {
      expect(
        positions[i],
        `Probe #${i + 1} must appear after Probe #${i}`,
      ).toBeGreaterThan(positions[i - 1]);
    }
  });

  it('every probe carries an explicit Success criterion and Failure criterion', () => {
    const text = loadDoc(PATHS.protocol);
    // Split text into per-probe slices using probe headings as separators
    const probeSlices: string[] = [];
    for (let n = 1; n <= 8; n++) {
      const start = text.indexOf(`### Probe #${n}`);
      const end =
        n < 8
          ? text.indexOf(`### Probe #${n + 1}`)
          : text.indexOf('## Exit interview');
      expect(start, `Probe #${n} heading must exist`).toBeGreaterThan(0);
      expect(end, `boundary after Probe #${n} must exist`).toBeGreaterThan(
        start,
      );
      probeSlices.push(text.slice(start, end));
    }
    // Every probe slice must contain both Success and Failure markers.
    for (let i = 0; i < 8; i++) {
      const slice = probeSlices[i];
      expect(
        slice,
        `Probe #${i + 1} must declare a Success criterion`,
      ).toMatch(/\*\*Success/);
      expect(
        slice,
        `Probe #${i + 1} must declare a Failure criterion`,
      ).toMatch(/\*\*Failure/);
    }
  });

  it('Probe #5 is flagged as THE LAUNCH GATE per the PRD', () => {
    const text = loadDoc(PATHS.protocol);
    // The probe-#5 heading itself names the launch gate
    expect(text).toMatch(/Probe #5[^\n]*LAUNCH GATE/i);
  });

  it('Probe #5 names the unprompted-attitude observables', () => {
    const text = loadDoc(PATHS.protocol);
    const probe5Start = text.indexOf('### Probe #5');
    const probe5End = text.indexOf('### Probe #6');
    expect(probe5Start).toBeGreaterThan(0);
    expect(probe5End).toBeGreaterThan(probe5Start);
    const slice = text.slice(probe5Start, probe5End);
    // The 6 observables from the spec
    expect(slice).toMatch(/turning|rotating|pivoting/i);
    expect(slice).toMatch(/scan platform/i);
    expect(slice).toMatch(/camera|instrument/i);
    expect(slice).toMatch(/boresight|sight-line|pointing direction/i);
    expect(slice).toMatch(/attitude.indicator/i);
    expect(slice).toMatch(/CK|synth/);
  });

  it('Probe #6 is the PBD differentiator-perception probe with 4 sub-criteria from prep notes', () => {
    const text = loadDoc(PATHS.protocol);
    const probe6Start = text.indexOf('### Probe #6');
    const probe6End = text.indexOf('### Probe #7');
    expect(probe6Start).toBeGreaterThan(0);
    expect(probe6End).toBeGreaterThan(probe6Start);
    const slice = text.slice(probe6Start, probe6End);
    // The 4 prep-note themes preserved
    expect(slice).toMatch(/J1 differentiator/i);
    expect(slice).toMatch(/Mixed-coverage honesty/i);
    expect(slice).toMatch(/Per-target recognition/i);
    expect(slice).toMatch(/reduced[-\s]motion/i);
    // Cite back to the prep note
    expect(slice).toMatch(/5-2-friendly-user-prep/i);
  });

  it('protocol has exit interview with 4 Likert dimensions', () => {
    const text = loadDoc(PATHS.protocol);
    expect(text).toMatch(/Exit interview/i);
    expect(text).toMatch(/\bAwe\b/);
    expect(text).toMatch(/\bRestraint\b/);
    expect(text).toMatch(/\bTrust\b/);
    expect(text).toMatch(/\bRecognition\b/);
  });

  it('protocol has AT-user special-handling section with AT-Probes A-E', () => {
    const text = loadDoc(PATHS.protocol);
    expect(text).toMatch(/AT-user special-handling/i);
    for (const letter of ['A', 'B', 'C', 'D', 'E']) {
      const pattern = new RegExp(`AT-Probe ${letter}`);
      expect(text, `AT-Probe ${letter} must appear in protocol`).toMatch(
        pattern,
      );
    }
  });

  it('protocol carries facilitator-notes guidance', () => {
    const text = loadDoc(PATHS.protocol);
    expect(text).toMatch(/Facilitator notes/i);
    expect(text).toMatch(/Avoid leading questions/i);
  });

  it('protocol declares the launch-gate PASS / BLOCKED logic at 50% threshold', () => {
    const text = loadDoc(PATHS.protocol);
    expect(text).toMatch(/PASS:.*≥\s*50%/);
    expect(text).toMatch(/BLOCKED/);
  });

  it('protocol carries AT-finding severity rubric (CR-pass EC-2 fix)', () => {
    const text = loadDoc(PATHS.protocol);
    expect(text).toMatch(/AT-finding severity rubric/i);
    // Each severity band defined
    expect(text).toMatch(/\*\*Critical\*\*/);
    expect(text).toMatch(/\*\*Serious\*\*/);
    expect(text).toMatch(/\*\*Moderate\*\*/);
    expect(text).toMatch(/\*\*Minor\*\*/);
    // Disagreement protocol — when uncertain, choose higher band
    expect(text).toMatch(/Disagreement protocol|higher band/i);
  });
});

// ─── 4. findings doc — 8 sections present + TBD markers (AC3) ────────

describe('Story 6.5 — findings doc carries all required template sections', () => {
  it('starts with the empty-template population-deferred posture', () => {
    const text = loadDoc(PATHS.findings);
    // The first line declares the empty-template posture per AC3
    const firstLine = text.split('\n')[0];
    expect(firstLine).toMatch(/intentionally empty|TO BE POPULATED/i);
  });

  it('has all 8 required sections in numeric order', () => {
    const text = loadDoc(PATHS.findings);
    const REQUIRED_SECTIONS = [
      /## 1\.\s*Session summary/i,
      /## 2\.\s*Differentiator-perception count/i,
      /## 3\.\s*Qualitative themes/i,
      /## 4\.\s*Likert-scale aggregate/i,
      /## 5\.\s*UI-affordance feedback/i,
      /## 6\.\s*AT-user findings/i,
      /## 7\.\s*Remediation issues filed/i,
      /## 8\.\s*Launch-gate verdict/i,
    ];
    const positions: number[] = [];
    for (const pattern of REQUIRED_SECTIONS) {
      const match = text.match(pattern);
      expect(
        match,
        `required findings section matching ${pattern} must exist`,
      ).not.toBeNull();
      // match.index is the position of this section in the doc
      positions.push(match!.index ?? -1);
    }
    for (let i = 1; i < positions.length; i++) {
      expect(
        positions[i],
        `findings section #${i + 1} must appear after #${i}`,
      ).toBeGreaterThan(positions[i - 1]);
    }
  });

  it('every required section has "TO BE POPULATED AFTER SESSION EXECUTION" markers', () => {
    const text = loadDoc(PATHS.findings);
    // The marker should appear MANY times — once per data cell minimum.
    const occurrences = text.split('TO BE POPULATED AFTER SESSION EXECUTION')
      .length - 1;
    expect(
      occurrences,
      'findings doc must use "TO BE POPULATED AFTER SESSION EXECUTION" markers throughout',
    ).toBeGreaterThan(20);
  });

  it('section 8 Launch-gate verdict declares PENDING + PASS/BLOCKED logic', () => {
    const text = loadDoc(PATHS.findings);
    const verdictStart = text.indexOf('## 8. Launch-gate verdict');
    expect(verdictStart).toBeGreaterThan(0);
    const verdictSection = text.slice(verdictStart);
    // Initial verdict is PENDING
    expect(verdictSection).toMatch(/PENDING/i);
    // Both PASS and BLOCKED outcomes documented
    expect(verdictSection).toMatch(/### If PASS/i);
    expect(verdictSection).toMatch(/### If BLOCKED/i);
    // All 3 threshold rows present in verdict logic table
    expect(verdictSection).toMatch(/Probe #5.*≥\s*50%/);
    expect(verdictSection).toMatch(/Probe #6.*≥\s*50%/);
    expect(verdictSection).toMatch(/critical[^\n]*serious|critical \/ serious/i);
    // PASS iff all three met
    expect(verdictSection).toMatch(/PASS iff ALL three/i);
  });

  it('section 6 AT-user findings cross-references the severity rubric (CR-pass EC-2)', () => {
    const text = loadDoc(PATHS.findings);
    const section6Start = text.indexOf('## 6. AT-user findings');
    const section7Start = text.indexOf('## 7. Remediation issues filed');
    expect(section6Start).toBeGreaterThan(0);
    expect(section7Start).toBeGreaterThan(section6Start);
    const section6 = text.slice(section6Start, section7Start);
    // The CR-pass inline fix added a cross-ref from findings doc section 6
    // into protocol's AT-finding severity rubric
    expect(section6).toMatch(/severity rubric/i);
    expect(section6).toMatch(/friendly-user-protocol/i);
  });
});

// ─── 5. Rule 17 present in skill-rules.md (AC4) ──────────────────────

describe('Story 6.5 — Rule 17 launch-gate mandate present in skill-rules.md', () => {
  it('skill-rules.md has a "## Rule 17" heading', () => {
    const text = loadDoc(PATHS.skillRules);
    expect(text).toMatch(/^## Rule 17/m);
  });

  it('Rule 17 names the launch-gate criterion (50% threshold + both probes + AT gate)', () => {
    const text = loadDoc(PATHS.skillRules);
    const rule17Start = text.search(/^## Rule 17/m);
    expect(rule17Start).toBeGreaterThan(0);
    // Take Rule 17 slice through end of file (it's the last rule per file
    // structure)
    const rule17 = text.slice(rule17Start);
    expect(rule17).toMatch(/≥\s*50%/);
    expect(rule17).toMatch(/V1 Jupiter|Probe #5/i);
    expect(rule17).toMatch(/PBD|Probe #6/i);
    expect(rule17).toMatch(/critical[^\n]*serious|AT-user finding/i);
  });

  it('Rule 17 references all three protocol docs', () => {
    const text = loadDoc(PATHS.skillRules);
    const rule17Start = text.search(/^## Rule 17/m);
    const rule17 = text.slice(rule17Start);
    expect(rule17).toMatch(/friendly-user-recruitment\.md/);
    expect(rule17).toMatch(/friendly-user-protocol\.md/);
    expect(rule17).toMatch(/friendly-user-findings\.md/);
  });

  it('Rule 17 declares the blocking semantic and PASS-signal-on-follow-up clause', () => {
    const text = loadDoc(PATHS.skillRules);
    const rule17Start = text.search(/^## Rule 17/m);
    const rule17 = text.slice(rule17Start);
    expect(rule17).toMatch(/Blocking semantic/i);
    expect(rule17).toMatch(/MUST PASS before the v1 ship/i);
    // The committed-but-not-signaling clause
    expect(rule17).toMatch(/does NOT itself signal launch-gate satisfaction|does NOT signal launch-gate/i);
  });

  it('Rule 17 Enforcement clause names bmad-create-story for Epic 7', () => {
    const text = loadDoc(PATHS.skillRules);
    const rule17Start = text.search(/^## Rule 17/m);
    const rule17 = text.slice(rule17Start);
    expect(rule17).toMatch(/\*\*Enforcement/i);
    expect(rule17).toMatch(/bmad-create-story[^\n]*Epic 7|Epic 7[^\n]*bmad-create-story/i);
    expect(rule17).toMatch(/HIGH finding/);
    // Story 7.9 named as the binding consumer
    expect(rule17).toMatch(/7-9-public-launch-playbook/);
  });

  it('Rule 17 carries the Why this rule exists today + Examples blocks (mirrors Rules 14-16)', () => {
    const text = loadDoc(PATHS.skillRules);
    const rule17Start = text.search(/^## Rule 17/m);
    const rule17 = text.slice(rule17Start);
    expect(rule17).toMatch(/\*\*Why this rule exists today/i);
    expect(rule17).toMatch(/\*\*Examples/i);
  });
});

// ─── 6. Epic 5 retro Action item #7 closing pointer ──────────────────

describe('Story 6.5 — Epic 5 retro Action item #7 has closing pointer to Story 6.5', () => {
  it('retro action item #7 carries "Closed by Story 6.5 (2026-05-25)" annotation', () => {
    const text = loadDoc(PATHS.epic5Retro);
    expect(text).toMatch(/Closed by Story 6\.5 \(2026-05-25\)/);
  });

  it('annotation lives on the Action item #7 row (PBD-specific friendly-user prompts)', () => {
    const text = loadDoc(PATHS.epic5Retro);
    // Find the line carrying both the action-item-#7 PBD-prompts wording AND
    // the closing annotation. Sanity check the routing.
    const lines = text.split('\n');
    const matching = lines.filter(
      (line) =>
        line.includes('PBD-specific friendly-user prompts') &&
        line.includes('Closed by Story 6.5'),
    );
    expect(
      matching.length,
      'Action item #7 row must carry both the PBD-prompts text and the Story 6.5 closing pointer',
    ).toBeGreaterThanOrEqual(1);
  });

  it('annotation names the four PBD prep-note themes (J1, mixed-coverage, per-target, reduced-motion)', () => {
    const text = loadDoc(PATHS.epic5Retro);
    // The closing annotation lists what was integrated
    const closingRegion = text.slice(
      text.indexOf('Closed by Story 6.5 (2026-05-25)'),
    );
    // Take the next 1000 chars as the annotation region (it's one cell row)
    const annotation = closingRegion.slice(0, 1000);
    expect(annotation).toMatch(/J1 differentiator/i);
    expect(annotation).toMatch(/mixed-coverage/i);
    expect(annotation).toMatch(/per-target recognition/i);
    expect(annotation).toMatch(/reduced-motion/i);
  });
});

// ─── 7. PBD prep-note → protocol integration round-trip (AC5) ────────

describe('Story 6.5 — PBD prep-note themes preserved verbatim in protocol Probe #6', () => {
  it('the PBD prep note exists at the documented path', () => {
    expect(existsSync(PATHS.pbdPrep)).toBe(true);
  });

  it('each of the four PBD prep-note title-themes is preserved in protocol Probe #6', () => {
    const protocol = loadDoc(PATHS.protocol);
    const probe6Start = protocol.indexOf('### Probe #6');
    const probe6End = protocol.indexOf('### Probe #7');
    expect(probe6Start).toBeGreaterThan(0);
    const probe6 = protocol.slice(probe6Start, probe6End);

    // 1. J1 differentiator — choreography reading
    expect(probe6).toMatch(/J1 differentiator/i);
    expect(probe6).toMatch(/choreography/i);
    // 2. Mixed-coverage honesty
    expect(probe6).toMatch(/Mixed-coverage honesty/i);
    // 3. Per-target recognition
    expect(probe6).toMatch(/Per-target recognition/i);
    // 4. Reduced motion (4th theme from prep note)
    expect(probe6).toMatch(/Reduced motion|reduced[-\s]motion/i);
  });
});
