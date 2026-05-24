/**
 * Story 4.1 QA gap — `main.ts` boot-ordering invariants (defensive).
 *
 * Pins the load-bearing ordering decisions in `main.ts` that drive AC2 (the
 * ViewFrameService wiring after the manifest lands) and AC6 (the
 * ChapterDirector subscriber-registration must fire BEFORE the synchronous
 * `chapterDirector.update(clockManager.simTimeEt)` cold-load seed). If
 * either ordering is silently re-arranged by a future contributor, this
 * test fails — preventing the AC6 cold-load-into-V2-chapter regression
 * that Story 4.0 surfaced at `/c/v2-saturn`.
 *
 * The approach mirrors `chapter-director-attitude-indicator-wire.test.ts`'s
 * shape-pin pattern: read `main.ts` as text, search for the ordered tokens,
 * and assert their positions. This is fragile against re-formatting, but
 * the alternative — booting main.ts itself in a vitest worker — would
 * require standing up WebGL / Three.js / canvas etc., which is the trap
 * the wire test explicitly avoids per its own comment block.
 *
 * Why a separate file rather than appending to
 * chapter-director-attitude-indicator-wire.test.ts:
 *   - That file's scope is the AC6 attitude-indicator wire (effect-focused).
 *   - This file's scope is the boot-ordering CONTRACT (sequence-focused) —
 *     so a future developer searching for "boot ordering" can find it
 *     without paging through the AC6 wire's behavioural tests.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const webRoot = resolve(__dirname, '..');
const mainTsSrc = readFileSync(resolve(webRoot, 'src/main.ts'), 'utf-8');

/**
 * Find the byte offset of a single regex match (first occurrence). Returns
 * -1 when no match (mirrors String.prototype.indexOf so the assertion
 * messages stay readable).
 */
const indexOfMatch = (re: RegExp): number => {
  const m = mainTsSrc.match(re);
  if (m === null || m.index === undefined) return -1;
  return m.index;
};

