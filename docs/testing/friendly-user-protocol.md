# Voyager Friendly-User Session Protocol

**Authored:** Story 6.5 (2026-05-25) — implements UX-DR38 + PRD launch-gate commitment.
**Resolves:** Epic 5 retro Action item #7 — PBD-specific friendly-user prompts from `_bmad-output/implementation-artifacts/5-2-friendly-user-prep.md` incorporated into Probe #6.

This document is the binding session protocol the facilitator runs every friendly-user (and AT-user) session against. **Probes #5 and #6 are the differentiator-perception launch gate per the PRD.** A failure on either probe at the 50% cohort threshold blocks the v1 ship pending remediation + re-run.

Recruitment is governed by [`./friendly-user-recruitment.md`](./friendly-user-recruitment.md). Aggregate findings populate [`./friendly-user-findings.md`](./friendly-user-findings.md). Skill-rules enforcement of the launch-gate verdict lives at [`_bmad/custom/skill-rules.md`](../../_bmad/custom/skill-rules.md) Rule 17.

---

## Session-at-a-glance

| Block | Duration | Goal |
|---|---|---|
| Setup + consent | 5 min | Verify consent recorded; confirm tech setup (browser, screen-share, AT if applicable). |
| Probes #1–#8 (this protocol) | 25–30 min | Walk participant through ordered probes. |
| Exit interview | 10 min | Likert ratings + open-ended quote capture. |
| Wrap | 2 min | Thank participant, confirm gift card delivery channel, end recording (if any). |

**Total time:** 40–45 minutes (10 min over the floor of 30 min to allow for unhurried think-aloud).

---

## Facilitator preparation checklist

Before the session begins:

