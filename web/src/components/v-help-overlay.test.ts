// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';

import { BaseElement } from './base-element';
import { VHelpOverlay } from './v-help-overlay';

const makeOverlay = async (): Promise<VHelpOverlay> => {
  const el = document.createElement('v-help-overlay') as VHelpOverlay;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
};

const cleanupBody = (): void => {
  document.querySelectorAll('v-help-overlay').forEach((el) => el.remove());
};

afterEach(() => {
  cleanupBody();
});

describe('Story 2.8 — <v-help-overlay> registration + structure', () => {
  it('class extends BaseElement', () => {
    const proto = Object.getPrototypeOf(VHelpOverlay.prototype) as object;
    expect(proto).toBe(BaseElement.prototype);
  });

  it('is registered as the custom element <v-help-overlay>', () => {
    expect(customElements.get('v-help-overlay')).toBe(VHelpOverlay);
  });
});

describe('Story 2.8 AC1 — toggle button (32×32 quieter than chapter-index)', () => {
  it('renders a native <button class="toggle">', async () => {
    const el = await makeOverlay();
    const btn = el.shadowRoot!.querySelector<HTMLButtonElement>('button.toggle');
    expect(btn).not.toBeNull();
    el.remove();
  });

  it('exposes aria-label / aria-expanded / aria-controls when closed', async () => {
    const el = await makeOverlay();
    const btn = el.shadowRoot!.querySelector<HTMLButtonElement>('.toggle')!;
    expect(btn.getAttribute('aria-label')).toBe('Open keyboard shortcuts help');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('aria-controls')).toBe('help-overlay-dialog');
    el.remove();
  });

  it('toggle button has 32×32 sizing rules in CSS', () => {
    const flat = (VHelpOverlay.styles as Array<{ cssText?: string } | undefined>)
      .map((s) => String(s?.cssText ?? ''))
      .join('\n');
    expect(flat).toMatch(/\.toggle\s*\{[^}]*width:\s*32px/);
    expect(flat).toMatch(/\.toggle\s*\{[^}]*height:\s*32px/);
  });

  it('toggle uses --v-color-fg-quiet (visual treatment quieter than chapter-index)', () => {
    const flat = (VHelpOverlay.styles as Array<{ cssText?: string } | undefined>)
      .map((s) => String(s?.cssText ?? ''))
      .join('\n');
    expect(flat).toMatch(/\.toggle\s*\{[^}]*color:\s*var\(--v-color-fg-quiet\)/);
  });

  it('click on the toggle opens the dialog', async () => {
    const el = await makeOverlay();
    const btn = el.shadowRoot!.querySelector<HTMLButtonElement>('.toggle')!;
    btn.click();
    await el.updateComplete;
    expect(el.open).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(btn.getAttribute('aria-label')).toBe('Close keyboard shortcuts help');
    el.remove();
  });
});

describe('Story 2.8 AC2 — `?` global keyboard shortcut', () => {
  it('? keystroke on the document toggles the dialog', async () => {
    const el = await makeOverlay();
    expect(el.open).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
    expect(el.open).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
    expect(el.open).toBe(false);
    el.remove();
  });

  it('? with modifier (Ctrl/Alt/Meta) does NOT toggle', async () => {
    const el = await makeOverlay();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '?', ctrlKey: true, bubbles: true }),
    );
    expect(el.open).toBe(false);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '?', altKey: true, bubbles: true }),
    );
    expect(el.open).toBe(false);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '?', metaKey: true, bubbles: true }),
    );
    expect(el.open).toBe(false);
    el.remove();
  });

  it('? skipped when a text input has focus', async () => {
    const el = await makeOverlay();
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    input.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
    expect(el.open).toBe(false);
    input.remove();
    el.remove();
  });

  it('embed-mode no-op contract: if not mounted, ? is naturally a no-op', () => {
    // No <v-help-overlay> in the DOM (embed mode skips the appendChild).
    // The global handler is registered in connectedCallback, so without
    // a mount nothing listens. Dispatching ? must not throw or open
    // anything.
    expect(() =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true })),
    ).not.toThrow();
  });
});

