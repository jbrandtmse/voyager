# Test Automation Summary — Story 5.2 (Choreographed Spacecraft Turn — CK or Synthesized per Coverage)

**Story file:** `_bmad-output/implementation-artifacts/5-2-choreographed-spacecraft-turn-ck-or-synthesized-per-coverage.md`
**QA stage:** post-dev; dev shipped 58 tests across new + extended files; QA evaluated for gaps + added 11 supplemental tests.
**Test framework:** Vitest (project standard; co-located + `web/tests/` integration).
**Baseline at QA start:** 3247 passing / 10 skipped; typecheck clean; lint 4 warnings.
**Baseline at QA close:** 3258 passing / 10 skipped; typecheck clean; lint 4 warnings (no new).

## QA Coverage Evaluation

| AC | Surface | Dev coverage | Verdict |
|---|---|---|---|
| AC1 | ckbrief-inventory doc explicit on mixed coverage | Doc inspection only — no test required (verification-only AC per AC text "no doc change needed if already explicit") | Sufficient |
| AC2 | Bus quat = AttitudeService CK; PBD does NOT override bus | `pale-blue-dot-turn-integration.test.ts` AC2 block (BUS node quat equals AttitudeService output exactly) + `attitude-applier.test.ts` "does NOT override the BUS quaternion (AC2 — PBD acts on platform only)" | Sufficient |
| AC3 | Platform override synthesized per-substate; math in BUS frame; override-first check in AttitudeApplier | `turn-choreography.test.ts` (computePlatformAimQuat 7 tests including the non-identity-bus bus-relative math + unit-norm); `index.test.ts` (`getPlatformQuatOverride` 10 tests covering V2-null / no-services-null / idle-null / turning-null / composite-null / passed-null / sweeping-non-null / per-target enumeration); `attitude-applier.test.ts` (override-first short-circuit + service-getPlatformQuat-skipped); `pale-blue-dot-turn-integration.test.ts` (override drives SCAN_PLATFORM node) | Sufficient |
| AC4 | SLERP-with-ease-out between substates; reduced-motion = instant cut | `turn-choreography.test.ts` (SLERP bracketing mid-transition; post-window endpoint pin; same-substate no-op SLERP-restart; reset; reduced-motion injected probe; reduced-motion default via happy-dom matchMedia; easeOutCubic endpoint pins + monotonicity + clamp + ease-out shape) | Sufficient |
| AC5 | 1× / 10× / 100× simulation speed substate progression | `pale-blue-dot-turn-integration.test.ts` AC5 block (1s / 10s / 15s ET-step cadences; manual scrub via `pbdSubstateAt`) | Sufficient |
| AC6 | Option B chosen (indicator unchanged; copy mentions reconstruction) | `copy.test.ts` Story 5.2 `describe` block (`/reconstruct/i` body match); no v-attitude-indicator.test.ts changes (verified by git status — Option B contract is "no indicator changes") | Sufficient |
| AC7 | Cone aim within 5° of V1→target at substate peak (parent-child propagation) | `pale-blue-dot-turn-integration.test.ts` AC7 block (sweeping_earth 5° + sweeping_venus 5° using `bus * platform` world-space composition) | Sufficient |
| AC8 | Friendly-user prep doc < 200 words | Direct file-count verification: `5-2-friendly-user-prep.md` = **197 words** (within 200 limit) | Sufficient |
| AC9 | DEV-only `__voyagerDebug.paleBlueDot` accessor extension (currentSubstate / currentTargetNaifId / currentPlatformOverrideQuat) | `pale-blue-dot-turn-integration.test.ts` AC9 block (3 tests covering substate transitions + target-NAIF + override-quat through the lifecycle) + the lead-driven MCP smoke covers production-side wire-up | Sufficient at module/integration tier; smoke contract documented below |
| AC10 | Test sweep + lint + ADR compliance | Full sweep post-QA: 3258 passing / 10 skipped; typecheck clean; lint 4 warnings (baseline) | Sufficient |

**Gaps the QA stage closed (11 new tests in `web/tests/pale-blue-dot-override-lifecycle.test.ts`):**

