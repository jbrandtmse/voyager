// @vitest-environment happy-dom
//
// Story 6.4 AC1 — `<v-hud-*>` standalone-mount a11y checks. The HUD-suite
// already exercises them in their parent `<v-hud>`'s state matrix; this
// file covers the default-mount case for each (cheap and exhaustive).

import { describe, it, expect, afterEach } from 'vitest';

import { runAxe, NO_VIOLATIONS } from '../helpers/run-axe';

import '../../../src/components/v-hud-date';
import '../../../src/components/v-hud-distance';
import '../../../src/components/v-hud-chapter-title';
import '../../../src/components/v-hud-speed';
import '../../../src/components/v-hud-instruments';
import '../../../src/components/v-attitude-indicator';

const HUD_CHILDREN = [
  'v-hud-date',
  'v-hud-distance',
  'v-hud-chapter-title',
  'v-hud-speed',
  'v-hud-instruments',
  'v-attitude-indicator',
] as const;

describe('Story 6.4 AC1 — <v-hud-*> standalone a11y checks', () => {
  afterEach(() => {
    HUD_CHILDREN.forEach((tag) => {
      document.querySelectorAll(tag).forEach((el) => el.remove());
    });
  });

  for (const tag of HUD_CHILDREN) {
    it(`<${tag}> default state — a11y-clean`, async () => {
      const el = document.createElement(tag);
      document.body.appendChild(el);
      const maybeLit = el as unknown as { updateComplete?: Promise<unknown> };
      if (maybeLit.updateComplete) {
        await maybeLit.updateComplete;
      }
      expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
    });
  }
});