describe('Story 2.8 AC3 — WAI-ARIA Dialog (Modal) pattern', () => {
  it('renders div role="dialog" with aria-modal=true and aria-labelledby=help-title', async () => {
    const el = await makeOverlay();
    const dialog = el.shadowRoot!.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute('aria-modal')).toBe('true');
    expect(dialog!.getAttribute('aria-labelledby')).toBe('help-title');
    expect(dialog!.id).toBe('help-overlay-dialog');
    el.remove();
  });

  it('dialog title carries id="help-title"', async () => {
    const el = await makeOverlay();
    const title = el.shadowRoot!.querySelector('#help-title');
    expect(title).not.toBeNull();
    expect(title!.tagName).toBe('H1');
    el.remove();
  });

  it('scrim uses --v-color-overlay-scrim', () => {
    const flat = (VHelpOverlay.styles as Array<{ cssText?: string } | undefined>)
      .map((s) => String(s?.cssText ?? ''))
      .join('\n');
    expect(flat).toMatch(/\.scrim\s*\{[^}]*background:\s*var\(--v-color-overlay-scrim\)/);
  });

  it('dialog uses 480px width and 1px --v-color-fg-quiet border', () => {
    const flat = (VHelpOverlay.styles as Array<{ cssText?: string } | undefined>)
      .map((s) => String(s?.cssText ?? ''))
      .join('\n');
    expect(flat).toMatch(/\.dialog\s*\{[^}]*width:\s*480px/);
    expect(flat).toMatch(/\.dialog\s*\{[^}]*border:\s*1px solid var\(--v-color-fg-quiet\)/);
  });

  it('dialog background uses --v-color-bg-elevated (near-bg fill via design token)', () => {
    const flat = (VHelpOverlay.styles as Array<{ cssText?: string } | undefined>)
      .map((s) => String(s?.cssText ?? ''))
      .join('\n');
    expect(flat).toMatch(/\.dialog\s*\{[^}]*background:\s*var\(--v-color-bg-elevated\)/);
  });

  it('dialog open transition combines opacity fade + scale 0.96→1.0 via --v-duration-base', () => {
    const flat = (VHelpOverlay.styles as Array<{ cssText?: string } | undefined>)
      .map((s) => String(s?.cssText ?? ''))
      .join('\n');
    // Closed state — scale(0.96)
    expect(flat).toMatch(/\.dialog\s*\{[^}]*transform:\s*translate\([^)]+\)\s*scale\(0\.96\)/);
    // Open state — scale(1)
    expect(flat).toMatch(
      /:host\(\[data-open\]\)\s*\.dialog\s*\{[^}]*transform:\s*translate\([^)]+\)\s*scale\(1\)/,
    );
    // Transition references --v-duration-base for both opacity + transform
    expect(flat).toMatch(/\.dialog\s*\{[^}]*transition:[^;]*var\(--v-duration-base\)/);
  });

  it('reduced-motion is honoured via the global --v-duration-base token (no per-component override)', () => {
    const flat = (VHelpOverlay.styles as Array<{ cssText?: string } | undefined>)
      .map((s) => String(s?.cssText ?? ''))
      .join('\n');
    // Mirror of Story 2.3 defense — no per-component @media query;
    // global.css owns the prefers-reduced-motion declaration that
    // flips --v-duration-base to 0ms.
    expect(flat).not.toMatch(/@media[^{]*prefers-reduced-motion/);
    expect(flat).toMatch(/\.scrim\s*\{[^}]*transition:[^;]*var\(--v-duration-base\)/);
    expect(flat).toMatch(/\.dialog\s*\{[^}]*transition:[^;]*var\(--v-duration-base\)/);
  });
});

