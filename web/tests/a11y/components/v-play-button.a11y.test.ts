// @vitest-environment happy-dom
//
// Story 6.4 AC1 — axe-core matrix for `<v-play-button>`.
//
// States covered (per the story's required matrix):
//   - paused (aria-pressed=false)
//   - playing (aria-pressed=true)
//   - focused (button focused; native focus ring per global.css)
//   - hovered (hover pseudo-class — axe doesn't simulate hover, but we
//     verify the resting markup is a11y-clean — hover style changes are
//     visual only and surface in the route-level Playwright suite)

import { describe, it, expect, afterEach } from 'vitest';

import { runAxe, NO_VIOLATIONS } from '../helpers/run-axe';
import '../../../src/components/v-play-button';
import type { VPlayButton } from '../../../src/components/v-play-button';

// Minimal ClockManager stub — the component only reads playing + subscribes.
function makeStubClockManager(initialPlaying: boolean): {
  manager: unknown;
  setPlaying: (p: boolean) => void;
} {
  let playing = initialPlaying;
  const subs = new Set<() => void>();
  return {
    manager: {
      get playing(): boolean {
        return playing;
      },
      get autoCapped(): boolean {
        return false;
      },
      play(): void {
        playing = true;
        subs.forEach((s) => s());
      },
      pause(): void {
        playing = false;
        subs.forEach((s) => s());
      },
      subscribe(cb: () => void): () => void {
        subs.add(cb);
        return (): void => {
          subs.delete(cb);
        };
      },
    },
    setPlaying(p: boolean): void {
      playing = p;
      subs.forEach((s) => s());
    },
  };
}

describe('Story 6.4 AC1 — <v-play-button> a11y matrix', () => {
  afterEach(() => {
    document.querySelectorAll('v-play-button').forEach((el) => el.remove());
  });

  it('paused state — no critical/serious violations; aria-label present', async () => {
    const stub = makeStubClockManager(false);
    const el = document.createElement('v-play-button') as VPlayButton;
    (el as unknown as { clockManager: unknown }).clockManager = stub.manager;
    document.body.appendChild(el);
    await el.updateComplete;
    const button = el.shadowRoot?.querySelector('button');
    expect(button?.getAttribute('aria-label')).toBeTruthy();
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('playing state — no critical/serious violations', async () => {
    const stub = makeStubClockManager(true);
    const el = document.createElement('v-play-button') as VPlayButton;
    (el as unknown as { clockManager: unknown }).clockManager = stub.manager;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('focused state — button retains a11y-clean markup', async () => {
    const stub = makeStubClockManager(false);
    const el = document.createElement('v-play-button') as VPlayButton;
    (el as unknown as { clockManager: unknown }).clockManager = stub.manager;
    document.body.appendChild(el);
    await el.updateComplete;
    const button = el.shadowRoot?.querySelector('button');
    button?.focus();
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });

  it('paused→playing transition — re-renders cleanly with new aria-label', async () => {
    const stub = makeStubClockManager(false);
    const el = document.createElement('v-play-button') as VPlayButton;
    (el as unknown as { clockManager: unknown }).clockManager = stub.manager;
    document.body.appendChild(el);
    await el.updateComplete;
    const labelBefore = el.shadowRoot?.querySelector('button')?.getAttribute('aria-label');
    stub.setPlaying(true);
    await el.updateComplete;
    const labelAfter = el.shadowRoot?.querySelector('button')?.getAttribute('aria-label');
    // Labels should DIFFER between paused/playing states (a11y signal of
    // state change beyond glyph swap — UX-DR no-color-only encoding).
    expect(labelBefore).not.toBe(labelAfter);
    expect(await runAxe(el)).toMatchObject(NO_VIOLATIONS);
  });
});
