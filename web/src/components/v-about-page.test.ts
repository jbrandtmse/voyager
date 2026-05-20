// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';

import { VAboutPage } from './v-about-page';
import { VAttributionPanel } from './v-attribution-panel';

const mount = async (): Promise<VAboutPage> => {
  const el = document.createElement('v-about-page') as VAboutPage;
  document.body.appendChild(el);
  await el.updateComplete;
  // The embedded <v-attribution-panel> also has to settle before we can
  // assert on its rendered dl.
  const panel = el.querySelector('v-attribution-panel');
  if (panel instanceof VAttributionPanel) {
    await panel.updateComplete;
  }
  return el;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Story 2.7 — <v-about-page> registration', () => {
  it('is registered as the custom element <v-about-page>', () => {
    expect(customElements.get('v-about-page')).toBe(VAboutPage);
  });

  it('uses Light DOM (createRenderRoot returns the host)', async () => {
    const el = await mount();
    expect(el.shadowRoot).toBeNull();
    // Renders content directly onto the host element.
    expect(el.querySelector('article.v-about-page')).not.toBeNull();
  });
});

describe('Story 2.7 AC2 — canonical section order', () => {
  it('renders a single <h1> "Voyager — About"', async () => {
    const el = await mount();
    const h1s = el.querySelectorAll('h1');
    expect(h1s.length).toBe(1);
    expect((h1s[0]!.textContent ?? '').trim()).toBe('Voyager — About');
  });

  it('renders exactly 6 <h2> sections in the canonical order', async () => {
    const el = await mount();
    const h2s = Array.from(el.querySelectorAll('h2')).map((h) =>
      (h.textContent ?? '').trim(),
    );
    expect(h2s).toEqual([
      'About the project',
      'Data sources',
      'Validation',
      'Attribution',
      'Embed contract',
      'Methodology',
    ]);
  });

  it('h2 sections appear in document order matching AC2', async () => {
    const el = await mount();
    const headings = Array.from(el.querySelectorAll('h1, h2'));
    // The first node must be <h1>, followed by 6 <h2>s — exactly 7 headings.
    expect(headings.length).toBe(7);
    expect(headings[0]!.tagName).toBe('H1');
    for (let i = 1; i < headings.length; i++) {
      expect(headings[i]!.tagName).toBe('H2');
    }
  });

  it('heading hierarchy never skips a level (AC5)', async () => {
    const el = await mount();
    // No <h3> through <h6> outside an <h2>-anchored section; no <h4> without
    // a preceding <h3>. We don't currently emit h3s; assert that contract.
    const skipLevels = el.querySelectorAll('h4, h5, h6');
    expect(skipLevels.length).toBe(0);
  });
});

describe('Story 2.7 AC2 — "About the project" prose', () => {
  it('renders editorial prose paragraphs under the section heading', async () => {
    const el = await mount();
    const section = el.querySelector('section[aria-labelledby="about-project"]');
    expect(section).not.toBeNull();
    const paragraphs = section!.querySelectorAll('p');
    // Multiple short paragraphs are preferred over one long block.
    expect(paragraphs.length).toBeGreaterThanOrEqual(2);
  });

  it('about-project prose is roughly 200 words (range 150–280 accommodates editorial revisions)', async () => {
    const el = await mount();
    const section = el.querySelector('section[aria-labelledby="about-project"]')!;
    const text = (section.textContent ?? '').trim();
    const wordCount = text
      .split(/\s+/u)
      .filter((w) => w.length > 0).length;
    expect(wordCount).toBeGreaterThan(150);
    expect(wordCount).toBeLessThan(280);
  });
});

