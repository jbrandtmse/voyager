// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';

import {
  VAttributionPanel,
  ATTRIBUTION_ENTRIES,
} from './v-attribution-panel';

const mount = async (): Promise<VAttributionPanel> => {
  const el = document.createElement('v-attribution-panel') as VAttributionPanel;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Story 2.7 — <v-attribution-panel> registration', () => {
  it('is registered as the custom element <v-attribution-panel>', () => {
    expect(customElements.get('v-attribution-panel')).toBe(VAttributionPanel);
  });

  it('uses Light DOM (createRenderRoot returns the host)', async () => {
    const el = await mount();
    // Light-DOM contract: shadowRoot is null, content lives on the host.
    expect(el.shadowRoot).toBeNull();
    expect(el.querySelector('dl#attribution')).not.toBeNull();
  });
});

describe('Story 2.7 AC3 — semantic <dl> structure', () => {
  it('renders a single <dl> element with id="attribution"', async () => {
    const el = await mount();
    const dls = el.querySelectorAll('dl');
    expect(dls.length).toBe(1);
    expect(dls[0]!.id).toBe('attribution');
  });

  it('produces exactly one <dt>/<dd> pair per attribution entry', async () => {
    const el = await mount();
    const dts = el.querySelectorAll('dl > dt');
    const dds = el.querySelectorAll('dl > dd');
    expect(dts.length).toBe(ATTRIBUTION_ENTRIES.length);
    expect(dds.length).toBe(ATTRIBUTION_ENTRIES.length);
  });

  it('contains all 7 canonical attribution entries from AC3', async () => {
    const el = await mount();
    const names = Array.from(el.querySelectorAll('dl > dt')).map((dt) =>
      (dt.textContent ?? '').trim(),
    );
    expect(names).toEqual([
      'NAIF SPICE kernels',
      'PDS Rings Node CK products',
      'NASA 3D Resources — Voyager spacecraft model',
      'Björn Jónsson planetary textures',
      'USGS Astrogeology — planetary base maps',
      'Voyager Golden Record audio',
      'NASA Planetary Photojournal — Pale Blue Dot composite plates',
    ]);
  });

  it('each <dt> with a URL renders the name inside <a target="_blank" rel="noopener">', async () => {
    const el = await mount();
    const dts = el.querySelectorAll('dl > dt');
    for (let i = 0; i < dts.length; i++) {
      const entry = ATTRIBUTION_ENTRIES[i]!;
      const dt = dts[i]!;
      const a = dt.querySelector('a');
      if (entry.url === null) {
        expect(a).toBeNull();
      } else {
        expect(a).not.toBeNull();
        expect(a!.getAttribute('href')).toBe(entry.url);
        expect(a!.getAttribute('target')).toBe('_blank');
        expect(a!.getAttribute('rel')).toBe('noopener');
      }
    }
  });

  it('each <dd> contains license / usage prose matching the entry description', async () => {
    const el = await mount();
    const dds = el.querySelectorAll('dl > dd');
    for (let i = 0; i < dds.length; i++) {
      const entry = ATTRIBUTION_ENTRIES[i]!;
      expect((dds[i]!.textContent ?? '').trim()).toBe(entry.description);
    }
  });

  it('exposes the canonical NAIF + Björn Jónsson + Photojournal URLs (AC3)', async () => {
    const el = await mount();
    const links = Array.from(el.querySelectorAll('dl > dt a')).map(
      (a) => (a as HTMLAnchorElement).href,
    );
    // happy-dom resolves relative-less hrefs against location.origin; check
    // by inclusion of the canonical host substring.
    const joined = links.join(' ');
    expect(joined).toContain('naif.jpl.nasa.gov');
    expect(joined).toContain('bjj.mmedia.is');
    expect(joined).toContain('photojournal.jpl.nasa.gov');
    expect(joined).toContain('astrogeology.usgs.gov');
  });
});