- [ ] Recruit + consent confirmed per [`./friendly-user-recruitment.md`](./friendly-user-recruitment.md).
- [ ] Participant browser is one of Chrome / Firefox / Safari stable on desktop. **Do not run mobile sessions in this round** — the Maya persona is desktop-first; mobile is a separate validation later.
- [ ] Screen-share working (Zoom / Meet / Discord — facilitator's choice).
- [ ] Participant has been given the start URL `https://[deployment URL]/` (the production deploy, NOT a dev build, NOT a chapter deep-link). If pre-launch and not deployed, run against `npm run preview` on the maintainer's machine via screen-share.
- [ ] Facilitator has a blank session-note template ready (Google Doc / Markdown / notebook).
- [ ] Facilitator is muted-microphone-by-default during the participant's think-aloud blocks; clarification questions wait for natural pauses.
- [ ] AT-user setup confirmed (if applicable) — screen-reader running, keyboard-only verified, magnifier configured. **The AT user runs their preferred AT setup from the start of probe #1, NOT after some "now do it with accessibility" reframing.**

---

## Probes — in order, no skipping, no reordering

Each probe below carries:

- **Setup:** what the facilitator does/says before the participant starts.
- **Probe wording:** the literal sentence the facilitator says to the participant. The wording is calibrated to be non-leading; deviation biases the signal.
- **Time box:** maximum time spent on the probe before the facilitator moves on.
- **Success criterion:** the explicit observable signal that the probe passed.
- **Failure criterion:** what counts as failure.
- **Notes to capture:** what the facilitator writes down regardless of pass/fail.

### Probe #1 — Cold-load first-paint impression

**Setup:** Facilitator opens the production URL in the participant's browser via screen-share. The Voyager title card displays, then dissolves to the simulation. Facilitator says nothing until the dissolve completes.

**Probe wording:** "Describe what you're looking at."

**Time box:** 60 seconds.

**Success:** Participant identifies the artifact as a space simulation OR a representation of the Voyager mission. Acceptable identifications include: "space probe simulation", "interactive thing about Voyager", "scale model of the solar system with the probes". Specificity escalates from acceptable to better, but the floor is "this is about space and the Voyager probes / solar system".

**Failure:** Participant is confused ("I have no idea") or assumes wrong genre ("is this a game?", "is this a screensaver?", "is this a planetarium app?").

**Notes to capture:**
- First word / phrase they used
- Whether they noticed the title-card lede ("Voyager. 1977 to 2030.")
- Whether they noticed any individual HUD element unprompted (clock, attitude indicator, scrubber)
- If they asked clarifying questions, what they were

---

### Probe #2 — First-scrub responsiveness

**Setup:** No facilitator-driven action; the simulation is paused at boot (the first-time-visitor default per the artifact's behavior).

**Probe wording:** "Try dragging the bar at the bottom."

**Time box:** 90 seconds.

**Success:** Participant locates the scrubber unprompted within 60 seconds AND moves the date forward by some amount (the HUD date visibly changes; the participant verbally registers the change).

**Failure:** Participant cannot locate the scrubber after 90 seconds OR drags it but doesn't notice that time is advancing (e.g., they let go immediately, don't watch the date, don't comment on the changing scene).

**Notes to capture:**
- Time-to-discovery (in seconds, from facilitator's wording to first drag)
- Whether they discovered the play button first
- Whether they noticed the speed multiplier
- Any verbal commentary about "what does this control"

---

### Probe #3 — Unguided exploration

**Setup:** Facilitator resets to the cold-load state IF the participant has drifted far away; otherwise leaves the artifact in its current state from Probe #2.

**Probe wording:** "Spend a few minutes doing whatever feels natural. No instructions — just explore. I'll watch and not interrupt."

**Time box:** 5 minutes.

**Success:** Participant navigates to at least 2 distinct chapters by any mechanism — URL bar entry, chapter-index opening (M shortcut or click), scrubber drag past a chapter boundary, About-page navigation. Bonus: they discover the help overlay (? key or click), the audio toggle, or the embed mode.

**Failure:** Participant gives up before 3 minutes OR asks for help OR sits inactive (no input for > 60 seconds twice in the block).

**Notes to capture:**
- The sequence of things they tried
- What they found vs. what they missed
- Any verbal "huh" / "oh" / "wait" moments — these are the highest-signal qualitative moments
- Whether they tried any keyboard shortcuts unprompted

**Facilitator behavior:** SILENT during this block. If they ask "what does this do?" respond "what do you think it does? Try it." If they say "I don't know what to do", say "this is free-form exploration; do whatever feels natural — there's no wrong answer." Do not lecture. Do not point.

---

### Probe #4 — First-encounter at V1 Jupiter unprompted

**Setup:** Facilitator says "let me move you to a specific moment" and navigates the scrubber (or types the URL `/c/v1-jupiter`) to the V1 Jupiter encounter. Lets the scene settle (camera transition, attitude indicator label updates).

**Probe wording:** "What do you see happening here?"

**Time box:** 90 seconds.

**Success:** Participant notices the encounter-framing change. Acceptable observations include: "the camera moved closer to / centered on Jupiter", "we're looking from / following / next to the spacecraft now", "the path is bending around Jupiter", "the moons are moving", "the trajectory is curving". The framing change registering at all is the success bar.

**Failure:** Participant describes only the planet ("that's Jupiter") and / or the trajectory line ("it's flying by Jupiter") without acknowledging that something about the camera, view, or framing has changed.

**Notes to capture:**
- What they noticed first
- Whether they used the word "camera", "view", "viewpoint", "perspective"
- Whether they used the word "encounter", "flyby", "pass"
- Whether they asked any questions

---

### Probe #5 — UNPROMPTED ATTITUDE PROBE (THE LAUNCH GATE per the PRD)

**Setup:** Stay at the V1 Jupiter encounter from Probe #4. Do not navigate. Do not introduce new vocabulary. The facilitator's question is the only new input.

**Probe wording:** "Anything you noticed about the spacecraft itself?"

**Time box:** 90 seconds.

**Success — ATTITUDE PERCEIVED:** Participant mentions ANY of the following unprompted:
- The spacecraft turning, rotating, or pivoting
- The scan platform articulating, moving, swivelling
- The camera or instruments pointing, aiming, looking at something
- The boresight cone / sight-line / pointing direction
- The attitude-indicator HUD element (the small monitor at top-right showing pitch/yaw/roll or "ATT CK reconstructed" labels)
- The CK-vs-synth distinction (very advanced; rare; counts as strong success)

The threshold is **mentions any attitude reconstruction observable**. The participant does NOT need to use the word "attitude" — that's the artifact's internal vocabulary. They need to notice that the spacecraft is doing something *with itself* (rotating / aiming / pointing) beyond the trajectory carrying it past Jupiter.

**Failure:** Participant describes only the spacecraft's position (the trajectory carrying it past Jupiter) without acknowledging any attitude / orientation / pointing behavior. A response like "it's flying past Jupiter" or "it's going around" or "the path is bending" is a FAIL — those are trajectory observations, not attitude observations.

**Hard rule — leading is disqualifying:**

If the facilitator has at any point in the session said "watch the spacecraft", "look at the cameras", "notice how it's pointing", "see the model rotating", or any similar steering language — the probe is contaminated for this participant and recorded as **NOT MEASURED**, neither success nor failure. The differentiator-perception signal requires unprompted noticing. **A user who needs to be prompted with "look at the spacecraft" does NOT count as success.**

**Notes to capture:**
- The exact wording the participant used
- Time-to-first-attitude-observation (in seconds from the probe wording, if they passed)
- Whether they distinguished the scan platform from the spacecraft body (very strong success signal)
- Whether they noticed the attitude indicator HUD element

This probe's per-participant outcome is the load-bearing input to the launch-gate verdict. Capture verbatim quotes if at all possible.

---

### Probe #6 — Pale Blue Dot chapter

**Setup:** Facilitator navigates to the PBD chapter via `/c/pale-blue-dot` (deep-link) OR via chapter index. Lets the scene settle (it lands at the cinematic-arc anchor; the PBD substate sequence begins ~0–15s after navigation). Encourage the participant to watch for ~30 seconds before answering.

**Probe wording:** "What is happening here?"

**Time box:** 2 minutes (longer than other probes — PBD has a multi-substate choreography that takes time to read).

**Success — PBD reconstruction perceived:** Participant notices ANY of the following unprompted (per Story 5.2 PBD prep notes, `5-2-friendly-user-prep.md`):

1. **J1 differentiator — choreography reading.** The spacecraft is physically turning. The participant reads it as choreography (the camera is being aimed; this is a deliberate sequence) rather than spectacle (something pretty is happening). Acceptable: "it's turning to look at things", "the spacecraft is rotating to take pictures", "it's pointing at each planet in turn".

2. **Mixed-coverage honesty (probe-only if naturally relevant).** When prompted about provenance (only if the chapter copy is read aloud OR the participant asks "is this real?"), the participant distinguishes the historical body turn from the reconstructed platform aim. Acceptable: "I see that the chapter copy says some parts are reconstructed". This sub-probe does NOT need to fire for overall success — it's a bonus signal.

3. **Per-target recognition.** Participant can identify which planet the platform is aiming at during each `sweeping_<body>` substate ("oh, now it's pointing at Earth"; "now it's pointing at Jupiter"; "now Saturn"). Strong success.

4. **Photo plate composition.** Participant notices the NASA Photojournal plates appearing in the scene at the corresponding instants ("I see a photo of Earth showing up", "those are real photos overlaid").

5. **Reduced motion** (only applies if participant has `prefers-reduced-motion: reduce` enabled): The instant-cut variant still communicates the choreography. Acceptable: "I can tell it's aiming at each planet in turn" — even without the smooth slerp.

The success bar is: participant notices the historical-reconstruction framing — the spacecraft physically turns AND/OR the photo plates appear AND/OR the planet-by-planet aim is recognized. Any one of these unprompted is PASS.

**Failure:** Participant only describes the planets in view ("those are the planets") OR the empty space ("not much is happening, it's just space") without registering ANY of the reconstruction framing — the turn, the plates, the per-target aim, or the choreography.

**Notes to capture:**
- The exact wording the participant used
- Which of the 5 success sub-criteria fired
- Whether the participant asked any meta questions ("is this how it actually happened?", "are these real photos?")
- Whether they read the chapter copy unprompted

**Cross-reference for facilitator:** the PBD chapter copy at `web/src/chapters/pale-blue-dot/copy.ts` (rendered via `<v-chapter-copy>`) acknowledges the reconstruction posture ("scan-platform aim shown here is reconstructed from ephemeris constraints; the body turn is from the historical CK"). If the participant reads this aloud, capture their reaction; if they don't read it, do not direct them to.

---

### Probe #7 — Deep-link copy-and-share flow

**Setup:** Facilitator says "let's say you wanted to send this exact moment to a friend".

**Probe wording:** "If you wanted to send this exact moment to a friend, how would you do that?"

**Time box:** 60 seconds.

**Success:** Participant copies the URL from the address bar OR identifies a share affordance in the UI (if one exists — note: the artifact's share mechanism is URL-as-public-API per ADR-0001, no explicit share button in v1). Acceptable: "I'd copy the URL", "I'd send the link", "the address bar has the timestamp".

**Failure:** Participant says it can't be shared, or tries to take a screenshot as the primary mechanism, or fails to identify any way to share.

**Notes to capture:**
- Mechanism the participant chose
- Whether they noticed the URL changing as they scrubbed (this is the key artifact behavior)
- Whether they asked about social-share buttons (signal that the URL-as-API approach may not be discoverable enough)

---

### Probe #8 — About page discoverability

**Setup:** No special setup; stay where the participant is.

**Probe wording:** "Where would you find more about how this was made?"

**Time box:** 60 seconds.

**Success:** Participant finds the About page within 30 seconds via any mechanism (URL `/about`, chapter index, keyboard shortcut `A`, footer link if present).

**Failure:** Participant cannot locate the About page within 60 seconds OR says "I don't know" without trying.

**Notes to capture:**
- Mechanism used
- Whether they noticed any About affordance during Probe #3 unguided exploration

---

## Exit interview — 10 minutes after Probe #8

Run the exit interview while the artifact is still on-screen. Participants tend to give more grounded answers when they can refer back to specific moments.

### Likert ratings (1–5 scale)

For each dimension, the facilitator says: "On a scale of 1 to 5, where 1 is [low anchor] and 5 is [high anchor], …"

| Dimension | Question | Low (1) | High (5) |
|---|---|---|---|
| **Awe** | "How did the experience make you feel?" | Boring / sterile / mechanical | Profound / moving / inspiring |
| **Restraint** | "Was the artifact telling you what to think, or letting you discover?" | Lecturing / didactic | Letting me discover |
| **Trust** | "Did the information feel accurate / authoritative?" | Felt made-up / approximate | Felt like trustworthy NASA-grade data |
| **Recognition** | "Did you feel like you were seeing real history, or a simulation?" | Pure simulation / abstract | Real historical reconstruction |

These four dimensions map to the UX spec's Step 4 emotional design principles. Record both the number AND any short qualitative explanation the participant volunteers ("4, because the chapter copy was great but the title card felt staged").

### Open-ended qualitative quotes

Ask each of the following in order. Encourage detailed responses; do not interrupt. Capture verbatim quotes.

1. **"What was the most surprising moment?"**
2. **"What would you tell a friend about this?"**
3. **"What confused you?"**
4. **"What would you change about it?"** (optional, time permitting)
5. **"Anything you want to ask me about how it was built?"** (optional, time permitting; ONLY answer questions here — never lecture during the session itself)

### AT-user exit-interview additions (run for AT participants only)

After the four standard quotes above, ask:

1. **"Was the screen reader announcing the right things at the right times?"** (Capture: false positives, false negatives, announcement timing relative to visual events.)
2. **"Were there any moments you couldn't get to with the keyboard?"**
3. **"Did anything announce in a confusing or unhelpful way?"**
4. **"What would you change about the screen-reader experience specifically?"**

These feed back into the manual a11y checklist at [`docs/accessibility/manual-test-checklist.md`](../accessibility/manual-test-checklist.md). AT-specific findings flagged as critical or serious by the AT user become launch-blocking issues per UX-DR38 + AC4 of Story 6.5.

---

## AT-user special-handling section

The AT user runs the SAME 8 probes + the SAME exit interview. The protocol does not branch on user type for the differentiator-perception probes; the launch-gate criterion applies to ALL participants regardless of AT setup.

**Additional setup for AT participants:**

- The AT user runs their preferred assistive technology from the start. The facilitator does NOT switch off AT, does NOT ask "now do it without AT".
- If the AT setup is screen-reader-only (no mouse, no visual reference), Probe #1 wording is adjusted to "Describe what your screen reader is announcing": same probe, AT-native input modality. The success criterion is unchanged.
- For Probe #4 / #5, if the participant can't see the visual scene, the relevant questions are "Anything the screen reader has announced about the spacecraft itself?" — again, the criterion is unchanged: did the participant register any attitude/orientation/pointing observation unprompted.
- Probe #6 (PBD) for an AT user surfaces a known limitation — the PBD reconstruction is heavily visual (photo plates compositing). The success criterion broadens to include: "the screen reader narrated the per-target aim / chapter-copy lede / plate-appearance announcements". If NONE of these are announced, that's a launch-blocking AT a11y finding regardless of differentiator-perception outcome.

**Additional probes for the AT user (in addition to the 8 main probes):**

- **AT-Probe A — Screen-reader landing announcement.** On cold-load, the screen reader's first announcement should orient the participant. Success: the AT user can describe what the artifact IS from the first announcement.
- **AT-Probe B — Chapter navigation keyboard-only flow.** The AT user opens the chapter index via M key, navigates with arrows, selects with Enter, hits Esc to dismiss. Success: full keyboard-only chapter navigation completes within 60 seconds.
- **AT-Probe C — Scrubber operation under AT.** The AT user moves the timeline scrubber via Arrow / Shift+Arrow / Home / End. Success: the scrubber's `aria-valuenow` reflects positions correctly; date announcements track the scrubber state.
- **AT-Probe D — Help overlay open + dismiss.** AT user opens the help overlay via `?`, navigates the content with screen reader, dismisses with Esc. Success: focus-trap works correctly; focus returns to the trigger element on dismiss.
- **AT-Probe E — Attitude indicator announcement.** The AT user lands at V1 Jupiter (Probe #4 setup). The attitude indicator's announcement is the AT-native equivalent of the visual differentiator. Success: the AT user describes the attitude indicator's content unprompted (CK label, axes, pointing direction).

AT findings feed directly into the manual a11y checklist + the project's defect-tracking. **Critical or serious AT findings BLOCK launch per AC4 of Story 6.5**, irrespective of the visual differentiator-perception threshold.

### AT-finding severity rubric — facilitator classification guide

The launch-gate verdict (findings doc section 8) treats AT findings classified `critical` or `serious` as BLOCKING. The classification is the facilitator's call, made at session close per the rubric below. This rubric is binding — drift here drifts the gate.

| Severity | AT-finding criterion (any one triggers the band) |
|---|---|
| **Critical** | The AT user CANNOT complete a primary user flow (cold-load orientation, scrub timeline, navigate chapters, read chapter copy, open / dismiss help overlay, reach About) using their AT setup. OR: a flashing / strobing / rapid-fade element triggers per NFR-A6 photosensitive safety. OR: focus is permanently lost (keyboard trap) with no Escape recovery. |
| **Serious** | The AT user CAN complete the flow but with significant friction that a sighted-keyboard-only user would not face: missing or wrong announcement on a load-bearing state change (chapter title, scrubber position, attitude indicator); focus order skips a load-bearing control; `aria-pressed` / `aria-expanded` / `aria-valuenow` mismatches the visual state. OR: any WCAG 2.2 Level A failure. |
| **Moderate** | The AT user completes the flow with minor friction: an announcement is verbose or oddly worded but still informative; a non-load-bearing control is not in focus order; redundant or duplicate announcements on the same state change. OR: WCAG 2.2 Level AA failure on a polish surface (not a primary flow). |
| **Minor** | Polish: announcement wording could be friendlier; non-load-bearing role / name; consistency with platform conventions. Not blocking. |

**Worked examples (for facilitator calibration):**

- *"VoiceOver doesn't say anything when the chapter title changes"* — **Serious** (load-bearing state change with missing announcement).
- *"Pressing M to open chapter index gets me there, but Tab cycles through 14 hidden items before reaching the visible list"* — **Serious** (focus order skips / hides load-bearing controls).
- *"The audio toggle announces 'button' but doesn't say what state it's in"* — **Serious** (`aria-pressed` mismatch).
- *"The scrubber works but the date is announced as a Julian-day number, not a calendar date"* — **Moderate** (informative but oddly worded, not load-bearing-broken).
- *"I had to press Tab six times to reach the play button — I expected fewer"* — **Minor** (polish; flow completes).
- *"I pressed Esc in the help overlay and focus went to the body instead of the help toggle"* — **Serious** (focus return on dismiss is a load-bearing dialog contract).
- *"The title-card flash at boot is too quick — felt like a strobe"* — **Critical** (NFR-A6 photosensitive safety).

The rubric mirrors the severity bands used elsewhere in the project (bmad-code-review, deferred-work.md). Facilitators classify each AT finding at session close, document the rationale in the per-user notes, and aggregate into findings doc section 6 (AT findings) + section 7 (Remediation issues filed).

**Disagreement protocol:** if the facilitator is uncertain between two severity bands, the higher band is chosen by default (Critical > Serious > Moderate > Minor). The launch-gate is permissive in the other direction — re-running with fresh recruits is cheaper than shipping a regression.

---

## Facilitator notes — guidance

These are non-binding rules of thumb, refined per session as the facilitator learns the participant pool.

### Avoid leading questions

| Don't say | Do say |
|---|---|
| "Did you notice the spacecraft turning?" | "Anything you noticed about the spacecraft itself?" |
| "Look at the camera moving." | (Silence. Wait.) |
| "The scan platform is articulating, see?" | (If they don't see it, that's the failure signal; do not narrate.) |
| "This is the differentiator we're testing." | (Never tell the participant what the artifact's design vocabulary is.) |
| "You can scrub the timeline with that bar." | "Try dragging the bar at the bottom." (the participant must figure out it's a timeline themselves) |

### When to break silence

- The participant has gone quiet for 60+ seconds with no input action. Prompt with "What are you noticing?" — this is open enough to not lead.
- The participant has asked a direct factual question ("is that Jupiter?"). Answer factually + briefly ("yes"). Do NOT use the answer as a pivot to explain something else.
- The participant is stuck on a UI failure (e.g., the scrubber isn't responding because they're outside the slider track). After 30 seconds of unsuccessful attempts, the facilitator may say "you might need to grab it from the middle of the bar, not the edge" — but this is an a11y-grade UI failure note for the findings, not just a session-facilitation gloss.
- The participant asks for help on something the protocol probes for (e.g., "where's the play button?"). Wait the full time box; the failure is the data point.

### Recording observations without interrupting

- Use a side-Doc / Markdown notebook with a column per probe; type observations during natural pauses (between probes, during participant exploration moments).
- Do NOT narrate observations aloud to the participant ("ah, you didn't notice X, interesting" — this contaminates the rest of the session).
- After each probe, take a 15-second pause to fill in notes before the next probe wording. The participant won't mind a brief silence; it lets them collect their thoughts too.

### What to do if the participant struggles

Common patterns + suggested responses:

| Pattern | Response |
|---|---|
| "I don't know what to do." | "This is a free-form exploration; do whatever feels natural. There's no wrong answer." |
| "What's the goal here?" | "Just describe what you see and try things that look interesting. I'm watching how a first-time visitor experiences it." |
| "Am I doing this right?" | "Yes. There's no right or wrong way — I'm interested in what you notice, not in completing tasks." |
| Participant becomes frustrated and wants to quit | Pause the protocol. Confirm the participant is fine. Offer to continue with a different probe OR to wrap early (compensation honored regardless). |
| Technical breakdown (artifact crashes, browser freezes) | Pause the protocol. Reload. Note the breakdown as a defect for findings. Continue from the next clean probe. |
| Participant volunteers expertise mid-session ("oh, I actually work at JPL") | Pause. Confirm the maintainer's understanding from recruitment — were they disqualified? If yes (they slipped through), record the session result but flag it as "DISQUALIFIED — domain expert". The result does NOT count toward the launch-gate threshold. |

### Calibrating across sessions

- After every 2–3 sessions, the facilitator reviews session notes for patterns of facilitator-introduced contamination (leading phrases, premature explanations, accidental priming).
- If a pattern is found, **the previous sessions are flagged**. The facilitator does NOT retroactively edit notes, but does flag any pre-pattern session for downward weighting in the launch-gate verdict.
- The facilitator may take a 24h break between session blocks to avoid fatigue-driven shortcuts.

---

## Differentiator-perception launch-gate flag

The protocol's binding launch-gate logic — the explicit PASS / BLOCKED criterion the project commits to — is:

> **PASS:** ≥ 50% of participants pass Probe #5 (V1 Jupiter unprompted attitude) AND ≥ 50% pass Probe #6 (PBD unprompted reconstruction) AND no critical or serious AT-user finding remains unresolved.
>
> **BLOCKED:** < 50% pass either Probe #5 OR Probe #6, OR any critical/serious AT-user finding is unresolved.

This is the PRD's qualitative launch-gate bar, codified in [`_bmad/custom/skill-rules.md`](../../_bmad/custom/skill-rules.md) Rule 17. The findings doc's "Launch-gate verdict" section renders this verdict explicitly against actual session data.

**Why 50%:** the PRD treats the differentiator as load-bearing — if fewer than half of first-time users perceive it unprompted, the product reads as a NASA Eyes clone for the majority. The 50% bar is permissive enough that strong UI affordances (boresight cone, articulated platform, attitude indicator label) tip past it; restrictive enough that "1 in 10 noticed" doesn't qualify. Reference: PRD line 791 ("The differentiator is invisible to first-time users") and the UX spec § "Maya's J1 climax" failure mode ("the scan platform's articulation is too subtle to notice").

**Sample-size note:** with 5 first-time-user sessions, the 50% threshold means ≥ 3 of 5 pass. With 10 sessions, ≥ 5 of 10. The AT user's outcome is reported separately for the AT-finding gate but ALSO counts toward the percentage threshold (AT users are first-time users too).

---

## Cross-references

- **Recruitment** — [`./friendly-user-recruitment.md`](./friendly-user-recruitment.md). Persona, consent, vendor list, compensation, timeline.
- **Findings template** — [`./friendly-user-findings.md`](./friendly-user-findings.md). The empty structure aggregate findings populate.
- **PBD prep notes (source)** — [`_bmad-output/implementation-artifacts/5-2-friendly-user-prep.md`](../../_bmad-output/implementation-artifacts/5-2-friendly-user-prep.md). The Story 5.2 prep note this protocol's Probe #6 derives from.
- **Manual a11y checklist (cross-reference)** — [`docs/accessibility/manual-test-checklist.md`](../accessibility/manual-test-checklist.md). AT-user findings feed back into this.
- **Skill-rules Rule 17 (launch-gate enforcement)** — [`_bmad/custom/skill-rules.md`](../../_bmad/custom/skill-rules.md).
- **PRD launch-gate commitment** — [`_bmad-output/planning-artifacts/prd.md`](../../_bmad-output/planning-artifacts/prd.md) (search "differentiator-perception" / "friendly-user").
- **UX-DR38** — [`_bmad-output/planning-artifacts/ux-design-specification.md`](../../_bmad-output/planning-artifacts/ux-design-specification.md) § "Layer 4: User testing with assistive technology users".

---

## Amendment log

- **2026-05-25 (Story 6.5 code-review):** added "AT-finding severity rubric" section under the AT-user special-handling block. Original text said only "Critical or serious AT findings BLOCK launch per AC4 of Story 6.5" but did not define what `critical` / `serious` mean in an AT-session context, leaving the facilitator's classification ungrounded. The code-review pass added explicit per-band criteria + worked examples + a disagreement-protocol fallback (when uncertain, choose the higher band — re-running with fresh recruits is cheaper than shipping a regression). The findings doc section 6 now cross-references this rubric.
