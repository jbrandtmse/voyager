# Voyager Friendly-User Recruitment Protocol

**Authored:** Story 6.5 (2026-05-25) — implements UX-DR38 (friendly-user testing protocol incl. AT user) + PRD launch-gate commitment ("differentiator-perception result becomes the launch gate").

This document defines **who** Voyager recruits for its pre-launch qualitative testing pass, **how** participants are recruited, and **what** consent + privacy commitments the project honors. The session protocol that participants are run through lives in [`./friendly-user-protocol.md`](./friendly-user-protocol.md); aggregate findings land in [`./friendly-user-findings.md`](./friendly-user-findings.md).

This is the project's ONE pre-launch user-testing pass. Recruitment quality directly determines whether the launch-gate verdict is meaningful. A pool of space-mission domain experts would over-perceive the attitude differentiator; a pool with no AT user would silently skip the accessibility validation half of the gate. The criteria below exist to keep the pool calibrated.

---

## Sample size + diversity targets

| Dimension | Target | Rationale |
|---|---|---|
| **Total participants** | 5–10 | Nielsen Norman Group's standard usability-testing range. Below 5, theme clustering is unreliable. Above 10, marginal new findings diminish. |
| **AT user count** | ≥ 1 (required) | UX-DR38 + PRD § "Layer 4: User testing with assistive technology users" — a launch-gate-blocking commitment, not a stretch goal. If the natural pool yields zero AT users, vendor recruitment is mandatory (see below). |
| **Gender diversity** | Target ≥ 40% non-male | Maya-persona match per UX spec (the canonical first-time-user reads as a 28-year-old woman); the project should not validate the differentiator against an exclusively male pool. |
| **Age range** | 25–55, with at least 2 participants in 30–45 (Maya window) | Wider net catches generational variation in "what does space simulation read as?"; the 30–45 anchor matches Maya's profile. |
| **Geographic / cultural diversity** | Target ≥ 2 participants outside the maintainer's primary network (US/Canada) | Mitigates the "all my friends are software engineers in Seattle" pool bias. |
| **AT setup diversity (for the AT user(s))** | Prefer screen-reader user (VoiceOver / NVDA / JAWS); keyboard-only acceptable | Screen-reader coverage is the highest-impact a11y validation surface; if multiple AT users participate, prefer diversity across SR + keyboard-only + magnifier. |

The 5–10 first-time users **+** the AT user inclusion is what makes this launch-gate-quality testing, not generic usability testing. The PRD § "5–10 friendly first-time-user qualitative test sessions" is the binding commitment.

---

## Persona match criteria (the Maya profile)

Reference: `_bmad-output/planning-artifacts/ux-design-specification.md` § "Personas".

### Must-be criteria — all required

- **Space-curious adult.** Reads science journalism (Quanta, Ars Technica, BBC Sky at Night, similar) occasionally but is not a working scientist or engineer. Recognizes "Voyager" as "those probes that left the solar system" but has not read mission-history books or browsed NASA archive sites for fun.
- **First-time visitor to the Voyager artifact.** Has not been briefed on the artifact's design vocabulary (attitude reconstruction, scan platform, narrow-angle camera frustum, CK kernels, etc.). Has not seen screenshots or builds.
- **Internet-literate adult.** Has used a desktop browser to scrub a video timeline, copy a URL, share a link via messaging. Comfortable with keyboard navigation if asked.
- **Available for a 30–45 minute facilitated session.** Plus 5 minutes setup + 10 minutes exit interview.

### Must-NOT-be criteria — any disqualifies

- **Already briefed on the Voyager artifact.** Anyone the maintainer has previously shown screenshots, builds, design vocabulary, or development discussion. (Cousins, partners, close collaborators are usually disqualified for this reason.)
- **Professional space-mission domain experts.** Active astronomers, mission engineers, JPL employees, planetary scientists. They over-perceive attitude reconstruction because they already know what to look for; their data does not validate the differentiator's accessibility to a general audience.
- **Hostile or skeptical to the format.** Users who fundamentally disagree with "interactive web artifacts as a medium for science communication" do not produce useful signal for THIS validation; their critique is a separate (valid) conversation.
- **Hardware-incompatible.** Users without WebGL2 + WebAssembly + Brotli-decoding browsers (universal in 2026, but verify) — Voyager's friendly-fallback page is the right experience for them, not the artifact.

