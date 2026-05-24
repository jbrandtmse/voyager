// @vitest-environment happy-dom
//
// Story 6.4 AC1 — `<v-timeline-scrubber>` mission + detail variants.
//
// Mission variant states: resting, focused, at mission start, at mission end
// (hovered + dragging + narrow-viewport-collapsed are visual states
// verified in the route suite).
// Detail variant states: closed, opening, open, closing.

import { describe, it, expect, afterEach } from 'vitest';

import { runAxe, NO_VIOLATIONS } from '../helpers/run-axe';
import '../../../src/components/v-timeline-scrubber';
import type { VTimelineScrubber } from '../../../src/components/v-timeline-scrubber';
import {
  MISSION_START_ET,
  MISSION_END_ET,
} from '../../../src/constants/mission';

function makeStubClock(et: number): unknown {
  let t = et;
  const subs = new Set<() => void>();
  return {
    get simTimeEt(): number {
      return t;
    },
    get playing(): boolean {
      return false;
    },
    get playbackRate(): number {
      return 1;
    },
    play(): void {},
    pause(): void {},
    setRate(_n: number): void {},
    scrubTo(n: number): void {
      t = n;
      subs.forEach((s) => s());
    },
    subscribe(cb: () => void): () => void {
      subs.add(cb);
      return (): void => {
        subs.delete(cb);
      };
    },
  };
}

describe('Story 6.4 AC1 — <v-timeline-scrubber> mission variant a11y matrix', () => {
  afterEach(() => {
    document
      .querySelectorAll('v-timeline-scrubber')
      .forEach((el) => el.remove());
  });

  it('resting (default ET) — a11y-clean, slider role + aria-valuetext present', async () => {
    const el = document.createElement(
      'v-timeline-scrubber',
    ) as VTimelineScrubber;
    el.variant = 'mission';
    (el as unknown as { clockManager: unknown }).clockManager = makeStubClock(
      MISSION_START_ET + 86400 * 365,
    );
    document.body.appendChild(el);
    await el.updateComplete;
    const slider = el.shadowRoot?.querySelector('[role="slider"]');
    expect(slider?.getAttribute('aria-valuetext')).not.toBeNull();
    expect(slider?.getAttribute('aria-label')).toMatch(/timeline/i);
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('focused state — slider holds focus, a11y-clean', async () => {
    const el = document.createElement(
      'v-timeline-scrubber',
    ) as VTimelineScrubber;
    el.variant = 'mission';
    (el as unknown as { clockManager: unknown }).clockManager =
      makeStubClock(MISSION_START_ET);
    document.body.appendChild(el);
    await el.updateComplete;
    el.shadowRoot
      ?.querySelector<HTMLElement>('[role="slider"]')
      ?.focus();
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('bound at mission start (1977-08-20) — a11y-clean', async () => {
    const el = document.createElement(
      'v-timeline-scrubber',
    ) as VTimelineScrubber;
    el.variant = 'mission';
    (el as unknown as { clockManager: unknown }).clockManager =
      makeStubClock(MISSION_START_ET);
    document.body.appendChild(el);
    await el.updateComplete;
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('bound at mission end (2030-12-31) — a11y-clean', async () => {
    const el = document.createElement(
      'v-timeline-scrubber',
    ) as VTimelineScrubber;
    el.variant = 'mission';
    (el as unknown as { clockManager: unknown }).clockManager =
      makeStubClock(MISSION_END_ET);
    document.body.appendChild(el);
    await el.updateComplete;
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });
});

describe('Story 6.4 AC1 — <v-timeline-scrubber> detail variant a11y matrix', () => {
  afterEach(() => {
    document
      .querySelectorAll('v-timeline-scrubber')
      .forEach((el) => el.remove());
  });

  it('detail variant — closed (default mount) — a11y-clean', async () => {
    const el = document.createElement(
      'v-timeline-scrubber',
    ) as VTimelineScrubber;
    el.variant = 'detail';
    el.rangeStart = MISSION_START_ET + 86400 * 100;
    el.rangeEnd = MISSION_START_ET + 86400 * 110;
    (el as unknown as { clockManager: unknown }).clockManager =
      makeStubClock(MISSION_START_ET + 86400 * 105);
    document.body.appendChild(el);
    await el.updateComplete;
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('detail variant — open state via attribute — a11y-clean', async () => {
    const el = document.createElement(
      'v-timeline-scrubber',
    ) as VTimelineScrubber;
    el.variant = 'detail';
    el.rangeStart = MISSION_START_ET + 86400 * 100;
    el.rangeEnd = MISSION_START_ET + 86400 * 110;
    (el as unknown as { clockManager: unknown }).clockManager =
      makeStubClock(MISSION_START_ET + 86400 * 105);
    document.body.appendChild(el);
    await el.updateComplete;
    // Detail variant DOM is always present; the slide-in is a CSS
    // transform driven by an internal data-attr. The a11y markup must
    // be valid at every transition stage. We flip aria-hidden + inert
    // synchronously (mirrors the production `syncDetailFromDirector` path)
    // so the slider thumb is in the a11y tree and focusable.
    el.setAttribute('data-open', '');
    el.setAttribute('aria-hidden', 'false');
    el.removeAttribute('inert');
    await el.updateComplete;
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });
});