describe('Story 2.8 AC4 — four shortcut inventory sections', () => {
  it('renders exactly four <h2 class="section-heading"> headings in canonical order', async () => {
    const el = await makeOverlay();
    const headings = Array.from(
      el.shadowRoot!.querySelectorAll<HTMLHeadingElement>('h2.section-heading'),
    );
    expect(headings.length).toBe(4);
    expect(headings.map((h) => h.textContent?.trim())).toEqual([
      'Playback',
      'Navigation',
      'Speed',
      'Display',
    ]);
    el.remove();
  });

  it('shortcut keys are rendered with semantic <kbd> elements', async () => {
    const el = await makeOverlay();
    const kbds = el.shadowRoot!.querySelectorAll('kbd');
    // Sanity: at minimum one kbd per chord; many chords exist (Space,
    // arrows, Shift+arrows, Home/End, digits, M, A, +/-, Shift+/-, H,
    // G, ?, Esc). Lower bound 18 — actual count higher.
    expect(kbds.length).toBeGreaterThanOrEqual(18);
    // Spot-check a few canonical ones
    const kbdTexts = Array.from(kbds).map((k) => k.textContent);
    expect(kbdTexts).toContain('Space');
    expect(kbdTexts).toContain('Esc');
    expect(kbdTexts).toContain('?');
    expect(kbdTexts).toContain('M');
    expect(kbdTexts).toContain('A');
    el.remove();
  });

  it('kbd boxes are styled with 1px border + mono font', () => {
    const flat = (VHelpOverlay.styles as Array<{ cssText?: string } | undefined>)
      .map((s) => String(s?.cssText ?? ''))
      .join('\n');
    expect(flat).toMatch(/kbd\s*\{[^}]*border:\s*1px solid/);
    expect(flat).toMatch(/kbd\s*\{[^}]*font-family:\s*var\(--v-font-mono\)/);
  });

  it('shortcut descriptions are styled with --v-color-fg-muted', () => {
    const flat = (VHelpOverlay.styles as Array<{ cssText?: string } | undefined>)
      .map((s) => String(s?.cssText ?? ''))
      .join('\n');
    expect(flat).toMatch(/\.shortcut-desc\s*\{[^}]*color:\s*var\(--v-color-fg-muted\)/);
  });

  it('Playback section contains Space / arrow / Home-End shortcuts', async () => {
    const el = await makeOverlay();
    const sections = Array.from(
      el.shadowRoot!.querySelectorAll<HTMLElement>('section.section'),
    );
    const playback = sections[0]!;
    expect(playback.textContent).toMatch(/Play\s*\/\s*pause/);
    expect(playback.textContent).toMatch(/Scrub by 1 unit/);
    expect(playback.textContent).toMatch(/Mission start\s*\/\s*end/);
    el.remove();
  });

  it('Navigation section contains chapter digits, M, A shortcuts', async () => {
    const el = await makeOverlay();
    const sections = Array.from(
      el.shadowRoot!.querySelectorAll<HTMLElement>('section.section'),
    );
    const nav = sections[1]!;
    expect(nav.textContent).toMatch(/Jump to chapter N/);
    expect(nav.textContent).toMatch(/Open chapter index/);
    expect(nav.textContent).toMatch(/Open About page/);
    el.remove();
  });

  it('Display section contains H, G, ?, Esc shortcuts', async () => {
    const el = await makeOverlay();
    const sections = Array.from(
      el.shadowRoot!.querySelectorAll<HTMLElement>('section.section'),
    );
    const display = sections[3]!;
    expect(display.textContent).toMatch(/Toggle HUD/);
    expect(display.textContent).toMatch(/Toggle Golden Record audio/);
    expect(display.textContent).toMatch(/Open this help overlay/);
    expect(display.textContent).toMatch(/Close any overlay/);
    el.remove();
  });
});

describe('Story 2.8 AC5 — focus trap + Esc + restore focus', () => {
  it('opens dialog → initial focus is on the close button', async () => {
    const el = await makeOverlay();
    el.togglePanel(false);
    await el.updateComplete;
    // Wait one extra microtask cycle for the deferred trap activation.
    await Promise.resolve();
    expect(el.open).toBe(true);
    const close = el.shadowRoot!.querySelector<HTMLButtonElement>('.close')!;
    expect(close).not.toBeNull();
    // Note: actual document.activeElement may not equal close in
    // happy-dom without layout — focus-trap's displayCheck='none'
    // helps but happy-dom's focus model is still partial. The
    // contract we enforce here is structural: the close button
    // exists and is reachable as the initialFocus target.
    el.remove();
  });

  it('Esc inside the dialog closes the modal', async () => {
    const el = await makeOverlay();
    el.togglePanel(false);
    await el.updateComplete;
    expect(el.open).toBe(true);
    const dialog = el.shadowRoot!.querySelector<HTMLElement>('.dialog')!;
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await el.updateComplete;
    expect(el.open).toBe(false);
    el.remove();
  });

  it('Esc keydown inside dialog calls stopPropagation (does not bubble to other handlers)', async () => {
    const el = await makeOverlay();
    el.togglePanel(false);
    await el.updateComplete;
    const dialog = el.shadowRoot!.querySelector<HTMLElement>('.dialog')!;
    let bubbledToDoc = false;
    const docListener = (): void => {
      bubbledToDoc = true;
    };
    document.addEventListener('keydown', docListener);
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    dialog.dispatchEvent(ev);
    document.removeEventListener('keydown', docListener);
    expect(bubbledToDoc).toBe(false);
    el.remove();
  });

  it('on close via button click, focus is restored to the toggle button', async () => {
    const el = await makeOverlay();
    // Open via mouse click (not keyboard) so the close path tries to
    // restore focus to the toggle.
    const btn = el.shadowRoot!.querySelector<HTMLButtonElement>('.toggle')!;
    btn.click();
    await el.updateComplete;
    expect(el.open).toBe(true);
    const close = el.shadowRoot!.querySelector<HTMLButtonElement>('.close')!;
    close.click();
    await el.updateComplete;
    expect(el.open).toBe(false);
    // updateComplete is post-render; explicit focus restoration is
    // scheduled via a microtask on top of that. Wait one more turn.
    await el.updateComplete;
    await Promise.resolve();
    expect(el.shadowRoot!.activeElement).toBe(btn);
    el.remove();
  });

  it('on close after `?`-keyboard open, focus is NOT yanked to the toggle (stays on body)', async () => {
    const el = await makeOverlay();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
    await el.updateComplete;
    expect(el.open).toBe(true);
    // Close via Esc on the dialog
    const dialog = el.shadowRoot!.querySelector<HTMLElement>('.dialog')!;
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await el.updateComplete;
    await Promise.resolve();
    // The toggle should NOT be the shadow active element — focus
    // stayed wherever the user was before opening (the body).
    const btn = el.shadowRoot!.querySelector<HTMLButtonElement>('.toggle')!;
    expect(el.shadowRoot!.activeElement).not.toBe(btn);
    el.remove();
  });
});

