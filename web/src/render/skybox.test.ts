import { describe, it, expect } from 'vitest';
import {
  Mesh,
  SphereGeometry,
  MeshBasicMaterial,
  BackSide,
  Texture,
} from 'three';

import { Skybox, SKYBOX_RADIUS_KM } from './skybox';
import type { TextureLoaderService } from '../services/texture-loader';
import { FAR_PLANE_KM } from './constants';

const makeFakeLoader = (
  skyboxResult: 'success' | 'reject' = 'success',
): TextureLoaderService => {
  return {
    loadBody() {
      return null;
    },
    loadSkybox() {
      if (skyboxResult === 'reject') return Promise.reject(new Error('synthetic'));
      return Promise.resolve(new Texture());
    },
    prefetchAll() {
      return Promise.resolve([]);
    },
    isCached() {
      return false;
    },
  } as unknown as TextureLoaderService;
};

describe('Story 1.13 — Skybox construction', () => {
  it('builds one back-side Mesh sphere at SKYBOX_RADIUS_KM', () => {
    const sky = new Skybox();
    expect(sky.mesh).toBeInstanceOf(Mesh);
    const geom = sky.mesh.geometry as SphereGeometry;
    expect(geom.parameters.radius).toBe(SKYBOX_RADIUS_KM);
  });

  it('material is MeshBasicMaterial with BackSide (camera sees interior)', () => {
    const sky = new Skybox();
    expect(sky.material).toBeInstanceOf(MeshBasicMaterial);
    expect(sky.material.side).toBe(BackSide);
  });

  it('skybox radius sits just inside the far clip plane', () => {
    expect(SKYBOX_RADIUS_KM).toBeLessThan(FAR_PLANE_KM);
    expect(SKYBOX_RADIUS_KM).toBeGreaterThan(FAR_PLANE_KM * 0.5);
  });

  it('skybox root group is named "Skybox"', () => {
    const sky = new Skybox();
    expect(sky.root.name).toBe('Skybox');
  });

  it('hasTexture is false until the texture lands', () => {
    const sky = new Skybox();
    expect(sky.hasTexture).toBe(false);
  });
});

describe('Story 1.13 — Skybox texture loading', () => {
  it('issues loadSkybox when a TextureLoaderService is supplied', async () => {
    const fake = makeFakeLoader('success');
    const sky = new Skybox({ textureLoader: fake });
    // Flush microtasks.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(sky.hasTexture).toBe(true);
    expect(sky.material.map).toBeInstanceOf(Texture);
  });

  it('renders the fallback colour swap when texture lands', async () => {
    const fake = makeFakeLoader('success');
    const sky = new Skybox({ textureLoader: fake });
    expect(sky.material.color.getHex()).not.toBe(0xffffff); // fallback grey
    await Promise.resolve();
    await Promise.resolve();
    expect(sky.material.color.getHex()).toBe(0xffffff); // post-texture white tint
  });

  it('tolerates a rejected texture promise without throwing (warn only)', async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      const fake = makeFakeLoader('reject');
      const sky = new Skybox({ textureLoader: fake });
      await Promise.resolve();
      await Promise.resolve();
      // hasTexture remains false — but no throw.
      expect(sky.hasTexture).toBe(false);
    } finally {
      console.warn = warn;
    }
  });
});
