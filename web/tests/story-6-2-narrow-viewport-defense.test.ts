// @vitest-environment happy-dom
/**
 * Story 6.2 — narrow-viewport top-right HUD cluster defense
 * ([4.0-smoke/LOW] from deferred-work.md:684-705).
 *
 * The defect routed to Story 6.2 reads:
 *   "Top-right HUD chrome density defect — date readout visually
 *    clusters with chapter-index + help icons."
 *
 * AC3 commits that the top-right cluster (`<v-help-overlay>` `?` icon
 * + `<v-chapter-index>` icon + the new `⋯` button) respects gutter
 * spacing — no overlap with the always-visible `<v-hud-date>` readout.
 *
 * Per the AC's gutter contract, we verify at the DOM topology level:
 *
 *   (a) The `⋯` toggle button is rendered as a DIRECT sibling of
 *       `<v-hud-date>` inside the top-right corner div, so they
 *       participate in the same flex column gap (no fixed-position
 *       collision).
 *   (b) The corner uses `flex-direction: column` so date stacks above
 *       the toggle rather than overlapping (CSS-source assertion).
 *   (c) Order in the rendered template: date FIRST, optional attitude
 *       indicator, optional distance, optional `⋯` toggle.
 *   (d) At narrow viewport with `expandedAtNarrow=false`, the toggle
 *       button appears AFTER `<v-hud-date>` (so the date readout
 *       remains the top-right element).
 *   (e) The compact-toggle CSS has `min-width: 32px; min-height: 32px`
 *       — AC3's "keyboard-tab-focusable in the natural document order"
 *       implies an adequate hit target.
 *
 * The CSS density argument (visually clustering) is best validated by
 * the lead-side Chrome DevTools MCP smoke. At the vitest tier we
 * assert the structural invariants that make the smoke success likely.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '../src/components/v-hud';
import { VHud } from '../src/components/v-hud';

const HUD_SOURCE = readFileSync(
  resolve(__dirname, '..', 'src', 'components', 'v-hud.ts'),
  'utf-8',
);

const mountHudNarrow = async (
  opts: { expanded?: boolean } = {},
): Promise<VHud> => {
  const el = document.createElement('v-hud') as VHud;
  document.body.appendChild(el);
  await el.updateComplete;
  el.narrowViewport = true;
  if (opts.expanded === true) el.expandedAtNarrow = true;
  await el.updateComplete;
  return el;
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

describe('Story 6.2 narrow-viewport defense — top-right cluster topology', () => {
  it('the `⋯` toggle is a child of `.corner.top-right` (not a fixed-position sibling)', async () => {
    const el = await mountHudNarrow();
    const corner = el.shadowRoot!.querySelector('.corner.top-right');
    expect(corner).not.toBeNull();
    const toggle = corner!.querySelector('.compact-toggle');
    expect(toggle).not.toBeNull();
  });

  it('top-right corner is flex-direction:column (date stacks above toggle, no overlap)', () => {
    // The base `.corner` rule declares flex-direction: column — we
    // assert against the SOURCE CSS since happy-dom's computed-style
    // for shadow-DOM children isn't reliable.
    expect(HUD_SOURCE).toMatch(/\.corner\s*\{[^}]*flex-direction:\s*column[^}]*\}/s);
  });

  it('top-right corner includes a vertical gap (var(--v-space-2)) between stacked items', () => {
    expect(HUD_SOURCE).toMatch(/\.corner\s*\{[^}]*gap:\s*var\(--v-space-2\)[^}]*\}/s);
  });

  it('render order at narrow + collapsed: date FIRST, toggle LAST', async () => {
    const el = await mountHudNarrow();
    const corner = el.shadowRoot!.querySelector('.corner.top-right');
    const children = Array.from(corner!.children);
    // Expected at narrow+collapsed (no attitude indicator unless embedEnabled
    // is false; distance hidden because !expandedAtNarrow):
    //   1) <v-hud-date>
    //   2) <v-attitude-indicator>  (because embedEnabled defaults false)
    //   3) <button class="compact-toggle">
    const tags = children.map((c) => c.tagName.toLowerCase());
    expect(tags[0]).toBe('v-hud-date');
    expect(tags[tags.length - 1]).toBe('button');
    expect(tags).not.toContain('v-hud-distance');
  });

  it('render order at narrow + expanded: date, indicator, distance, then toggle', async () => {
    const el = await mountHudNarrow({ expanded: true });
    const corner = el.shadowRoot!.querySelector('.corner.top-right');
    const children = Array.from(corner!.children);
    const tags = children.map((c) => c.tagName.toLowerCase());
    expect(tags[0]).toBe('v-hud-date');
    expect(tags).toContain('v-hud-distance');
    expect(tags[tags.length - 1]).toBe('button');
  });

  it('compact-toggle has a 32×32 minimum hit-target (touch-friendly density)', () => {
    // AC3: "keyboard-tab-focusable in the natural document order" — and
    // the icon cluster density argument needs adequate hit targets so
    // adjacent icons don't visually crowd each other.
    expect(HUD_SOURCE).toMatch(/\.compact-toggle\s*\{[^}]*min-width:\s*32px[^}]*\}/s);
    expect(HUD_SOURCE).toMatch(/\.compact-toggle\s*\{[^}]*min-height:\s*32px[^}]*\}/s);
  });

  it('compact-toggle uses `text-transform: uppercase` matching the HUD icon-cluster style', () => {
    // The story Dev Notes — "Style the ⋯ button matching the existing
    // top-right HUD icon cluster (size, color tokens)". Asserts the
    // CSS-source-level style integration.
    expect(HUD_SOURCE).toMatch(/\.compact-toggle\s*\{[^}]*text-transform:\s*uppercase[^}]*\}/s);
  });

  it('compact-toggle uses `--v-color-divider` border + `--v-color-fg-quiet` colour', () => {
    expect(HUD_SOURCE).toMatch(/\.compact-toggle\s*\{[^}]*border:[^;}]*var\(--v-color-divider\)[^}]*\}/s);
    expect(HUD_SOURCE).toMatch(/\.compact-toggle\s*\{[^}]*color:\s*var\(--v-color-fg-quiet\)[^}]*\}/s);
  });

  it('compact-toggle has `:focus-visible` styles for keyboard accessibility', () => {
    expect(HUD_SOURCE).toMatch(/\.compact-toggle:focus-visible\s*\{[^}]*outline:[^}]*\}/s);
  });
});

describe('Story 6.2 narrow-viewport defense — toggle button stability across widths', () => {
  // Vitest can't actually resize happy-dom's viewport; we exercise the
  // controllable surface — `narrowViewport` reactive property — at
  // multiple widths by setting it directly. Each iteration confirms
  // the toggle is rendered when narrow and absent when wide, with the
  // top-right corner intact.
  const widths = [768, 800, 1023, 1024];

  for (const width of widths) {
    const isNarrow = width < 1024;
    it(`viewport ${width}px (narrow=${isNarrow}) preserves top-right cluster topology`, async () => {
      const el = document.createElement('v-hud') as VHud;
      document.body.appendChild(el);
      await el.updateComplete;
      el.narrowViewport = isNarrow;
      await el.updateComplete;

      const corner = el.shadowRoot!.querySelector('.corner.top-right');
      expect(corner, `top-right corner missing at ${width}px`).not.toBeNull();

      // Date readout is always present.
      expect(corner!.querySelector('v-hud-date')).not.toBeNull();

      const toggle = corner!.querySelector('.compact-toggle');
      if (isNarrow) {
        expect(toggle, `compact toggle missing at narrow ${width}px`).not.toBeNull();
      } else {
        expect(toggle, `compact toggle should be absent at wide ${width}px`).toBeNull();
      }
    });
  }
});

describe('Story 6.2 narrow-viewport defense — Esc + H behaviour at narrow viewports', () => {
  it('H dismisses the HUD at narrow viewport (parity with wide)', async () => {
    const el = await mountHudNarrow();
    expect(el.dismissed).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    await el.updateComplete;
    expect(el.dismissed).toBe(true);
  });

  it('toggling expand state while dismissed: state persists on restore', async () => {
    const el = await mountHudNarrow();
    el.expandedAtNarrow = true;
    await el.updateComplete;
    // Dismiss.
    el.dismissed = true;
    await el.updateComplete;
    expect(el.expandedAtNarrow).toBe(true); // preserved
    // Restore.
    el.dismissed = false;
    await el.updateComplete;
    expect(el.expandedAtNarrow).toBe(true); // still preserved
  });
});
