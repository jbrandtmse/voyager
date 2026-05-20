import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '..');

function readJSON(relativePath: string): Record<string, unknown> {
  const raw = readFileSync(resolve(repoRoot, relativePath), 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

function readText(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf-8');
}

describe('Story 1.1 / AC2 — web scaffold static config', () => {
  describe('tsconfig.json', () => {
    const tsconfigRaw = readText('tsconfig.json');
    const tsconfig = JSON.parse(
      tsconfigRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''),
    ) as { compilerOptions?: Record<string, unknown> };

    it('enables strict mode (AC2)', () => {
      expect(tsconfig.compilerOptions?.strict).toBe(true);
    });
  });

  describe('package.json', () => {
    const pkg = readJSON('package.json') as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

    it.each([
      'three',
      '@types/three',
      'vitest',
      '@playwright/test',
      'eslint',
      'prettier',
    ])('declares required dep %s (AC2)', (name) => {
      expect(allDeps[name]).toBeDefined();
    });

    it('declares a test script that runs vitest', () => {
      expect(pkg.scripts?.test).toBeDefined();
      expect(pkg.scripts?.test).toMatch(/vitest/);
    });

    const forbiddenFrameworks = [
      'react',
      'react-dom',
      'preact',
      'vue',
      'svelte',
      'rxjs',
      'mobx',
      'redux',
      '@reduxjs/toolkit',
      'zustand',
      'jotai',
      'lodash',
      'lodash-es',
      'ramda',
      'immer',
    ];

    it.each(forbiddenFrameworks)(
      'does not depend on forbidden package %s (architecture: vanilla-ts only)',
      (name) => {
        expect(allDeps[name]).toBeUndefined();
      },
    );
  });

  describe('package-lock.json', () => {
    const lockRaw = readText('package-lock.json');
    const lockJson = JSON.parse(lockRaw) as {
      packages?: Record<string, unknown>;
    };
    const installedKeys = Object.keys(lockJson.packages ?? {});
    const installedPackageNames = installedKeys
      .map((key) => {
        if (!key.startsWith('node_modules/')) return null;
        const rest = key.slice('node_modules/'.length);
        const segments = rest.split('/');
        if (segments[0].startsWith('@')) {
          return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : segments[0];
        }
        return segments[0];
      })
      .filter((n): n is string => n !== null);

    const forbiddenLockPackagePaths = [
      'node_modules/react',
      'node_modules/react-dom',
      'node_modules/preact',
      'node_modules/vue',
      'node_modules/svelte',
      'node_modules/rxjs',
      'node_modules/mobx',
      'node_modules/redux',
      'node_modules/@reduxjs/toolkit',
      'node_modules/zustand',
      'node_modules/jotai',
      'node_modules/lodash',
      'node_modules/lodash-es',
      'node_modules/ramda',
      'node_modules/immer',
    ];

    it.each(forbiddenLockPackagePaths)(
      'does not contain forbidden installed package %s',
      (lockKey) => {
        expect(lockRaw).not.toContain(`"${lockKey}":`);
      },
    );

    // The lodash family ships per-function packages (lodash.merge, lodash.debounce, lodash.get, ...).
    // A blanket regex catches the whole sub-namespace without enumerating every one.
    it('does not transitively install any lodash sub-package (lodash.* / lodash-es / lodash-*)', () => {
      const lodashFamily = installedPackageNames.filter((n) =>
        /^lodash(\.|-)/.test(n) || n === 'lodash' || n === 'lodash-es',
      );
      expect(
        lodashFamily,
        `Forbidden lodash family packages installed transitively: ${lodashFamily.join(', ')}. ` +
          `The architecture forbids lodash and all its sub-packages — use native JS/TS or write the helper.`,
      ).toEqual([]);
    });
  });
});