---

## Recruitment pool sources

### (a) Network recruitment — primary channel

The maintainer's first-degree connections matching the persona criteria. Friends-of-friends acceptable if the introducer can verify "not previously briefed".

**Pros:** zero cost, fast scheduling, trust already established (lowers consent friction).
**Cons:** narrow demographic; risk of recruiting too many software/tech professionals; harder to find AT users.

**Tactic:** the maintainer sends a short recruitment note (template below) to candidates, allows self-selection on whether the format / topic appeals. Compensation is offered up-front so the participant doesn't feel they're doing a favor.

### (b) Vendor recruitment — fallback when network is exhausted or insufficient

Engaged when:
- Network recruitment yields < 5 first-time users matching all criteria.
- Network recruitment yields zero AT users (THE common case — most first-degree networks do not include AT users).
- The maintainer wants demographic diversity outside their direct network.

**Vendor candidates:**

| Vendor | URL | Strength | Cost order of magnitude |
|---|---|---|---|
| **UserTesting.com** | `usertesting.com` | Large pre-screened pool; demographic filters; rapid turn-around (24–72h to schedule). Best for first-time-user general recruitment. | $30–80 per session, plus platform subscription |
| **Fable Tech Labs** | `fable.tech` | Specializes in accessibility user testing — pre-vetted pool of AT users (screen-reader, keyboard-only, magnification, switch). The strongest fit for the AT-user requirement. | $150–300 per AT session (premium reflects domain specialization) |
| **Inclusive Design Research Centre (IDRC)** | `idrc.ocadu.ca` | OCAD University's research centre; engages with researchers + community for inclusive-design user studies. Slower turnaround; high quality. Useful if Fable's pool isn't a match or as a second AT-user source. | Project-by-project rates; typically $200–500 per session |
| **Knowbility** | `knowbility.org` | Austin-based nonprofit; runs the AccessU conference; offers user-research engagements including AT-user studies. Comparable to Fable; sometimes faster on availability for one-off engagements. | $150–400 per session |

Fable Tech Labs is the project's preferred AT-user vendor — it specializes specifically in this use case and the pool is pre-vetted for legitimate AT users (not "I once used a screen reader" generalists). IDRC and Knowbility are backup channels.

The vendor cost is documented as a **launch-gate budget item** per UX-DR38, not a stretch goal. The maintainer pre-clears the budget at sprint planning before vendor engagement.

### Recruitment note template (network channel)

```
Subject: Quick favor — 30-min user test on a Voyager mission web thing I've built

Hi [name],

I've been building an interactive web artifact about the Voyager 1 and 2 missions (the
spacecraft) and I'm trying to validate it with first-time users before releasing it
publicly. Would you have 45 minutes in the next two weeks to walk through it while I
watch?

What I'm asking:
- 30-45 min screen-share session (Zoom / Meet / your preference)
- You explore the artifact while saying what you're thinking out loud
- I take notes; I do NOT record audio/video unless you explicitly consent (no pressure)
- $25 [or other amount] gift card as a thank-you

What I'm NOT asking:
- Any prior knowledge of the project, of space missions, or of the design vocabulary
- A formal review or critique — just "what do you see, what do you notice, what's confusing"

Hard constraints:
- Have you already seen any screenshots or builds I've sent around? If yes, you're not
  eligible for this round — sorry, it'd bias the results.
- Are you a working astronomer / planetary scientist / NASA-engineer? If yes, same answer
  — your data point would skew things.

Let me know if you're in. Happy to schedule any time after [date].

Thanks,
[maintainer name]
```

---

## Consent + privacy commitments

These are binding. Every session begins with the participant reading + agreeing to the consent statement below before any exploration starts.

### Consent statement (presented to every participant before session start)

