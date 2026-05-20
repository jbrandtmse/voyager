/**
 * Story 2.6 AC3 / Epic 2 R4 — defense test for the OG card generator
 * SCRIPT (the runner-side parity assertion).
 *
 * The exhaustive parity test lives in `web/src/build/og-cards.test.ts`
 * — that's where the manifest builder, content hashing, and per-entry
 * shape are covered. This file is the *runner-level* defense: it
 * exercises `emitOgArtifacts` + `verifyOgArtifacts` against a temp
 * directory and verifies the R4 contract end-to-end through the file
 * system.
 *
 * If a future contributor refactors the script to hard-code a parallel
 * chapter list (the exact regression R4 is designed to catch), one of
 * these assertions fires.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { emitOgArtifacts, verifyOgArtifacts } from './og-cards';
import { buildOgManifest, OG_PUBLIC_DIR } from '../src/build/og-cards';
import { ALL_CHAPTERS } from '../src/chapters/registry';

let tmpDistDir: string;

beforeEach(() => {
  tmpDistDir = mkdtempSync(join(tmpdir(), 'voyager-og-test-'));
});

afterEach(() => {
  rmSync(tmpDistDir, { recursive: true, force: true });
});

describe('og-cards script — R4 parity at the filesystem (AC3)', () => {
  it('emitOgArtifacts writes one PNG per chapter to dist/og/', () => {
    emitOgArtifacts(tmpDistDir);
    const ogDir = join(tmpDistDir, OG_PUBLIC_DIR);
    expect(existsSync(ogDir)).toBe(true);
    const manifest = buildOgManifest();
    for (const entry of manifest.entries) {
      const pngPath = join(tmpDistDir, entry.imagePath);
      expect(existsSync(pngPath)).toBe(true);
    }
  });

  it('emitOgArtifacts writes og-manifest.json with all 11 chapters', () => {
    emitOgArtifacts(tmpDistDir);
    const manifestPath = join(tmpDistDir, OG_PUBLIC_DIR, 'og-manifest.json');
    expect(existsSync(manifestPath)).toBe(true);
    const onDisk = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      entries: Array<{ slug: string }>;
    };
    expect(onDisk.entries.length).toBe(ALL_CHAPTERS.length);
    expect(onDisk.entries.length).toBe(11);
  });

  it('manifest slug set on disk === ALL_CHAPTERS slug set (R4 mitigation)', () => {
    emitOgArtifacts(tmpDistDir);
    const manifestPath = join(tmpDistDir, OG_PUBLIC_DIR, 'og-manifest.json');
    const onDisk = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      entries: Array<{ slug: string }>;
    };
    const onDiskSlugs = new Set(onDisk.entries.map((e) => e.slug));
    const registrySlugs = new Set(ALL_CHAPTERS.map((c) => c.slug));
    expect(onDiskSlugs).toEqual(registrySlugs);
  });

  it('placeholder PNG content begins with the PNG signature', () => {
    emitOgArtifacts(tmpDistDir);
    const manifest = buildOgManifest();
    const firstEntry = manifest.entries[0]!;
    const pngBytes = readFileSync(join(tmpDistDir, firstEntry.imagePath));
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let i = 0; i < sig.length; i++) {
      expect(pngBytes[i]).toBe(sig[i]);
    }
  });

  it('verifyOgArtifacts returns true after a fresh emit', () => {
    emitOgArtifacts(tmpDistDir);
    expect(verifyOgArtifacts(tmpDistDir)).toBe(true);
  });

  it('verifyOgArtifacts returns false when the manifest is missing', () => {
    expect(verifyOgArtifacts(tmpDistDir)).toBe(false);
  });

  it('verifyOgArtifacts returns false when a chapter PNG is missing', () => {
    emitOgArtifacts(tmpDistDir);
    const manifest = buildOgManifest();
    const firstPngPath = join(tmpDistDir, manifest.entries[0]!.imagePath);
    rmSync(firstPngPath);
    expect(verifyOgArtifacts(tmpDistDir)).toBe(false);
  });

  it('verifyOgArtifacts returns false when manifest contains an extra slug', () => {
    emitOgArtifacts(tmpDistDir);
    const manifestPath = join(tmpDistDir, OG_PUBLIC_DIR, 'og-manifest.json');
    const onDisk = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      entries: Array<{ slug: string; imagePath: string }>;
    };
    onDisk.entries.push({
      slug: 'ghost-chapter',
      imagePath: '/og/ghost.deadbeef.png',
    });
    writeFileSync(manifestPath, JSON.stringify(onDisk, null, 2));
    expect(verifyOgArtifacts(tmpDistDir)).toBe(false);
  });

  it('verifyOgArtifacts returns false when manifest drops a chapter', () => {
    emitOgArtifacts(tmpDistDir);
    const manifestPath = join(tmpDistDir, OG_PUBLIC_DIR, 'og-manifest.json');
    const onDisk = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      entries: Array<{ slug: string }>;
    };
    onDisk.entries.pop();
    writeFileSync(manifestPath, JSON.stringify(onDisk, null, 2));
    expect(verifyOgArtifacts(tmpDistDir)).toBe(false);
  });
});

describe('og-cards script — per-chapter HTML emission (AC2 file-level)', () => {
  it('emits dist/c/<slug>/index.html when a root index.html exists', () => {
    // Seed a fake root index.html with the OG_META placeholder.
    const rootHtml = `<!doctype html><html><head><title>Voyager</title><!-- OG_META --></head><body></body></html>`;
    writeFileSync(join(tmpDistDir, 'index.html'), rootHtml);

    emitOgArtifacts(tmpDistDir);

    for (const chapter of ALL_CHAPTERS) {
      const path = join(tmpDistDir, 'c', chapter.slug, 'index.html');
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, 'utf8');
      // The per-chapter HTML carries the chapter's slug in og:url.
      expect(content).toContain(`og:url" content="https://voyager.app/c/${chapter.slug}"`);
      expect(content).toContain(`og:title" content="${chapter.name} — Voyager"`);
    }
  });

  it('skips per-chapter HTML emission when no root index.html exists (PNG path still runs)', () => {
    // No index.html in dist — emitOgArtifacts should still emit PNGs +
    // manifest without throwing.
    emitOgArtifacts(tmpDistDir);
    expect(
      existsSync(join(tmpDistDir, OG_PUBLIC_DIR, 'og-manifest.json')),
    ).toBe(true);
    expect(existsSync(join(tmpDistDir, 'c'))).toBe(false);
  });
});

describe('og-cards script — idempotency', () => {
  it('two successive emits produce identical manifests', () => {
    emitOgArtifacts(tmpDistDir);
    const manifestPath = join(tmpDistDir, OG_PUBLIC_DIR, 'og-manifest.json');
    const first = readFileSync(manifestPath, 'utf8');
    emitOgArtifacts(tmpDistDir);
    const second = readFileSync(manifestPath, 'utf8');
    expect(second).toBe(first);
  });

  it('verify passes when run twice in a row', () => {
    emitOgArtifacts(tmpDistDir);
    expect(verifyOgArtifacts(tmpDistDir)).toBe(true);
    expect(verifyOgArtifacts(tmpDistDir)).toBe(true);
  });
});

describe('og-cards script — verify works on disk-only artifacts (CI assertion path)', () => {
  it('verifies a hand-constructed dist/og/ tree that matches ALL_CHAPTERS', () => {
    // Simulate a CI step that doesn't go through emitOgArtifacts but
    // produces the same shape via Vite plugin output. This proves the
    // CI assertion is decoupled from the emitter.
    const manifest = buildOgManifest();
    const ogDir = join(tmpDistDir, OG_PUBLIC_DIR);
    mkdirSync(ogDir, { recursive: true });
    writeFileSync(
      join(ogDir, 'og-manifest.json'),
      JSON.stringify(manifest, null, 2),
    );
    // Drop fake (any-byte) PNG content for each chapter — verifyOgArtifacts
    // only checks existence, not signature.
    for (const entry of manifest.entries) {
      writeFileSync(join(tmpDistDir, entry.imagePath), 'x');
    }
    expect(verifyOgArtifacts(tmpDistDir)).toBe(true);
  });
});
