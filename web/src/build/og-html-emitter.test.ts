/**
 * Story 2.6 AC2 — per-chapter HTML meta tag emission.
 *
 * The pure templating layer that the Vite plugin in vite.config.ts wraps
 * at build time. Tests here verify the meta-tag shape, escape discipline,
 * placeholder substitution, and the </head>-fallback injection path.
 */

import { describe, it, expect } from 'vitest';
import {
  CANONICAL_ORIGIN,
  OG_META_PLACEHOLDER,
  renderOgMetaBlock,
  renderHomeOgMetaBlock,
  renderChapterHtml,
  injectOgMeta,
} from './og-html-emitter';
import { buildOgManifest, indexManifestBySlug } from './og-cards';
import { ALL_CHAPTERS, findChapterBySlug } from '../chapters/registry';

const v2Neptune = findChapterBySlug('v2-neptune')!;
const manifest = buildOgManifest();
const manifestIdx = indexManifestBySlug(manifest);
const v2NeptuneEntry = manifestIdx.get('v2-neptune')!;

describe('renderOgMetaBlock — required tags (AC2)', () => {
  it('emits og:title with chapter name + " — Voyager" suffix', () => {
    const block = renderOgMetaBlock(v2Neptune, v2NeptuneEntry);
    expect(block).toContain(
      `<meta property="og:title" content="Voyager 2 — Neptune — Voyager" />`,
    );
  });

  it('emits og:description with chapter ogDescription verbatim', () => {
    const block = renderOgMetaBlock(v2Neptune, v2NeptuneEntry);
    expect(block).toContain(
      `<meta property="og:description" content="${v2Neptune.ogDescription}" />`,
    );
  });

  it('emits og:image as absolute URL on canonical origin', () => {
    const block = renderOgMetaBlock(v2Neptune, v2NeptuneEntry);
    expect(block).toMatch(
      new RegExp(
        `<meta property="og:image" content="${CANONICAL_ORIGIN}/og/v2-neptune\\.[0-9a-f]{8}\\.png" />`,
      ),
    );
  });

  it('emits og:url as canonical chapter URL', () => {
    const block = renderOgMetaBlock(v2Neptune, v2NeptuneEntry);
    expect(block).toContain(
      `<meta property="og:url" content="${CANONICAL_ORIGIN}/c/v2-neptune" />`,
    );
  });

  it('emits og:type = website', () => {
    const block = renderOgMetaBlock(v2Neptune, v2NeptuneEntry);
    expect(block).toContain(`<meta property="og:type" content="website" />`);
  });
});

describe('renderOgMetaBlock — Twitter Card tags (AC2)', () => {
  it('emits twitter:card = summary_large_image', () => {
    const block = renderOgMetaBlock(v2Neptune, v2NeptuneEntry);
    expect(block).toContain(
      `<meta name="twitter:card" content="summary_large_image" />`,
    );
  });

  it('twitter:title matches og:title', () => {
    const block = renderOgMetaBlock(v2Neptune, v2NeptuneEntry);
    expect(block).toContain(
      `<meta name="twitter:title" content="Voyager 2 — Neptune — Voyager" />`,
    );
  });

  it('twitter:description matches og:description', () => {
    const block = renderOgMetaBlock(v2Neptune, v2NeptuneEntry);
    expect(block).toContain(
      `<meta name="twitter:description" content="${v2Neptune.ogDescription}" />`,
    );
  });

  it('twitter:image matches og:image', () => {
    const block = renderOgMetaBlock(v2Neptune, v2NeptuneEntry);
    const ogMatch = block.match(
      /<meta property="og:image" content="([^"]+)"/,
    );
    const twMatch = block.match(
      /<meta name="twitter:image" content="([^"]+)"/,
    );
    expect(ogMatch).not.toBeNull();
    expect(twMatch).not.toBeNull();
    expect(twMatch?.[1]).toBe(ogMatch?.[1]);
  });
});

describe('renderOgMetaBlock — attribute escape discipline', () => {
  it('escapes & < > " in chapter name', () => {
    const malicious = {
      ...v2Neptune,
      name: 'Naughty <Chapter> & "Friends"',
      ogDescription: 'Mostly OK.',
    };
    const malEntry = {
      ...v2NeptuneEntry,
      title: `${malicious.name} — Voyager`,
    };
    const block = renderOgMetaBlock(malicious, malEntry);
    expect(block).toContain(
      `Naughty &lt;Chapter&gt; &amp; &quot;Friends&quot; — Voyager`,
    );
    expect(block).not.toContain('Naughty <Chapter>');
    expect(block).not.toContain('"Friends"');
  });

  it('does not inject raw quotes into description attribute', () => {
    const c = { ...v2Neptune, ogDescription: 'A "quoted" sentence.' };
    const entry = { ...v2NeptuneEntry, description: c.ogDescription };
    const block = renderOgMetaBlock(c, entry);
    expect(block).toContain('A &quot;quoted&quot; sentence.');
    expect(block).not.toContain('"quoted"');
  });
});