```
Voyager friendly-user session consent

What this session is:
- A 30-45 minute walkthrough of an interactive web artifact about the Voyager missions.
- You will be asked to "think aloud" — describe what you see, what you're trying to do,
  and what's confusing.

Recording:
- The maintainer will take written observation notes during the session.
- Audio / video / screen recording is OPTIONAL and only happens with your explicit YES
  below. Without your consent, no audio, video, or screen capture is taken.

Privacy:
- No real names appear in the published findings document. Participants are referred to
  as "User #1", "User #2", etc.
- Aggregated findings ARE published as part of the project's public documentation.
- If recordings are made (with your consent), they are stored encrypted on the
  maintainer's local machine and deleted after the maintainer has completed analysis
  (within 30 days), unless you specifically ask for them to be retained or deleted
  earlier.

Withdrawal:
- You can withdraw consent at any time, during or after the session. Your data is
  destroyed within 24 hours of your withdrawal request. Email [maintainer email] to
  withdraw.

Compensation:
- You receive a $25 [or other] gift card / cash payment as a thank-you, regardless of
  whether you complete the full session or withdraw partway.

Acknowledgement:
- [ ] I've read this and consent to participate.
- [ ] (OPTIONAL) I consent to audio/video/screen recording.
- Name (will not appear in published findings): _________________
- Date: _________________
```

The consent text is read aloud OR shared via DM before the session, and the participant explicitly checks the boxes before the session begins. The maintainer keeps the signed consent record locally (encrypted) for the duration of project records; the consent record is destroyed within 30 days of the published findings doc landing.

### Ethics review posture

Voyager is an unaffiliated solo-developer project — there is no institutional review board (IRB) overseeing this user-testing pass. The consent + privacy commitments above are the project's binding internal ethics contract, drafted with reference to common-practice norms for short-format usability testing (Nielsen Norman Group guidance, the ACM SIGCHI consent template, the IDRC's accessibility user-research consent norms).

**Vendor-channel review:** when sessions are run through a vendor (Fable Tech Labs, IDRC, Knowbility, UserTesting.com), the vendor operates under its own consent + ethics framework. Vendor-administered consent supersedes the project's network-channel consent for those sessions — the maintainer accepts the vendor's terms when engaging. The vendor's consent record is the binding artifact for those participants. The findings doc still aggregates pseudonymously per the project's privacy rules, regardless of source channel.

**Should institutional affiliation change:** if a future contributor brings the project under a university / nonprofit / company umbrella with its own IRB, that body's review process supersedes this internal contract for any subsequent user-testing pass. Amend this doc + the findings doc accordingly per Rule 5 discipline.

### Privacy operational rules

- **No PII retained.** Real names live only in the maintainer's local consent records, encrypted, with a 30-day retention. No real names anywhere in the published findings doc, in commits, in chat logs, or in any project artifact.
- **Pseudonym scheme.** The findings doc refers to participants as `User #1`, `User #2`, … in the order they were recruited. AT users get the same numbering with an `(AT)` suffix in section headings (e.g., `User #4 (AT)`).
- **Recordings (if any) stored encrypted.** If a participant consents to recording, the file lives on the maintainer's local disk only, with full-disk encryption. Not uploaded to cloud storage, not shared. Deleted within 30 days of findings publication unless the participant explicitly asked for retention.
- **Withdrawal honored within 24 hours.** Any withdrawal request triggers immediate destruction of the consent record + any recording. The participant's contribution to the aggregated findings is removed (or, if removal would invalidate the sample-size threshold, the gate is re-opened pending re-recruitment).
- **Findings doc is publicly committed.** Participants are informed of this BEFORE consenting. Anyone uncomfortable with public commitment of their (pseudonymized) feedback is welcome to decline.

---

## Compensation

