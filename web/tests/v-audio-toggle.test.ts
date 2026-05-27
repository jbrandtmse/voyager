// @vitest-environment happy-dom
/**
 * Unit tests for `<v-audio-toggle>` (Story 6.1, T3 Subtask 3.7).
 *
 * Covers:
 *   - Initial render: aria-pressed="false", aria-label "Turn Golden
 *     Record audio on", muted glyph.
 *   - On-state render: aria-pressed="true", aria-label "Turn Golden
 *     Record audio off", speaker glyph.
 *   - Click handler invokes `audioService.toggle()` and reflects state.
 *   - `G` key (and `g` lower-case) toggles via document keydown.
 *   - Modifier-held G (Ctrl/Alt/Meta) is suppressed.
 *   - G keydown inside a text-input is suppressed (text-input-aware).
 *   - External service state change (subscribe path) is mirrored.
 *   - disconnectedCallback unsubscribes and removes the global listener.
 *   - Rule 10 verification: reactive properties use `declare` + ctor-init.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../src/components/v-audio-toggle';
import { VAudioToggle } from '../src/components/v-audio-toggle';
import {
  AudioPlaybackService,
  type AudioEngineLike,
  type StorageLike,
} from '../src/services/audio-playback-service';

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

const makeService = (): AudioPlaybackService =>
  new AudioPlaybackService({
    audioEngine: makeStubEngine(),
    storage: makeStubStorage(),
    generateSessionId: () => 'session-test',
  });

const mount = async (
  service: AudioPlaybackService | null,
): Promise<VAudioToggle> => {
  const el = document.createElement('v-audio-toggle') as VAudioToggle;
  el.audioService = service;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
};

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('<v-audio-toggle> — initial render', () => {
  it('renders aria-pressed="false" and the muted glyph when off', async () => {
    const svc = makeService();
    const el = await mount(svc);
    const button = el.shadowRoot!.querySelector('button');
    expect(button).not.toBeNull();
    expect(button!.getAttribute('aria-pressed')).toBe('false');
    expect(button!.getAttribute('aria-label')).toBe(
      'Turn Golden Record audio on',
    );
    // Muted-speaker glyph U+1F507
    expect(button!.textContent?.trim()).toBe('\u{1F507}');
  });

  it('renders even without a wired service (defensive)', async () => {
    const el = await mount(null);
    const button = el.shadowRoot!.querySelector('button');
    expect(button).not.toBeNull();
    expect(button!.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('<v-audio-toggle> — click handler', () => {
  it('clicking flips toggle on, reflects aria-pressed + label + glyph', async () => {
    const svc = makeService();
    const el = await mount(svc);
    const button = el.shadowRoot!.querySelector('button')!;
    button.click();
    await el.updateComplete;
    expect(svc.isOn()).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe(
      'Turn Golden Record audio off',
    );
    // Speaker glyph U+1F50A
    expect(button.textContent?.trim()).toBe('\u{1F50A}');
  });

  it('clicking twice flips back to off', async () => {
    const svc = makeService();
    const el = await mount(svc);
    const button = el.shadowRoot!.querySelector('button')!;
    button.click();
    await el.updateComplete;
    button.click();
    await el.updateComplete;
    expect(svc.isOn()).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking without a service still flips local visual state', async () => {
    const el = await mount(null);
    const button = el.shadowRoot!.querySelector('button')!;
    button.click();
    await el.updateComplete;
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('<v-audio-toggle> — G keyboard shortcut', () => {
  it('lowercase g flips the toggle', async () => {
    const svc = makeService();
    const el = await mount(svc);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', bubbles: true }),
    );
    await el.updateComplete;
    expect(svc.isOn()).toBe(true);
  });

  it('uppercase G flips the toggle (Shift handling is benign)', async () => {
    const svc = makeService();
    const el = await mount(svc);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'G', bubbles: true, shiftKey: true }),
    );
    await el.updateComplete;
    expect(svc.isOn()).toBe(true);
  });

  it('G with Ctrl is suppressed (modifier guard)', async () => {
    const svc = makeService();
    const el = await mount(svc);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', ctrlKey: true, bubbles: true }),
    );
    await el.updateComplete;
    expect(svc.isOn()).toBe(false);
  });

  it('G with Alt is suppressed', async () => {
    const svc = makeService();
    const el = await mount(svc);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', altKey: true, bubbles: true }),
    );
    await el.updateComplete;
    expect(svc.isOn()).toBe(false);
  });

  it('G with Meta is suppressed', async () => {
    const svc = makeService();
    const el = await mount(svc);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', metaKey: true, bubbles: true }),
    );
    await el.updateComplete;
    expect(svc.isOn()).toBe(false);
  });

  it('G when an <input type="text"> is focused does NOT toggle', async () => {
    const svc = makeService();
    const el = await mount(svc);
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    input.focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', bubbles: true }),
    );
    await el.updateComplete;
    expect(svc.isOn()).toBe(false);
  });

  it('G when a <textarea> is focused does NOT toggle', async () => {
    const svc = makeService();
    const el = await mount(svc);
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', bubbles: true }),
    );
    await el.updateComplete;
    expect(svc.isOn()).toBe(false);
  });

  it('G when a contenteditable element is focused does NOT toggle', async () => {
    const svc = makeService();
    const el = await mount(svc);
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    div.tabIndex = 0;
    document.body.appendChild(div);
    div.focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', bubbles: true }),
    );
    await el.updateComplete;
    expect(svc.isOn()).toBe(false);
  });

  it('G when a <button> is focused DOES toggle (button is not a text input)', async () => {
    const svc = makeService();
    const el = await mount(svc);
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    btn.focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', bubbles: true }),
    );
    await el.updateComplete;
    expect(svc.isOn()).toBe(true);
  });

  it('other keys are not handled', async () => {
    const svc = makeService();
    const el = await mount(svc);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'h', bubbles: true }),
    );
    await el.updateComplete;
    expect(svc.isOn()).toBe(false);
  });

  it('G is suppressed when <v-help-overlay> is open (AC3, Story 6.1 code-review HIGH-1 fix)', async () => {
    const svc = makeService();
    const el = await mount(svc);
    // Simulate the help-overlay open state by mounting a stand-in
    // element with the reflected `data-open` attribute. The G-shortcut
    // listener probes `[data-open]` on any `<v-help-overlay>` in the
    // document — no need to mount the real overlay (kept dep-light).
    const overlay = document.createElement('v-help-overlay');
    overlay.setAttribute('data-open', 'true');
    document.body.appendChild(overlay);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', bubbles: true }),
    );
    await el.updateComplete;
    expect(svc.isOn()).toBe(false);
    overlay.remove();
  });

  it('G fires normally when <v-help-overlay> is closed (no data-open attribute)', async () => {
    const svc = makeService();
    const el = await mount(svc);
    // Overlay present but closed — data-open attribute absent.
    const overlay = document.createElement('v-help-overlay');
    document.body.appendChild(overlay);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', bubbles: true }),
    );
    await el.updateComplete;
    expect(svc.isOn()).toBe(true);
    overlay.remove();
  });

  it('G fires normally when no <v-help-overlay> is mounted (embed mode)', async () => {
    const svc = makeService();
    const el = await mount(svc);
    // No overlay in DOM at all — mirrors embed mode where Story 2.8's
    // help overlay is conditionally skipped in first-paint.ts.
    expect(document.querySelector('v-help-overlay')).toBeNull();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', bubbles: true }),
    );
    await el.updateComplete;
    expect(svc.isOn()).toBe(true);
  });
});

describe('<v-audio-toggle> — service subscribe path', () => {
  it('reflects external service state changes (e.g. persistence-driven restore)', async () => {
    const svc = makeService();
    const el = await mount(svc);
    // Service flip from outside (simulates a same-session persistence
    // restore or a programmatic state change).
    svc.setOn(true);
    await el.updateComplete;
    const button = el.shadowRoot!.querySelector('button')!;
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('seeds toggle state from service at connectedCallback', async () => {
    const svc = makeService();
    svc.setOn(true);
    const el = await mount(svc);
    const button = el.shadowRoot!.querySelector('button')!;
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('<v-audio-toggle> — lifecycle', () => {
  it('disconnectedCallback unsubscribes and removes the global listener', async () => {
    const svc = makeService();
    const el = await mount(svc);
    el.remove();
    // After disconnect, G keydown must NOT flip the service state.
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', bubbles: true }),
    );
    expect(svc.isOn()).toBe(false);
  });

  it('reconnect re-installs the listener', async () => {
    const svc = makeService();
    const el = await mount(svc);
    el.remove();
    document.body.appendChild(el);
    await el.updateComplete;
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', bubbles: true }),
    );
    await el.updateComplete;
    expect(svc.isOn()).toBe(true);
  });
});

describe('<v-audio-toggle> — Rule 10 verification', () => {
  it('audioOn is declared via static properties (not a class-field initializer)', () => {
    // Static properties includes audioOn.
    const props = (VAudioToggle as unknown as {
      properties?: Record<string, unknown>;
    }).properties;
    expect(props).toBeDefined();
    expect(props!.audioOn).toBeDefined();
  });

  it('audioOn does not appear as an OWN class-field initializer on the prototype', () => {
    // Rule 10 — the property must be a reactive getter/setter on the
    // prototype, not an own data property on each instance. We probe
    // the descriptor on the class prototype.
    const descriptor = Object.getOwnPropertyDescriptor(
      VAudioToggle.prototype,
      'audioOn',
    );
    // Lit installs an accessor (getter/setter) for each reactive prop.
    expect(descriptor).toBeDefined();
    expect(descriptor!.get).toBeTypeOf('function');
    expect(descriptor!.set).toBeTypeOf('function');
  });
});