describe('renderOgMetaBlock — origin override', () => {
  it('respects opts.origin for image + canonical URLs', () => {
    const block = renderOgMetaBlock(v2Neptune, v2NeptuneEntry, {
      origin: 'https://staging.example.com',
    });
    expect(block).toContain(
      `<meta property="og:url" content="https://staging.example.com/c/v2-neptune" />`,
    );
    expect(block).toContain(`https://staging.example.com/og/v2-neptune.`);
    expect(block).not.toContain(CANONICAL_ORIGIN);
  });
});

describe('renderHomeOgMetaBlock (AC2 homepage default)', () => {
  it('renders a complete meta block with og:url pointing at /', () => {
    const block = renderHomeOgMetaBlock('/og/v2-neptune.deadbeef.png');
    expect(block).toContain(
      `<meta property="og:url" content="${CANONICAL_ORIGIN}/" />`,
    );
  });

  it('uses the provided default image path verbatim', () => {
    const block = renderHomeOgMetaBlock('/og/launch-v2.cafef00d.png');
    expect(block).toContain(
      `<meta property="og:image" content="${CANONICAL_ORIGIN}/og/launch-v2.cafef00d.png" />`,
    );
  });

  it('includes all 9 expected meta tags (4 og + og:type + 4 twitter)', () => {
    const block = renderHomeOgMetaBlock('/og/v2-neptune.deadbeef.png');
    const tagCount = (block.match(/<meta\s+/g) ?? []).length;
    expect(tagCount).toBe(9);
  });

  it('respects opts.origin override', () => {
    const block = renderHomeOgMetaBlock('/og/x.deadbeef.png', {
      origin: 'https://local.test',
    });
    expect(block).toContain(`https://local.test/`);
    expect(block).not.toContain(CANONICAL_ORIGIN);
  });
});

describe('injectOgMeta — placeholder substitution', () => {
  it('replaces OG_META_PLACEHOLDER when present', () => {
    const input = `<html><head>${OG_META_PLACEHOLDER}</head><body></body></html>`;
    const out = injectOgMeta(input, '<meta property="x" content="y" />');
    expect(out).toContain('<meta property="x" content="y" />');
    expect(out).not.toContain(OG_META_PLACEHOLDER);
  });

  it('falls back to inserting before </head> when no placeholder', () => {
    const input = `<html><head><title>X</title></head><body></body></html>`;
    const out = injectOgMeta(input, '<meta property="x" content="y" />');
    const headCloseIdx = out.indexOf('</head>');
    const tagIdx = out.indexOf('<meta property="x"');
    expect(tagIdx).toBeGreaterThan(0);
    expect(tagIdx).toBeLessThan(headCloseIdx);
  });

  it('is case-insensitive on </HEAD> fallback', () => {
    const input = `<HTML><HEAD></HEAD></HTML>`;
    const out = injectOgMeta(input, '<meta x />');
    expect(out).toContain('<meta x />');
  });

  it('returns input unchanged when neither marker is found', () => {
    const input = `not-html-at-all`;
    const out = injectOgMeta(input, '<meta x />');
    expect(out).toBe(input);
  });
});

describe('renderChapterHtml — per-chapter HTML shell (AC2)', () => {
  const rootHtml = `<!doctype html>
<html lang="en">
  <head>
    <title>Voyager</title>
    ${OG_META_PLACEHOLDER}
  </head>
  <body><div id="app"></div></body>
</html>`;

  it('produces a per-chapter HTML with the chapter meta block injected', () => {
    const html = renderChapterHtml(rootHtml, v2Neptune, v2NeptuneEntry);
    expect(html).toContain(`og:url" content="${CANONICAL_ORIGIN}/c/v2-neptune"`);
    expect(html).toContain('og:type" content="website"');
    expect(html).not.toContain(OG_META_PLACEHOLDER);
  });

  it('preserves the rest of the document byte-for-byte', () => {
    const html = renderChapterHtml(rootHtml, v2Neptune, v2NeptuneEntry);
    expect(html).toContain('<title>Voyager</title>');
    expect(html).toContain('<div id="app"></div>');
    expect(html).toContain('<!doctype html>');
  });
});

describe('per-chapter HTML round-trip across all 11 chapters', () => {
  const rootHtml = `<!doctype html><html><head>${OG_META_PLACEHOLDER}</head><body></body></html>`;
  for (const chapter of ALL_CHAPTERS) {
    const entry = manifestIdx.get(chapter.slug)!;
    it(`emits valid meta tags for chapter ${chapter.slug}`, () => {
      const html = renderChapterHtml(rootHtml, chapter, entry);
      expect(html).toContain(`og:url" content="${CANONICAL_ORIGIN}/c/${chapter.slug}"`);
      expect(html).toContain(`og:title" content="${chapter.name} — Voyager"`);
      expect(html).toContain(`og:description" content="${chapter.ogDescription}"`);
      expect(html).toMatch(
        new RegExp(`og:image" content="${CANONICAL_ORIGIN}/og/${chapter.slug}\\.[0-9a-f]{8}\\.png"`),
      );
    });
  }
});