1. **Override deactivation on substate-exit transition** — dev's `getPlatformQuatOverride` tests check each substate individually but never exercise the TRANSITION (entering sweeping_neptune then advancing to composite_active and asserting the override returns null). Three new tests pin sweeping_neptune → composite_active, sweeping_earth → sweeping_jupiter (both endpoints sweeping — override stays non-null + target NAIF advances), and turning → sweeping_venus.
2. **Chapter-exit semantics** — three new tests cover the post-arc / dispose / reverse-scrub paths: (a) override goes null at `passed` substate post-arc; (b) `dispose()` mid-sweep tears down the choreography (the hard chapter-tear-down / hot-reload path); (c) reverse scrub sweeping_earth → turning rewinds the override; (d) reverse scrub past anchor sweeping_jupiter → idle.
3. **V2 isolation** — two tests pin that PBD acts only on V1 (-31): V2 (-32) override returns null even during sweeping_<body> substates; arbitrary other NAIF IDs (-98, 0) return null.
4. **Activation idempotency at the subscribe level** — two tests pin (a) repeated `update(et)` calls with the same ET after entering sweeping_<body> do not double-fire substate-change listeners; (b) double-subscribe with the same listener reference is deduplicated (Set semantics) — defense for a hot-reload race where main.ts could wire the subscriber twice.

**Gaps the QA stage explicitly considered AND chose NOT to add:**

- **AttitudeApplier null-override fall-through to AttitudeService (NOT identity)** — already covered by `attitude-applier.test.ts` "falls through to AttitudeService.getPlatformQuat when override returns null for V1" (line 506). No add.
- **PBD module idempotency at the `update(et)` level** — already covered by `index.test.ts` "update(et) is idempotent — same ET twice fires no listener on second call" (line 121). The new lifecycle test covers the OUTER-subscribe-deduplication shape, which is the angle dev missed.
- **Rule 5 amendment block content verification** — the amendment block in `epics.md` is a planning artifact, not test surface. Dev's Rule 5 Amendment Log inside the story file is the canonical record.

## Generated Tests (Net New: 11)

### Integration (Vitest — real-stack)

- **`web/tests/pale-blue-dot-override-lifecycle.test.ts`** (NEW) — 11 tests across 4 `describe` blocks:
  - **Gap 1 — override deactivates on substate-exit transition** (3 tests)
    1. sweeping_neptune → composite_active: override non-null DURING sweeping_neptune, null after the transition fires
    2. sweeping_earth → sweeping_jupiter: override stays non-null + `currentTargetNaifId` advances 3 → 5 across the transition
    3. turning → sweeping_venus: override null in turning, non-null after entering sweeping_venus
  - **Gap 2 — override behaviour across chapter-exit semantics** (4 tests)
    4. override goes null at `passed` substate (post-arc)
    5. `dispose()` mid-sweep tears down the override (hard chapter-tear-down path)
    6. reverse scrub sweeping_earth → turning tears down the override
    7. reverse scrub past anchor sweeping_jupiter → idle tears down the override
  - **Gap 3 — V2 (-32) override unconditionally null** (2 tests)
    8. during sweeping_earth, V2 override remains null while V1 override is non-null
    9. arbitrary other NAIF IDs (-98, 0) return null
  - **Gap 4 — activation idempotency at the subscribe level** (2 tests)
    10. repeated `update(et)` with same ET does not double-fire substate-change listeners
    11. double-subscribe with same listener reference is deduplicated (Set semantics)

## Results

- **Net new tests:** 11 (all integration tier, real PaleBlueDot instance against stubbed Ephemeris + AttitudeService)
- **PBD test file aggregate:** 86 passing (72 from Stories 5.0/5.1 + 58 from Story 5.2 dev + 11 from QA = arithmetic differs because some files cross stories; the canonical metric is the full sweep count below)
- **Full web vitest sweep at QA close:** **3258 passing / 10 skipped** (was 3247 / 10 at QA start — exactly +11)
- **Typecheck:** Clean (`npm run typecheck` — 0 errors).
- **Lint:** 4 warnings preserved (`web/src/render/skybox.ts:117`, `ephemeris-service.ts:183` + `:224`, `tests/celestial-defense-extended.test.ts:100`). No new warnings.
- **Test discoverability:** New file follows `*.test.ts` convention under `web/tests/`, discoverable by default vitest sweep, not excluded by `vitest.config.ts` or ignore files. Co-located with the canonical Story 5.2 integration test `pale-blue-dot-turn-integration.test.ts`.

## Chrome DevTools MCP Smoke (AC9 — lead-driven, NOT QA)

