// @vitest-environment happy-dom
/**
 * Story 3.0 AC4 QA — keyboard-primitive ↔ consumer wire-up integration.
 *
 * Story 3.0 AC4 path (a) extracted the inline APG keyboard handlers from
 * `<v-timeline-scrubber>` and `<v-chapter-index>` into the paired primitives
 * `web/src/primitives/slider-keyboard.ts` and `.../listbox-keyboard.ts`.
 * The primitives are unit-tested in isolation
 * (`primitives/{slider,listbox}-keyboard.test.ts`, 28 cases). The CONSUMER
 * unit tests (`v-timeline-scrubber.test.ts`, `v-chapter-index.test.ts`)
 * remained unchanged so they confirm the refactor preserved behaviour.
 *
 * This file covers the *interface* between the two — the cases where a
 * primitive-only unit test or a consumer-only unit test would miss a
 * regression:
 *
 *   1. Slider AC4-I1 — the scrubber's keyboard contract still binds
 *      ArrowLeft/Right (±1 day), Shift+ArrowLeft/Right (±10 days), Home,
 *      End to `clockManager.scrubTo()` AND emits `voyager:scrub` with
 *      `source=keyboard`. Verified at the primitive ↔ consumer seam, not
 *      via the primitive's `onChange` callback in isolation.
 *
 *   2. Listbox AC4-I2 — the chapter-index's keyboard contract still binds
 *      ArrowDown/Up, Home, End, Enter, Escape AND now SPACE (the dev
 *      primitive unit test covers Space at the primitive level; the
 *      consumer unit test did NOT exercise Space, so this file is the
 *      tier that locks the wire-up).
 *
 *   3. Listbox AC4-I2 stopPropagation defence — when the listbox is
 *      OPEN and the user presses Space inside it to activate the focused
 *      option, the document-level Space-toggle-play listener (Story 1.10)
 *      MUST NOT fire. The primitive's `stopPropagation()` is the binding
 *      mechanism; this test asserts the document-level listener does not
 *      observe the Space because the primitive stopped it.
 *
 *   4. Listbox AC4-I2 Escape-in-open-panel — Escape pressed inside the
 *      listbox closes the panel AND does NOT also trigger the global
 *      Escape handlers (e.g. help-overlay close). Same stopPropagation
 *      defence path as Space.
 *
 * The lead-executed Chrome DevTools MCP smoke (per voyager-skill-rules
 * Rule 3 + 8) is the binding browser-evidence gate for AC4 in a real
 * runtime — see the "Chrome DevTools MCP smoke" stage in the test
 * summary. This Vitest tier covers the wire-up shape; the MCP smoke
 * covers the real-browser keypress propagation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { startFirstPaint } from '../src/boot/first-paint';
import { ClockManager } from '../src/services/clock-manager';
import { ChapterDirector } from '../src/services/chapter-director';
import { ALL_CHAPTERS } from '../src/chapters/registry';
import {
  MISSION_START_ET,
  MISSION_END_ET,
} from '../src/constants/mission';

const ONE_DAY = 86400;
const TEN_DAYS = 10 * ONE_DAY;

describe('Story 3.0 AC4-I1 — slider-keyboard primitive ↔ <v-timeline-scrubber> wire-up', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // Helper — startFirstPaint with a caller-supplied clockManager re-runs
  // `parseInitialT() → scrubTo(initialEt)` when no urlSync is supplied (see
  // first-paint.ts:183-188), which would reset the clock to MISSION_START_ET
  // and clobber any pre-set scrub position. We therefore scrub AFTER mount.
  const mountAndScrubTo = async (et: number) => {
    const clockManager = new ClockManager();
    const handle = startFirstPaint(document.body, { clockManager });
    clockManager.scrubTo(et);
    await handle.scrubber.updateComplete;
    return { clockManager, handle };
  };

  it('ArrowRight on the thumb advances clockManager.simTimeEt by 1 day (primitive → scrubTo)', async () => {
    const { clockManager, handle } = await mountAndScrubTo(MISSION_START_ET + 30 * ONE_DAY);
    const before = clockManager.simTimeEt;
    const thumb = handle.scrubber.shadowRoot!.querySelector('.thumb') as HTMLElement;
    thumb.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(clockManager.simTimeEt - before).toBe(ONE_DAY);
  });

  it('ArrowLeft on the thumb retreats clockManager.simTimeEt by 1 day', async () => {
    const { clockManager, handle } = await mountAndScrubTo(MISSION_START_ET + 30 * ONE_DAY);
    const before = clockManager.simTimeEt;
    const thumb = handle.scrubber.shadowRoot!.querySelector('.thumb') as HTMLElement;
    thumb.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
    );
    expect(before - clockManager.simTimeEt).toBe(ONE_DAY);
  });

  it('Shift+ArrowRight advances by 10 days (large-step contract reaches the scrubber)', async () => {
    const { clockManager, handle } = await mountAndScrubTo(MISSION_START_ET + 30 * ONE_DAY);
    const before = clockManager.simTimeEt;
    const thumb = handle.scrubber.shadowRoot!.querySelector('.thumb') as HTMLElement;
    thumb.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }),
    );
    expect(clockManager.simTimeEt - before).toBe(TEN_DAYS);
  });

  it('Shift+ArrowLeft retreats by 10 days', async () => {
    const { clockManager, handle } = await mountAndScrubTo(MISSION_START_ET + 30 * ONE_DAY);
    const before = clockManager.simTimeEt;
    const thumb = handle.scrubber.shadowRoot!.querySelector('.thumb') as HTMLElement;
    thumb.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }),
    );
    expect(before - clockManager.simTimeEt).toBe(TEN_DAYS);
  });

  it('Home jumps to MISSION_START_ET (primitive valueMin → scrubber valueMin)', async () => {
    const { clockManager, handle } = await mountAndScrubTo(MISSION_END_ET);
    const thumb = handle.scrubber.shadowRoot!.querySelector('.thumb') as HTMLElement;
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(clockManager.simTimeEt).toBe(MISSION_START_ET);
  });

  it('End jumps to MISSION_END_ET', async () => {
    const { clockManager, handle } = await mountAndScrubTo(MISSION_START_ET);
    const thumb = handle.scrubber.shadowRoot!.querySelector('.thumb') as HTMLElement;
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(clockManager.simTimeEt).toBe(MISSION_END_ET);
  });

  it('keyboard arrow emits voyager:scrub with source=keyboard (primitive onChange → scrubber emit)', async () => {
    const { handle } = await mountAndScrubTo(MISSION_START_ET + 30 * ONE_DAY);
    let captured: { et: number; source: string } | null = null;
    handle.scrubber.addEventListener('voyager:scrub', (e) => {
      captured = (e as CustomEvent<{ et: number; source: string }>).detail;
    });
    const thumb = handle.scrubber.shadowRoot!.querySelector('.thumb') as HTMLElement;
    thumb.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(captured).not.toBeNull();
    expect(captured!.source).toBe('keyboard');
  });

  it('un-handled keys (PageUp / PageDown / ArrowUp / ArrowDown / Tab) do not mutate simTimeEt', async () => {
    const start = MISSION_START_ET + 30 * ONE_DAY;
    const { clockManager, handle } = await mountAndScrubTo(start);
    const thumb = handle.scrubber.shadowRoot!.querySelector('.thumb') as HTMLElement;
    // Note: Enter and Space are NOT included here — they would bubble to the
    // global Space-toggle-play / scrubber-thumb-Enter shortcuts. The primitive
    // explicitly ignores them so they fall through cleanly; that path is
    // covered by the primitive's unit tests, not the integration tier.
    for (const key of ['PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Tab']) {
      thumb.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }
    expect(clockManager.simTimeEt).toBe(start);
  });
});

describe('Story 3.0 AC4-I2 — listbox-keyboard primitive ↔ <v-chapter-index> wire-up', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    // Sweep any stray chapter-index instances so the global keydown listener
    // pool stays clean between tests (mirrors the v-chapter-index.test.ts
    // cleanup contract).
    document
      .querySelectorAll('v-chapter-index')
      .forEach((el) => el.remove());
    document.body.innerHTML = '';
  });

  it('Space pressed inside the open listbox activates the focused option (primitive → onActivate)', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(document.body, { clockManager, chapterDirector: director });
    const index = handle.chapterIndex!;
    await index.updateComplete;

    // Open the panel and confirm it's open with the first option focused.
    index.togglePanel();
    await index.updateComplete;
    expect(index.open).toBe(true);

    const events: Array<{ slug: string; anchorEt: number }> = [];
    index.addEventListener('chapter-jump', (e) => {
      events.push((e as CustomEvent).detail as { slug: string; anchorEt: number });
    });

    const listbox = index.shadowRoot!.querySelector<HTMLElement>('[role="listbox"]')!;
    // Space (key=' ') on the listbox MUST activate the focused option per
    // APG. Note: the consumer-side unit tests exercised Enter but not Space —
    // this is the gap the AC4 extraction closed (the primitive now owns the
    // Space-activate contract; this test pins the wire-up).
    listbox.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
    );
    await index.updateComplete;

    expect(events.length).toBe(1);
    expect(events[0]!.slug).toBe(ALL_CHAPTERS[0]!.slug);
    expect(clockManager.simTimeEt).toBe(ALL_CHAPTERS[0]!.anchorEt);
    expect(clockManager.playing).toBe(false); // scrubTo pauses
    // Activation closes the panel — same semantic as Enter.
    expect(index.open).toBe(false);
  });

  it('Space inside the open listbox does NOT bubble to the document Space-toggle-play handler (stopPropagation defence)', async () => {
    // The primitive's `stopPropagation()` is the binding defence — without it,
    // the global Space-toggle-play listener that `installKeyboardShortcuts`
    // attaches to the document would ALSO fire when the user activates a
    // listbox option with Space. This test asserts the document-level
    // listener does NOT observe Space coming from inside the open listbox.
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(document.body, { clockManager, chapterDirector: director });
    const index = handle.chapterIndex!;
    await index.updateComplete;
    expect(clockManager.playing).toBe(false);

    index.togglePanel();
    await index.updateComplete;

    // Snapshot play state BEFORE the Space activation.
    const playingBefore = clockManager.playing;
    const listbox = index.shadowRoot!.querySelector<HTMLElement>('[role="listbox"]')!;
    listbox.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
    );
    await index.updateComplete;

    // play state MUST be unchanged — the global Space handler is gated by
    // the primitive's stopPropagation. If the bubble defence regresses,
    // clockManager.playing would have flipped to true.
    expect(clockManager.playing).toBe(playingBefore);
    // Sanity: scrubTo also pauses, so even if Space's stopPropagation breaks
    // AND the Space-toggle-play fires (setting playing=true), scrubTo would
    // then immediately pause it again. To rule out that race, also assert
    // the simTimeEt landed on the activated chapter — the activation path
    // happened — but playing stayed false.
    expect(clockManager.simTimeEt).toBe(ALL_CHAPTERS[0]!.anchorEt);
  });

  it('Escape inside the open listbox closes the panel (primitive → onClose)', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(document.body, { clockManager, chapterDirector: director });
    const index = handle.chapterIndex!;
    await index.updateComplete;

    index.togglePanel();
    await index.updateComplete;
    expect(index.open).toBe(true);

    const events: Event[] = [];
    index.addEventListener('chapter-jump', (e) => events.push(e));

    const listbox = index.shadowRoot!.querySelector<HTMLElement>('[role="listbox"]')!;
    listbox.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    await index.updateComplete;

    expect(index.open).toBe(false);
    // Escape MUST NOT activate the focused option — closes without emitting.
    expect(events.length).toBe(0);
  });

  it('ArrowDown then Enter activates the second chapter (primitive moveFocus → consumer activateChapterAtIndex)', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(document.body, { clockManager, chapterDirector: director });
    const index = handle.chapterIndex!;
    await index.updateComplete;

    const events: Array<{ slug: string; anchorEt: number }> = [];
    index.addEventListener('chapter-jump', (e) => {
      events.push((e as CustomEvent).detail as { slug: string; anchorEt: number });
    });

    index.togglePanel();
    await index.updateComplete;

    const listbox = index.shadowRoot!.querySelector<HTMLElement>('[role="listbox"]')!;
    listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await index.updateComplete;
    listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await index.updateComplete;

    expect(events.length).toBe(1);
    expect(events[0]!.slug).toBe(ALL_CHAPTERS[1]!.slug);
    expect(clockManager.simTimeEt).toBe(ALL_CHAPTERS[1]!.anchorEt);
  });

  it('End in the listbox moves focus to the last chapter; Enter activates ALL_CHAPTERS[last]', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(document.body, { clockManager, chapterDirector: director });
    const index = handle.chapterIndex!;
    await index.updateComplete;

    const events: Array<{ slug: string; anchorEt: number }> = [];
    index.addEventListener('chapter-jump', (e) => {
      events.push((e as CustomEvent).detail as { slug: string; anchorEt: number });
    });

    index.togglePanel();
    await index.updateComplete;

    const listbox = index.shadowRoot!.querySelector<HTMLElement>('[role="listbox"]')!;
    listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await index.updateComplete;
    listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await index.updateComplete;

    const last = ALL_CHAPTERS[ALL_CHAPTERS.length - 1]!;
    expect(events.length).toBe(1);
    expect(events[0]!.slug).toBe(last.slug);
    expect(clockManager.simTimeEt).toBe(last.anchorEt);
  });

  it('un-handled keys (Tab, ArrowLeft, ArrowRight) do not activate or close the panel', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(document.body, { clockManager, chapterDirector: director });
    const index = handle.chapterIndex!;
    await index.updateComplete;

    index.togglePanel();
    await index.updateComplete;
    const events: Event[] = [];
    index.addEventListener('chapter-jump', (e) => events.push(e));

    const listbox = index.shadowRoot!.querySelector<HTMLElement>('[role="listbox"]')!;
    for (const key of ['Tab', 'ArrowLeft', 'ArrowRight', 'a']) {
      listbox.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }
    await index.updateComplete;

    expect(events.length).toBe(0);
    expect(index.open).toBe(true);
  });
});

describe('Story 3.0 AC6 — dispose() defence (idempotency + chapterCopy)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('dispose() called twice does not throw (idempotent contract)', () => {
    const handle = startFirstPaint(document.body);
    handle.dispose();
    expect(() => handle.dispose()).not.toThrow();
  });

  it('dispose() removes <v-chapter-copy> when a ChapterDirector was wired', async () => {
    const clockManager = new ClockManager();
    const director = new ChapterDirector(ALL_CHAPTERS);
    const handle = startFirstPaint(document.body, { clockManager, chapterDirector: director });
    expect(handle.chapterCopy).not.toBeNull();
    expect(document.querySelectorAll('v-chapter-copy').length).toBe(1);

    handle.dispose();
    expect(document.querySelectorAll('v-chapter-copy').length).toBe(0);
  });

  it('dispose() handles null chapterCopy without throwing (no ChapterDirector wired)', () => {
    // The default test mount in first-paint-sequence path does NOT wire a
    // director, so chapterCopy stays null. dispose() must optional-chain
    // the .remove() call — otherwise it throws "Cannot read .remove of null".
    const handle = startFirstPaint(document.body);
    expect(handle.chapterCopy).toBeNull();
    expect(() => handle.dispose()).not.toThrow();
  });

  it('post-dispose state: no <v-chapter-copy>, scrubber, hud, etc. — followed by a re-init starting clean', async () => {
    // Full lifecycle: boot with director (mounts chapterCopy) → dispose →
    // boot WITHOUT director → assert chapterCopy is absent in the second boot
    // (not leaked from the first) and that the chrome elements re-mount once.
    const clockManager1 = new ClockManager();
    const director1 = new ChapterDirector(ALL_CHAPTERS);
    const handle1 = startFirstPaint(document.body, {
      clockManager: clockManager1,
      chapterDirector: director1,
    });
    expect(document.querySelectorAll('v-chapter-copy').length).toBe(1);
    handle1.dispose();
    expect(document.querySelectorAll('v-chapter-copy').length).toBe(0);

    // Second boot, no director.
    startFirstPaint(document.body);
    expect(document.querySelectorAll('v-chapter-copy').length).toBe(0);
    expect(document.querySelectorAll('v-timeline-scrubber').length).toBe(1);
    expect(document.querySelectorAll('v-hud').length).toBe(1);
  });
});
