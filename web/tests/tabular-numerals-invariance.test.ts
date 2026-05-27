/**
 * Story 6.6 AC2 — tabular-numerals invariance defense.
 *
 * Every HUD component whose rendered output contains digits that mutate
 * during scrubbing (date, distance, speed, instruments timestamps,
 * attitude indicator readouts, timeline scrubber labels) MUST declare
 * `font-variant-numeric: tabular-nums` (or the equivalent
 * `font-feature-settings: 'tnum' 1`) so the digit-cell positions are
 * fixed-width and the values do not horizontally jitter as numbers
 * change.
 *
 * This file is an audit-discoverable grep defense that lives alongside
 * the per-component tabular-nums assertions (e.g.
 * `v-hud-date.test.ts:49–55`). The per-component tests verify the token
 * usage inside a specific component's CSS; this file enumerates EVERY
 * scrub-driven-digits component in one place so a future component that
 * introduces a digit display gains a single landing-spot for the
 * tabular-nums contract.
 *
 * The test reads each component's source file and asserts the token
 * appears at least once in the file. The exact CSS selector is not
 * pinned (that's the per-component test's job) — the invariant is the
 * cross-component "no scrub-driven digit display ships without
 * tabular-nums" defense.
 *
 * ## Why a grep test, not a render-and-measure test
 *
 * happy-dom does not implement font-feature-settings or
 * font-variant-numeric layout — the rendered glyph metrics would be
 * identical with or without the property in the test environment. The
 * only way to verify the property is consumed is to assert it appears
 * in the component's static styles, which is exactly what the
 * per-component test does. This file's value-add is the cross-
 * component enumeration — a future component that adds digits and
 * forgets the property fails THIS test (audit-visible) rather than
 * silently shipping without the contract.
 *
 * ## ADR references
 *
 * - Story 1.7 — three-voice register + tabular-nums commitment.
 * - Story 1.11 AC2 — HUD style defense (no background fills,
 *   text-shadow inheritance) and the per-component tabular-nums
 *   assertions in `v-hud-date.test.ts`, `v-hud-distance.test.ts`,
 *   `v-hud-speed.test.ts`.
 * - Story 6.6 AC2 — final tabular-numerals verification.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const componentSrc = (relPath: string): string =>
  readFileSync(resolve(__dirname, '..', 'src', 'components', relPath), 'utf-8');

interface TabularNumsComponent {
  /** Component path under `web/src/components/`. */
  readonly path: string;
  /** Human-readable reason this component displays scrub-driven digits. */
  readonly rationale: string;
}

const SCRUB_DRIVEN_DIGIT_COMPONENTS: readonly TabularNumsComponent[] =
  Object.freeze([
    {
      path: 'v-hud-date.ts',
      rationale: 'HUD date readout — UTC ISO timestamp updates per frame.',
    },
    {
      path: 'v-hud-distance.ts',
      rationale: 'HUD distance readouts (AU + km) update per frame.',
    },
    {
      path: 'v-hud-speed.ts',
      rationale: 'HUD speed readout (km/s) updates per frame.',
    },
    {
      path: 'v-hud-instruments.ts',
      rationale:
        'Instrument-bay rollup carries the per-frame instrument shutoff state; ' +
        'the host applies tabular-nums to keep the rollup width stable as the ' +
        'shut-off counts change.',
    },
    {
      path: 'v-attitude-indicator.ts',
      rationale:
        'Attitude indicator value text contains numeric components that change ' +
        'on CK ↔ synthesized transitions — tabular-nums keeps the dot/value ' +
        'alignment invariant across the swap.',
    },
  ]);

describe('Story 6.6 AC2 — tabular-numerals invariance defense', () => {
  for (const component of SCRUB_DRIVEN_DIGIT_COMPONENTS) {
    it(`${component.path} declares font-variant-numeric: tabular-nums (${component.rationale.slice(0, 60)}…)`, () => {
      const src = componentSrc(component.path);
      // Accept either the canonical `font-variant-numeric: tabular-nums`
      // OR the equivalent `font-feature-settings: 'tnum' 1` declaration.
      // Both produce the same fixed-cell layout; the canonical project
      // form is `font-variant-numeric` (every existing HUD component
      // uses it) but accept the alternate for robustness against a
      // future component that uses the older font-feature-settings
      // syntax.
      const hasTabularNums =
        /font-variant-numeric\s*:\s*tabular-nums/.test(src) ||
        /font-feature-settings\s*:\s*['"]tnum['"]\s+1/.test(src);
      expect(
        hasTabularNums,
        `${component.path} displays scrub-driven digits per its rationale, but ` +
          `does not declare \`font-variant-numeric: tabular-nums\` or the ` +
          `equivalent \`font-feature-settings: 'tnum' 1\`. Without one of those ` +
          `the digit cells reflow as values change and the readout horizontally ` +
          `jitters during scrubbing. See Story 1.7 three-voice register + Story ` +
          `6.6 AC2.`,
      ).toBe(true);
    });
  }

  it('the SCRUB_DRIVEN_DIGIT_COMPONENTS roster is non-empty and stable', () => {
    // Defends against an accidental empty roster from a future refactor.
    // If the roster drops to empty, every assertion above no-ops; this
    // test surfaces the regression with a clear diagnostic.
    expect(
      SCRUB_DRIVEN_DIGIT_COMPONENTS.length,
      'SCRUB_DRIVEN_DIGIT_COMPONENTS roster is empty. Re-populate from the ' +
        'audit-table-of-record at docs/accessibility/contrast-audit-launch-week.md § 4.2.',
    ).toBeGreaterThanOrEqual(5);
  });
});