Per voyager-skill-rules.md Rule 3 + Rule 8 + Story 2.0 AC2 (Chrome DevTools MCP smoke-stage policy), Story 5.2 touches `web/src/` (specifically `web/src/main.ts`, `web/src/render/attitude-applier.ts`, `web/src/chapters/pale-blue-dot/index.ts` + `turn-choreography.ts` + `copy.ts`) so the per-story exit criterion REQUIRES browser-smoke evidence from the lead. The smoke is documented as AC9 in the story file; the dev's task list (T8) carries it as lead-driven. Evidence destination is `_bmad-output/implementation-artifacts/5-2-smoke-evidence/` (directory exists; lead populates).

**Smoke contract — AC9 (lead-driven):**

The lead drives Chrome DevTools MCP against the production build (`vite preview` of the bundle) navigating to `http://localhost:4173/c/pale-blue-dot` and exercising playback so the substate machine advances through `idle` → `turning` → `sweeping_venus` → `sweeping_earth`. Required tool calls + observations:

1. **`mcp__chrome-devtools-mcp__navigate_page`** — open `http://localhost:4173/c/pale-blue-dot`. URL contract: the final URL must equal `/c/pale-blue-dot` (preserved per Story 5.0 / 5.1).

2. **`mcp__chrome-devtools-mcp__evaluate_script`** — assert on the DEV-only accessor (smoke must be against the DEV bundle to hit `__voyagerDebug`; the production-bundle accessor is stripped per the `import.meta.env.DEV` guard in `main.ts:250`):
   - **AC9 (idle baseline):** on cold-load before pressing play, `window.__voyagerDebug.paleBlueDot.currentSubstate === "idle"` AND `currentTargetNaifId === null` AND `currentPlatformOverrideQuat === null`.
   - **AC9 (turning):** scrub to PBD_ANCHOR_ET + 15s (or press play and wait for the turning substate to land). Then:
     - `currentSubstate === "turning"`
     - `currentTargetNaifId === null` (turning has no per-target aim)
     - `currentPlatformOverrideQuat === null` (override returns null during turning; AttitudeService synthesized fallback applies)
     - **AC6 (Option B indicator):** the `<v-attitude-indicator>` shadow-DOM rendered text reads `ATT CK reconstructed` (bus provenance is `'ck'`).
   - **AC9 (sweeping_venus):** scrub to PBD_ANCHOR_ET + 37.5s. Then:
     - `currentSubstate === "sweeping_venus"`
     - `currentTargetNaifId === 2` (Venus NAIF ID)
     - `currentPlatformOverrideQuat !== null` AND has unit-norm (the override is the live aim quaternion in BUS frame)
     - `<v-attitude-indicator>` text still reads `ATT CK reconstructed` (Option B — unchanged across PBD).
   - **AC9 (sweeping_earth):** scrub to PBD_ANCHOR_ET + 52.5s. Then:
     - `currentSubstate === "sweeping_earth"`
     - `currentTargetNaifId === 3` (Earth NAIF ID)
     - `currentPlatformOverrideQuat !== null` AND differs from the sweeping_venus quat by more than float epsilon (different target → different aim).
   - **AC2 (bus provenance honest):** `window.__voyagerDebug.attitudeService.getBusProvenance(-31, et)` returns `"ck"` at any PBD-window ET (sanity check that the AC6 Option-B rationale "the indicator IS honest about the BUS" holds at runtime — V1's bus pose IS from CK over 1990-02-14).
   - **AC6 (chapter copy mentions reconstruction):** `document.querySelector('v-chapter-copy')` light-DOM contains a paragraph whose text matches `/reconstruct/i` AND `/scan-platform/i` (the canonical sentence dev appended to copy.ts).

3. **`mcp__chrome-devtools-mcp__take_screenshot`** — capture at least four frames into `_bmad-output/implementation-artifacts/5-2-smoke-evidence/`:
   - `pbd-anchor-idle.png` — cold-load at `/c/pale-blue-dot`, chapter title + copy + indicator visible; substate idle.
   - `pbd-turning-peak.png` — at PBD_ANCHOR_ET + 15s, body has begun turning; copy panel still shows the reconstruction sentence.
   - `pbd-sweeping-venus-peak.png` — at PBD_ANCHOR_ET + 37.5s, scan platform aimed at Venus; cone (Story 3.5) visibly rotated.
   - `pbd-sweeping-earth-peak.png` — at PBD_ANCHOR_ET + 52.5s, scan platform aimed at Earth; cone rotated to a different bearing than Venus.
   (Optional: `pbd-reduced-motion-cut.png` — same frame with `prefers-reduced-motion: reduce` emulated via `mcp__chrome-devtools-mcp__emulate` to verify the instant-cut path lands an aim quat without a SLERP transition frame.)

4. **`mcp__chrome-devtools-mcp__take_snapshot`** — accessibility tree snapshot of the chapter copy panel + attitude indicator + chapter title HUD. The reconstruction sentence MUST be in the accessibility tree as readable text (the AC6 Option B rationale lives in copy, not in HUD — so a11y carries the caveat to assistive-tech users).

5. **Console-clean assertion** — capture console messages during the navigation + scrub sequence; assert no errors beyond the Lit dev-mode banner. PBD's introduction must not raise new errors (`[PaleBlueDot] subscriber threw:` for example would surface here).

**ACs covered by the MCP smoke (named explicitly per Rule 8 obligation):**

- **AC2** (bus = CK, no PBD override) — `evaluate_script` reads `getBusProvenance(-31)` returns `"ck"`; the indicator label `ATT CK reconstructed` confirms the bus path is unchanged.
- **AC3** (platform override during sweeping_<body> substates) — `evaluate_script` confirms `currentPlatformOverrideQuat !== null` at sweeping_venus + sweeping_earth peaks; null at turning + idle.
- **AC4** (SLERP transitions visible across substate change) — `take_screenshot` at peaks shows different aim per substate; optional reduced-motion frame proves the cut path also lands an aim.
- **AC5** (substate progression during live playback) — scrubbing through 4 substates exercises the substate-at-ET resolution under real playback (not just the unit-tier `pbdSubstateAt` calls).
- **AC6** (Option B — indicator unchanged + copy mentions reconstruction) — `evaluate_script` reads the indicator text AND scrapes the copy panel for the reconstruction sentence.
- **AC7** (cone aim propagation) — `take_screenshot` shows the cone visibly aimed at the active target; not a numerical 5° assertion at the smoke tier (that's the integration test surface) but a visual confirmation that the parent-child transform propagates.
- **AC9** (DEV accessor wire-up) — all evaluate_script calls hit the new `currentTargetNaifId` + `currentPlatformOverrideQuat` getters; surfaces any boot-ordering bug between the manifest landing and the accessor publish.

**Skip-rule consideration (Rule 3 exemption check):** Story 5.2 is NOT bake-only — Files-to-Modify includes `web/src/main.ts`, `web/src/render/attitude-applier.ts`, four files under `web/src/chapters/pale-blue-dot/`. The Rule 3 web-touching trigger fires; the MCP smoke stage is REQUIRED and is correctly placed on the lead per Rule 7 + ADR-0010.

**Smoke evidence directory:** `_bmad-output/implementation-artifacts/5-2-smoke-evidence/` (created by dev as an empty directory placeholder; lead populates with screenshots + console-clean transcript after the MCP probe).

## ADR compliance (verified at QA tier)

- **ADR-0010** (Chrome DevTools MCP for agent-time browser verification) — the AC9 smoke contract above commits to MCP, not Playwright; the Playwright L4 regression is correctly deferred to Story 5.4.
- **ADR-0014** (Hybrid Chapter Definition — Spec for 10, Module for PBD) — `PaleBlueDot` class extends with `getPlatformQuatOverride` + `setServices`; remains a `ChapterModule` implementer; no new ADR needed.
- **ADR-0015** (no global store) — override exposed via instance method; injected into `AttitudeApplier` via DI assignment in `main.ts:690`; the `__voyagerDebug.paleBlueDot` accessor is DEV-only per `import.meta.env.DEV` guard.
- **ADR-0023** (translation-only view-frame blend) — PBD does NOT touch the view-frame; `defaultFraming` remains undefined on PBD_SPEC; the choreography rotates scan-platform, not the camera. Compliant.
- **ADR-0026** (zero `any`) — all new test surfaces use `as unknown as <ServiceShape>` for stubs, not `any`; the override-provider interface is fully typed.

## Test discoverability

All new tests follow project conventions:
- File name: `web/tests/pale-blue-dot-override-lifecycle.test.ts` (matches `*.test.ts` glob in `vitest.config.ts`).
- Vitest environment: `// @vitest-environment happy-dom` directive at top (matches `pale-blue-dot-turn-integration.test.ts` precedent).
- No `.gitignore` exclusion; tracked under `web/tests/`.
- Discoverable by `cd web && npx vitest run` (verified — file appears in the 181-test-file enumeration; all 11 tests pass).