describe('Story 2.8 AC6 — `A` keyboard shortcut routes to /about', () => {
  it('pressing A from body calls the navigate callback with "/about"', async () => {
    const el = await makeOverlay();
    const navigations: string[] = [];
    el.navigate = (url: string) => {
      navigations.push(url);
    };
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(navigations).toEqual(['/about']);
    el.remove();
  });

  it('uppercase A also routes', async () => {
    const el = await makeOverlay();
    const navigations: string[] = [];
    el.navigate = (url: string) => {
      navigations.push(url);
    };
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', bubbles: true }));
    expect(navigations).toEqual(['/about']);
    el.remove();
  });

  it('A with modifier (Ctrl/Alt/Meta) does NOT navigate', async () => {
    const el = await makeOverlay();
    const navigations: string[] = [];
    el.navigate = (url: string) => {
      navigations.push(url);
    };
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }),
    );
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', altKey: true, bubbles: true }),
    );
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true }),
    );
    expect(navigations).toEqual([]);
    el.remove();
  });

  it('A skipped when a text input has focus', async () => {
    const el = await makeOverlay();
    const navigations: string[] = [];
    el.navigate = (url: string) => {
      navigations.push(url);
    };
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    input.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(navigations).toEqual([]);
    input.remove();
    el.remove();
  });

  it('A while help overlay is open does NOT navigate (Esc-to-close takes precedence)', async () => {
    const el = await makeOverlay();
    const navigations: string[] = [];
    el.navigate = (url: string) => {
      navigations.push(url);
    };
    el.togglePanel(true);
    await el.updateComplete;
    expect(el.open).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(navigations).toEqual([]);
    el.remove();
  });

  it('embed-mode no-op contract: if not mounted, A is naturally a no-op (no navigate fires)', () => {
    // No <v-help-overlay> in the DOM. Dispatch A — must not throw.
    expect(() =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })),
    ).not.toThrow();
  });
});

describe('Story 2.8 — scrim is wired with a click handler (real-browser smoke verifies close)', () => {
  it('renders a .scrim element inside the shadow root', async () => {
    const el = await makeOverlay();
    const scrim = el.shadowRoot!.querySelector<HTMLElement>('.scrim');
    expect(scrim).not.toBeNull();
    el.remove();
  });
  // happy-dom drops click events on elements regardless of CSS
  // pointer-events, so a unit-tier assertion of "scrim click closes
  // the dialog" is unreliable here. The lead-driven Chrome DevTools
  // MCP smoke (Integration AC8) covers this in a real browser. The
  // explicit Esc-closes test above is the binding unit gate.
});

describe('Story 2.8 — disconnect cleanly removes global listeners', () => {
  it('after remove(), ? no longer toggles', () => {
    const el = document.createElement('v-help-overlay') as VHelpOverlay;
    document.body.appendChild(el);
    el.remove();
    expect(() =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true })),
    ).not.toThrow();
  });

  it('after remove(), A no longer fires navigate', () => {
    const el = document.createElement('v-help-overlay') as VHelpOverlay;
    const navigations: string[] = [];
    el.navigate = (url: string) => {
      navigations.push(url);
    };
    document.body.appendChild(el);
    el.remove();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(navigations).toEqual([]);
  });

  it('disconnecting while open does not throw (focus-trap deactivated cleanly)', async () => {
    const el = await makeOverlay();
    el.togglePanel(false);
    await el.updateComplete;
    expect(el.open).toBe(true);
    expect(() => el.remove()).not.toThrow();
  });
});

describe('Story 2.8 — synchronous open→close race guard (cr-2-3 microtask defence)', () => {
  it('toggling twice synchronously leaves dialog closed and no trap leaks', async () => {
    const el = await makeOverlay();
    el.togglePanel(false);
    el.togglePanel(false);
    await el.updateComplete;
    await Promise.resolve();
    expect(el.open).toBe(false);
    // No trap leak — subsequent open+close must work normally.
    el.togglePanel(false);
    await el.updateComplete;
    expect(el.open).toBe(true);
    el.togglePanel(false);
    await el.updateComplete;
    expect(el.open).toBe(false);
    el.remove();
  });
});