| Channel | Amount | Form | Notes |
|---|---|---|---|
| **Network — first-time user** | USD 25 | Digital gift card (Amazon, Visa, or recipient's choice) OR cash equivalent (PayPal / Venmo / e-Transfer) | Paid within 7 days of session completion. |
| **Network — AT user** | USD 50 | Same options | Higher rate reflects the additional setup cost (AT users often spend longer on session-tooling configuration). |
| **Vendor — first-time user (UserTesting.com)** | Vendor handles compensation | Vendor's standard rate | Maintainer pays the vendor; vendor pays the participant. No direct money flow between maintainer and participant. |
| **Vendor — AT user (Fable / IDRC / Knowbility)** | Vendor handles compensation | Vendor's standard rate | Same — maintainer pays vendor only. |

Compensation is offered up-front in the recruitment note, never made conditional on "session went well" or any quality bar. Participants who attend but don't complete (timeout, technical issues, choose to leave early) still receive full compensation.

**Budget caveat:** if Fable / IDRC / Knowbility vendor engagement costs exceed USD 500 for the AT-user portion, the maintainer pauses to re-confirm budget at sprint planning before booking. UserTesting.com general-pool sessions are pre-cleared up to USD 300 total spend.

---

## Recruitment timeline

| Week | Activity | Output |
|---|---|---|
| **Week 1** | Send network recruitment notes to ~10 candidates; assess AT-user gap; if needed, kick off Fable engagement | 3–5 network candidates confirmed; AT-user vendor engagement in flight if gap detected |
| **Week 2** | Schedule sessions; finalize protocol against any candidate-specific accessibility needs | 5–8 sessions scheduled; AT-user session(s) confirmed |
| **Week 3** | Run sessions (typically 2–3 per day with sufficient note-taking gaps) | All sessions complete; raw notes captured per session |
| **Week 4** | Synthesize findings; populate `friendly-user-findings.md`; render launch-gate verdict | Findings doc PASS or BLOCKED verdict; remediation issues filed if BLOCKED |

The 2–4 week timeline is the target. Vendor recruitment for AT users may extend Week 1; that's acceptable. Sessions and synthesis are time-boxed to keep the launch-gate signal fresh.

---

## Re-validation routing (if findings are BLOCKED)

The findings doc's "Launch-gate verdict" section enumerates the explicit re-run path. The short version:

1. If < 50% perceive attitude reconstruction at V1 Jupiter OR PBD unprompted, the gate is BLOCKED.
2. The V1 Jupiter chapter's UI affordances (camera framing prominence, scan-platform articulation visibility, boresight cone presence, chapter copy lede) are scoped for remediation BEFORE launch.
3. PBD's chapter copy + composite-layer timing are reviewed similarly.
4. After remediation lands, Story 6.5 RE-ENTERS the pipeline as a re-run — fresh recruits (no participant who saw the original sees the remediated version; that biases against unprompted perception).

The re-run is a full Story 6.5 cycle, not a partial one. The launch-gate signal requires unprompted first-time-user perception; participants who've already seen the artifact cannot produce that signal again.

---

## Cross-references

- **Session protocol** — [`./friendly-user-protocol.md`](./friendly-user-protocol.md). The probes, success/failure criteria, exit-interview structure, AT-user special handling, and facilitator notes.
- **Findings template** — [`./friendly-user-findings.md`](./friendly-user-findings.md). The structure aggregate findings populate post-session.
- **Maya persona** — [`_bmad-output/planning-artifacts/ux-design-specification.md`](../../_bmad-output/planning-artifacts/ux-design-specification.md) § Personas.
- **PRD launch-gate commitment** — [`_bmad-output/planning-artifacts/prd.md`](../../_bmad-output/planning-artifacts/prd.md) (search "differentiator-perception" / "friendly-user").
- **UX-DR38** — [`_bmad-output/planning-artifacts/ux-design-specification.md`](../../_bmad-output/planning-artifacts/ux-design-specification.md) § "Layer 4: User testing with assistive technology users".
- **Skill-rules launch-gate gate** — [`_bmad/custom/skill-rules.md`](../../_bmad/custom/skill-rules.md) Rule 17.

---

## Sign-off

This recruitment protocol is the binding pre-launch user-testing contract. Modifications between Story 6.5 commit and the maintainer's session execution are documented as amendment blocks at the bottom of this file (preserve original wording per Rule 5 discipline).

**Amendment log:**

(none yet — original version landed in Story 6.5, 2026-05-25)
