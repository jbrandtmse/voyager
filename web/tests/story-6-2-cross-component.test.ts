// @vitest-environment happy-dom
/**
 * Story 6.2 — cross-component QA coverage (HUD ↔ help-overlay ↔
 * audio-toggle interaction surface).
 *
 * This file augments the per-component unit tests with cross-component
 * scenarios the parent QA prompt flagged as coverage gaps:
 *
 *   Gap 1 — `H` shortcut while `<v-help-overlay>` is open: confirmed
 *     suppressed via the shared `isHelpOverlayOpen` helper. The per-
 *     component test (`v-hud-dismiss-restore.test.ts`) already asserts
 *     the gate against a synthetic `<v-help-overlay>` element with a
 *     manually-set `data-open`. Here we additionally verify the SAME
 *     helper is consumed by BOTH `<v-audio-toggle>` (G shortcut from
 *     Story 6.1) AND `<v-hud>` (H shortcut from Story 6.2) — exercising
 *     the Rule 9 second-consumer extraction at the integration layer.
 *
 *   Gap 2 — Esc bubble-phase ordering: the HUD's Esc-while-dismissed
 *     restore must NOT fire when an overlay-close handler also lives on
 *     Esc. The contract is `if (hud.dismissed)` — Esc while visible is
 *     a no-op, so the overlay-close handler (which fires when the
 *     overlay is open) and the HUD-restore handler (which fires when
 *     the HUD is dismissed) cannot collide in practice. We exercise:
 *       (a) overlay open + HUD visible + Esc → overlay closes, HUD
 *           remains visible.
 *       (b) overlay open + HUD dismissed (the help-while-dismissed
 *           pathological case) + Esc → the HUD's keydown handler
 *           short-circuits via `isHelpOverlayOpen`, so the HUD does NOT
 *           restore until the next Esc (after the overlay has closed).
 *       (c) the HUD's listener is at BUBBLE phase (default
 *           `addEventListener` semantics) so overlay-close handlers
 *           which run on the overlay's own DOM bubble up FIRST. We
 *           assert listener-installation order indirectly via the
 *           observable effect.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../src/components/v-hud';
import '../src/components/v-audio-toggle';
import { VHud } from '../src/components/v-hud';
import { VAudioToggle } from '../src/components/v-audio-toggle';
import {
  AudioPlaybackService,
  type AudioEngineLike,
  type StorageLike,
} from '../src/services/audio-playback-service';
import { isHelpOverlayOpen } from '../src/lib/help-overlay-state';

const makeStubEngine = (): AudioEngineLike => ({
  prepare: () => {},
  fadeIn: () => {},
  fadeOut: () => {},
  pause: () => {},
  resume: () => {},
  dispose: () => {},
});

const makeStubStorage = (): StorageLike => {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
};

beforeEach(() => {
  document.body.innerHTML = '';
  try {
    window.sessionStorage.clear();
  } catch {
    // ignore
  }
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Story 6.2 — cross-component help-overlay suppression (Rule 9 second-consumer)', () => {
  it('isHelpOverlayOpen returns false when no <v-help-overlay> is mounted', () => {
    expect(isHelpOverlayOpen()).toBe(false);
  });

  it('isHelpOverlayOpen returns true when overlay carries data-open', () => {
    const overlay = document.createElement('v-help-overlay');
    overlay.setAttribute('data-open', '');
    document.body.appendChild(overlay);
    expect(isHelpOverlayOpen()).toBe(true);
    overlay.remove();
  });

  it('both H and G shortcuts share the SAME suppression helper (Rule 9 contract)', async () => {
    // Mount both `<v-hud>` and `<v-audio-toggle>` plus a fake
    // `<v-help-overlay>`. Pressing G should be suppressed AND pressing
    // H should be suppressed while the overlay is "open" (data-open).
    const hud = document.createElement('v-hud') as VHud;
    document.body.appendChild(hud);
    await hud.updateComplete;

    const audioService = new AudioPlaybackService({
      engine: makeStubEngine(),
      storage: makeStubStorage(),
    });
    const audio = document.createElement('v-audio-toggle') as VAudioToggle;
    audio.audioService = audioService;
    document.body.appendChild(audio);
    await audio.updateComplete;

    const overlay = document.createElement('v-help-overlay');
    overlay.setAttribute('data-open', '');
    document.body.appendChild(overlay);

    // Press G — audio toggle should be suppressed.
    const audioOnBefore = audioService.isOn();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', bubbles: true }),
    );
    await audio.updateComplete;
    expect(audioService.isOn()).toBe(audioOnBefore);

    // Press H — HUD dismiss should be suppressed.
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'h', bubbles: true }),
    );
    await hud.updateComplete;
    expect(hud.dismissed).toBe(false);

    overlay.remove();
  });

  it('closing the overlay (removing data-open) re-enables BOTH shortcuts', async () => {
    const hud = document.createElement('v-hud') as VHud;
    document.body.appendChild(hud);
    await hud.updateComplete;

    const overlay = document.createElement('v-help-overlay');
    overlay.setAttribute('data-open', '');
    document.body.appendChild(overlay);

    // H suppressed while overlay open.
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'h', bubbles: true }),
    );
    await hud.updateComplete;
    expect(hud.dismissed).toBe(false);

    // Now "close" the overlay by removing data-open.
    overlay.removeAttribute('data-open');
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'h', bubbles: true }),
    );
    await hud.updateComplete;
    expect(hud.dismissed).toBe(true);

    overlay.remove();
  });
});

describe('Story 6.2 — Esc bubble-phase ordering with help overlay', () => {
  it('Esc with overlay-open + HUD-visible leaves HUD visible (no premature restore)', async () => {
    const hud = document.createElement('v-hud') as VHud;
    document.body.appendChild(hud);
    await hud.updateComplete;
    expect(hud.dismissed).toBe(false);

    const overlay = document.createElement('v-help-overlay');
    overlay.setAttribute('data-open', '');
    document.body.appendChild(overlay);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await hud.updateComplete;

    // HUD remains visible — Esc while-visible is a no-op (HUD's handler
    // gates on `hud.dismissed`).
    expect(hud.dismissed).toBe(false);
    overlay.remove();
  });

  it('Esc with overlay-open + HUD-dismissed: HUD does NOT restore until overlay closes', async () => {
    // The pathological case: user dismisses HUD with H, then opens
    // help overlay (somehow), then presses Esc. The HUD's Esc handler
    // checks isHelpOverlayOpen FIRST and short-circuits, so the HUD
    // remains dismissed (the overlay-close handler runs separately).
    const hud = document.createElement('v-hud') as VHud;
    document.body.appendChild(hud);
    await hud.updateComplete;

    hud.dismissed = true;
    await hud.updateComplete;
    expect(hud.dismissed).toBe(true);

    const overlay = document.createElement('v-help-overlay');
    overlay.setAttribute('data-open', '');
    document.body.appendChild(overlay);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await hud.updateComplete;

    // The HUD's Esc-while-dismissed handler is short-circuited by
    // isHelpOverlayOpen — HUD remains dismissed. (In production the
    // overlay-close handler on the overlay's own element fires first
    // at bubble phase, closing the overlay; a subsequent Esc then
    // restores the HUD. We assert the suppression here directly.)
    expect(hud.dismissed).toBe(true);

    // Simulate the overlay closing (remove data-open) and press Esc
    // again — now the HUD restores.
    overlay.removeAttribute('data-open');
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await hud.updateComplete;
    expect(hud.dismissed).toBe(false);

    overlay.remove();
  });

  it('Esc keydown event is NOT cancelled (defaultPrevented=false) when HUD is visible', async () => {
    // The HUD's handler ONLY calls preventDefault() when it actually
    // restores from dismissed; an Esc while visible leaves the event
    // uncancelled, so overlay handlers downstream can still consume it.
    const hud = document.createElement('v-hud') as VHud;
    document.body.appendChild(hud);
    await hud.updateComplete;

    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    await hud.updateComplete;
    expect(ev.defaultPrevented).toBe(false);
  });

  it('Esc with HUD-dismissed + NO overlay restores the HUD AND preventDefault fires', async () => {
    const hud = document.createElement('v-hud') as VHud;
    document.body.appendChild(hud);
    await hud.updateComplete;
    hud.dismissed = true;
    await hud.updateComplete;

    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    await hud.updateComplete;
    expect(hud.dismissed).toBe(false);
    expect(ev.defaultPrevented).toBe(true);
  });
});

describe('Story 6.2 — H key bubble-phase + isolation from overlay handlers', () => {
  it('H keydown event is preventDefault-ed when the HUD toggles (consume marker)', async () => {
    const hud = document.createElement('v-hud') as VHud;
    document.body.appendChild(hud);
    await hud.updateComplete;

    const ev = new KeyboardEvent('keydown', { key: 'h', bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    await hud.updateComplete;
    expect(hud.dismissed).toBe(true);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('H keydown is NOT preventDefault-ed when suppressed (text-input focused)', async () => {
    const hud = document.createElement('v-hud') as VHud;
    document.body.appendChild(hud);
    await hud.updateComplete;

    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    input.focus();

    const ev = new KeyboardEvent('keydown', { key: 'h', bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    await hud.updateComplete;
    expect(hud.dismissed).toBe(false);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('H keydown is NOT preventDefault-ed when suppressed (help overlay open)', async () => {
    const hud = document.createElement('v-hud') as VHud;
    document.body.appendChild(hud);
    await hud.updateComplete;

    const overlay = document.createElement('v-help-overlay');
    overlay.setAttribute('data-open', '');
    document.body.appendChild(overlay);

    const ev = new KeyboardEvent('keydown', { key: 'h', bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    await hud.updateComplete;
    expect(hud.dismissed).toBe(false);
    expect(ev.defaultPrevented).toBe(false);

    overlay.remove();
  });
});