describe('Story 4.1 — main.ts boot-ordering invariants', () => {
  // ---------------------------------------------------------------------
  // AC6 — subscriber MUST be installed BEFORE the synchronous cold-load
  // chapterDirector.update(simTimeEt) seed.
  // ---------------------------------------------------------------------
  describe('AC6 — subscriber registration precedes cold-load seed', () => {
    it('chapterDirector.subscribe(...) appears before chapterDirector.update(clockManager.simTimeEt)', () => {
      // The subscriber must be registered FIRST so that the cold-load seed
      // (which fires the synthesized first-update transitions inside the
      // V2 Saturn window when the URL is `/c/v2-saturn`) flows through the
      // newly-installed handler. Without this ordering, the indicator paints
      // V1 (-31 stub default) on the first frame at /c/v2-saturn, which is
      // the exact gap Story 4.0's lead smoke surfaced.
      const subscribeIdx = indexOfMatch(/chapterDirector\.subscribe\(/);
      const seedIdx = indexOfMatch(
        /chapterDirector\.update\(\s*clockManager\.simTimeEt\s*\)/,
      );
      expect(subscribeIdx, 'subscribe call must exist in main.ts').toBeGreaterThanOrEqual(0);
      expect(seedIdx, 'cold-load seed must exist in main.ts').toBeGreaterThanOrEqual(0);
      expect(
        subscribeIdx,
        'subscribe call must precede the synchronous chapterDirector.update(simTimeEt) cold-load seed',
      ).toBeLessThan(seedIdx);
    });

    it('attitude-indicator subscriber is installed AFTER firstPaintHandle so the HUD attitude-indicator handle is available', () => {
      // The subscriber's body reads
      // `firstPaintHandle.hud.attitudeIndicator?.setActiveSpacecraft(...)`,
      // so `firstPaintHandle` must be in scope when the subscriber's
      // closure captures it. The wire's `?.` optional chain makes the
      // call no-op when the indicator isn't yet mounted, but the variable
      // reference itself needs to resolve.
      //
      // Story 5.1 amended in place per Rule 5: the test originally
      // used the first `chapterDirector.subscribe(` occurrence, which
      // worked when the only subscriber was the Story 4.1 attitude-
      // indicator wire. Story 5.1 added a PBD-module activation
      // subscriber BEFORE firstPaintHandle (intentionally — it doesn't
      // read from firstPaintHandle); the attitude-indicator subscriber
      // is identified by its `setActiveSpacecraft(naifId)` body
      // signature.
      const firstPaintIdx = indexOfMatch(/const\s+firstPaintHandle\s*=\s*startFirstPaint\(/);
      const attitudeSubscriberIdx = indexOfMatch(
        /firstPaintHandle\.hud\.attitudeIndicator\?\.setActiveSpacecraft\(/,
      );
      expect(firstPaintIdx).toBeGreaterThanOrEqual(0);
      expect(attitudeSubscriberIdx).toBeGreaterThanOrEqual(0);
      expect(
        firstPaintIdx,
        'firstPaintHandle must be constructed before the attitude-indicator subscriber captures it',
      ).toBeLessThan(attitudeSubscriberIdx);
    });

    it('subscriber handler reads from firstPaintHandle.hud.attitudeIndicator via optional chaining', () => {
      // Pin the optional-chain so a future refactor that removes the `?.`
      // (e.g. "we always have the indicator now, just remove the chain")
      // doesn't break boot when the indicator load races the subscriber's
      // first invocation (cold-load arrival fires immediately on the
      // synchronous seed; the indicator may not have upgraded yet).
      expect(mainTsSrc).toMatch(
        /firstPaintHandle\.hud\.attitudeIndicator\?\.setActiveSpacecraft\(/,
      );
    });
  });

  // ---------------------------------------------------------------------
  // AC2 — ViewFrameService is constructed POST-manifest and DI'd via
  // setViewFrame on the existing RenderEngine instance.
  // ---------------------------------------------------------------------
  describe('AC2 — ViewFrameService boot ordering (post-manifest)', () => {
    it('ViewFrameService construction lives inside the post-manifest .then(...) block', () => {
      // The post-manifest block is identifiable by the `ManifestLoader.load(...).then(` token.
      // The ViewFrameService construction MUST live inside that block (otherwise
      // ephemerisService is unresolved). We assert by checking the textual order
      // of the tokens.
      const manifestThenIdx = indexOfMatch(/ManifestLoader\.load\([^)]*\)\.then\(/);
      const viewFrameCtorIdx = indexOfMatch(/new\s+ViewFrameService\(/);
      const ephemerisCtorIdx = indexOfMatch(/new\s+EphemerisService\(/);
      expect(manifestThenIdx).toBeGreaterThanOrEqual(0);
      expect(viewFrameCtorIdx).toBeGreaterThanOrEqual(0);
      expect(ephemerisCtorIdx).toBeGreaterThanOrEqual(0);
      expect(
        manifestThenIdx,
        'ViewFrameService must be constructed inside the post-manifest .then() block',
      ).toBeLessThan(viewFrameCtorIdx);
      expect(
        ephemerisCtorIdx,
        'ViewFrameService must be constructed AFTER EphemerisService (it depends on it)',
      ).toBeLessThan(viewFrameCtorIdx);
    });

    it('setViewFrame() is called AFTER ViewFrameService is constructed', () => {
      // The setter is the bridge between the post-manifest ViewFrameService
      // and the pre-existing RenderEngine. If the setter is called BEFORE
      // construction, `viewFrameService` is undefined.
      const ctorIdx = indexOfMatch(/new\s+ViewFrameService\(/);
      const setterIdx = indexOfMatch(/engine\.setViewFrame\(/);
      expect(ctorIdx).toBeGreaterThanOrEqual(0);
      expect(setterIdx).toBeGreaterThanOrEqual(0);
      expect(ctorIdx).toBeLessThan(setterIdx);
    });

    it('engine.setViewFrame(viewFrameService, chapterDirector) takes BOTH dependencies', () => {
      // Pin the two-arg signature so a future refactor that splits them
      // (e.g., `setViewFrame(vf)` + `setChapterDirector(cd)`) doesn't
      // silently break a single-call assumption.
      expect(mainTsSrc).toMatch(
        /engine\.setViewFrame\(\s*viewFrameService\s*,\s*chapterDirector\s*\)/,
      );
    });

    it('__voyagerDebug.viewFrame publish lives inside import.meta.env.DEV gate inside the post-manifest block', () => {
      // The DEV gate is required for production-build dead-code elimination
      // per Story 3.2 AC8 pattern. The `viewFrame:` key must appear AFTER
      // an `import.meta.env.DEV` token inside the post-manifest block —
      // i.e. between the post-manifest gate and the closing brace.
      const manifestThenIdx = indexOfMatch(/ManifestLoader\.load\([^)]*\)\.then\(/);
      const viewFrameDebugIdx = indexOfMatch(/viewFrame:\s*viewFrameService/);
      expect(manifestThenIdx).toBeGreaterThanOrEqual(0);
      expect(viewFrameDebugIdx).toBeGreaterThanOrEqual(0);
      expect(viewFrameDebugIdx).toBeGreaterThan(manifestThenIdx);

      // The DEV gate is identifiable by the substring between subscribeIdx
      // and the viewFrame: key — there must be at least one
      // `import.meta.env.DEV` token AFTER manifestThenIdx and BEFORE
      // viewFrameDebugIdx.
      const slice = mainTsSrc.slice(manifestThenIdx, viewFrameDebugIdx);
      expect(slice).toMatch(/import\.meta\.env\.DEV/);
    });
  });

  // ---------------------------------------------------------------------
  // Defensive — no naked AttitudeIndicator stub-default reset.
  // ---------------------------------------------------------------------
  describe('AC6 — defensive: no silent attitude indicator reset', () => {
    it('does NOT call setActiveSpacecraft(-31) unconditionally at boot', () => {
      // Defensive against a future "let's force the indicator back to V1
      // on cruise" change that would re-introduce the Story 4.0 smoke gap.
      // The wire fires ONLY on `event.to === 'held'`; an unconditional
      // -31 call at boot would fight the held-wire flip-to-V2.
      // Permitted patterns:
      //   - `naifIdForSpacecraft(...)` (the helper itself)
      //   - inside `if (event.to !== 'held') return;` guard
      // Forbidden:
      //   - top-level `setActiveSpacecraft(-31)` outside any conditional
      // Implementation note: this is a textual check — if the wire's
      // shape changes to a different conditional form, update this test
      // to match. The point is to make any UNCONDITIONAL reset visible.
      const directCallMatches = mainTsSrc.match(
        /^\s*[a-zA-Z_$][\w$.]*\.setActiveSpacecraft\(\s*-31\s*\)\s*;/gm,
      );
      expect(directCallMatches).toBeNull();
    });

    it('does call naifIdForSpacecraft(event.chapter.spacecraft) inside the held-only handler', () => {
      // Pin the dynamic-mapping contract: the wire reads the held chapter's
      // spacecraft field, not a hardcoded constant. A future refactor that
      // hardcodes -31 (e.g., "always reset on every held transition") would
      // break the V2-chapter indicator flip.
      expect(mainTsSrc).toMatch(
        /naifIdForSpacecraft\(\s*event\.chapter\.spacecraft\s*\)/,
      );
    });

    it('held-only guard uses early-return (event.to !== "held" → return) pattern', () => {
      // The wire's structure is `if (event.to !== 'held') return; ...`.
      // Pinned so a future refactor doesn't accidentally invert the
      // condition (`event.to === 'held'` without early return would
      // still work but is structurally different — early-return is
      // the convention used by the Story 2.1 wires).
      expect(mainTsSrc).toMatch(/if\s*\(\s*event\.to\s*!==\s*['"]held['"]\s*\)\s*return\s*;/);
    });
  });

  // ---------------------------------------------------------------------
  // Cross-cutting — the entire AC6 wire is INSIDE the simulation surface,
  // not inside the precision-smoke / ephemeris-perf / about-page early
  // returns.
  // ---------------------------------------------------------------------
  describe('AC6 wire lives on the simulation surface only', () => {
    it('chapterDirector.subscribe(...) appears AFTER all early-return branches', () => {
      // The bootstrap() body has early returns for:
      //   - precision-smoke mode (`isPrecisionSmokeMode(...)`)
      //   - ephemeris-perf mode (`isEphemerisPerfMode(...)`)
      //   - about route (`initialUrlState.kind === 'about'`)
      // The AC6 wire must NOT live above any of these — otherwise the
      // ephemeris-perf harness or about page would attempt to install
      // the wire before HUD / chapterDirector are constructed.
      const precisionSmokeIdx = indexOfMatch(/isPrecisionSmokeMode\(/);
      const ephemerisPerfIdx = indexOfMatch(/isEphemerisPerfMode\(/);
      const aboutRouteIdx = indexOfMatch(/initialUrlState\.kind\s*===\s*['"]about['"]/);
      const subscribeIdx = indexOfMatch(/chapterDirector\.subscribe\(/);
      expect(subscribeIdx).toBeGreaterThanOrEqual(0);
      // Each early-return token appears BEFORE the subscriber.
      if (precisionSmokeIdx >= 0) {
        expect(precisionSmokeIdx).toBeLessThan(subscribeIdx);
      }
      if (ephemerisPerfIdx >= 0) {
        expect(ephemerisPerfIdx).toBeLessThan(subscribeIdx);
      }
      if (aboutRouteIdx >= 0) {
        expect(aboutRouteIdx).toBeLessThan(subscribeIdx);
      }
    });

    it('viewFrameService construction also lives on the simulation surface (post-early-returns)', () => {
      // Same contract for the ViewFrameService construction. Precision-smoke
      // and ephemeris-perf do not need the encounter blend; about page
      // doesn't render the canvas at all.
      const aboutRouteIdx = indexOfMatch(/initialUrlState\.kind\s*===\s*['"]about['"]/);
      const viewFrameCtorIdx = indexOfMatch(/new\s+ViewFrameService\(/);
      expect(viewFrameCtorIdx).toBeGreaterThanOrEqual(0);
      if (aboutRouteIdx >= 0) {
        expect(aboutRouteIdx).toBeLessThan(viewFrameCtorIdx);
      }
    });
  });
});
