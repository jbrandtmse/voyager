import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const webRoot = resolve(__dirname, '..');

// Three.js r170+ is required for the native reverse-Z code path used by
// RenderEngine. Three's npm versioning maps directly: 0.184.0 → r184, so any
// 0.x version with x ≥ 170 satisfies the constraint.
//
// Architecture line 64, 355, 366; ADR 0008. The installed three@0.184.0
// (May 2026 snapshot) exposes the `reversedDepthBuffer` constructor parameter
// (src/renderers/webgl/WebGLCapabilities.js line 96), which the renderer
// gates on EXT_clip_control support.

const MIN_MAJOR = 170;

describe('Three.js installed version satisfies r170+ reverse-Z requirement', () => {
  const pkg = JSON.parse(
    readFileSync(resolve(webRoot, 'node_modules/three/package.json'), 'utf-8'),
  ) as { version: string };

  it('three package.json version is parseable as 0.<r>.<patch>', () => {
    expect(pkg.version).toMatch(/^0\.\d+\.\d+/);
  });

  it('three release ≥ r170 (Architecture line 64; ADR 0008)', () => {
    const match = pkg.version.match(/^0\.(\d+)\.\d+/);
    expect(match).not.toBeNull();
    const minor = Number(match![1]);
    expect(minor).toBeGreaterThanOrEqual(MIN_MAJOR);
  });

  it('@types/three is installed alongside three', () => {
    const webPkg = JSON.parse(
      readFileSync(resolve(webRoot, 'package.json'), 'utf-8'),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = { ...(webPkg.dependencies ?? {}), ...(webPkg.devDependencies ?? {}) };
    expect(deps['@types/three']).toBeDefined();
    expect(deps['three']).toBeDefined();
  });
});