describe('Story 2.7 AC2 — Data sources table semantics', () => {
  it('renders a <table> with <caption>, <thead>, and <tbody>', async () => {
    const el = await mount();
    const section = el.querySelector(
      'section[aria-labelledby="about-data-sources"]',
    )!;
    const table = section.querySelector('table');
    expect(table).not.toBeNull();
    expect(table!.querySelector('caption')).not.toBeNull();
    expect(table!.querySelector('thead')).not.toBeNull();
    expect(table!.querySelector('tbody')).not.toBeNull();
  });

  it('thead uses <th scope="col"> for column headers (AC5)', async () => {
    const el = await mount();
    const section = el.querySelector(
      'section[aria-labelledby="about-data-sources"]',
    )!;
    const cols = section.querySelectorAll('thead th[scope="col"]');
    expect(cols.length).toBeGreaterThanOrEqual(2);
  });

  it('renders exactly 7 data-source rows (AC2)', async () => {
    const el = await mount();
    const section = el.querySelector(
      'section[aria-labelledby="about-data-sources"]',
    )!;
    const rows = section.querySelectorAll('tbody tr');
    expect(rows.length).toBe(7);
  });
});

describe('Story 2.7 AC2 — Validation table semantics + values', () => {
  it('renders exactly 3 tolerance rows (AC2)', async () => {
    const el = await mount();
    const section = el.querySelector(
      'section[aria-labelledby="about-validation"]',
    )!;
    const rows = section.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
  });

  it('includes the canonical trajectory / attitude / FPS tolerances (AC2)', async () => {
    const el = await mount();
    const section = el.querySelector(
      'section[aria-labelledby="about-validation"]',
    )!;
    const text = section.textContent ?? '';
    expect(text).toContain('20 km');
    expect(text).toContain('5 km');
    expect(text).toContain('1 mrad');
    expect(text).toContain('60 FPS');
  });

  it('thead has <th scope="col"> for column headers', async () => {
    const el = await mount();
    const section = el.querySelector(
      'section[aria-labelledby="about-validation"]',
    )!;
    const cols = section.querySelectorAll('thead th[scope="col"]');
    expect(cols.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Story 2.7 AC2 + AC3 — Attribution section + embedded panel', () => {
  it('embeds <v-attribution-panel> inside the Attribution section', async () => {
    const el = await mount();
    const section = el.querySelector(
      'section[aria-labelledby="about-attribution"]',
    )!;
    expect(section.querySelector('v-attribution-panel')).not.toBeNull();
  });

  it('attribution panel exposes the #attribution deep-link anchor', async () => {
    const el = await mount();
    const anchor = el.querySelector('#attribution');
    expect(anchor).not.toBeNull();
    // Must be the <dl> from the panel, not some duplicate.
    expect(anchor!.tagName).toBe('DL');
  });
});

describe('Story 2.7 AC2 — Embed contract + Methodology sections', () => {
  it('embed-contract section documents ?embed=true and links to url-contract.md', async () => {
    const el = await mount();
    const section = el.querySelector(
      'section[aria-labelledby="about-embed-contract"]',
    )!;
    const text = section.textContent ?? '';
    expect(text).toContain('?embed=true');
    expect(text).toContain('url-contract.md');
  });

  it('embed-contract section names every ADR-0001 frozen slug', async () => {
    const el = await mount();
    const section = el.querySelector(
      'section[aria-labelledby="about-embed-contract"]',
    )!;
    const text = section.textContent ?? '';
    const slugs = [
      'launch-v1',
      'launch-v2',
      'v1-jupiter',
      'v2-jupiter',
      'v1-saturn',
      'v2-saturn',
      'v2-uranus',
      'v2-neptune',
      'pale-blue-dot',
      'v1-heliopause',
      'v2-heliopause',
    ];
    for (const slug of slugs) {
      expect(text, `missing slug "${slug}" in embed-contract copy`).toContain(
        slug,
      );
    }
  });

  it('methodology section is present with editorial copy', async () => {
    const el = await mount();
    const section = el.querySelector(
      'section[aria-labelledby="about-methodology"]',
    )!;
    expect(section.querySelectorAll('p').length).toBeGreaterThanOrEqual(1);
  });
});
