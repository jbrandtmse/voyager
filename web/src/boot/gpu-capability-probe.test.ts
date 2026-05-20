import { describe, it, expect, vi } from 'vitest';
import { GPUCapabilityProbe } from './gpu-capability-probe';

// Build a minimal WebGL2 context mock supporting just enough surface for the
// probe. Each spec configures the response shape for getExtension/getParameter.
interface MockSpec {
  supportedExtensions: Set<string>;
  maxTextureSize: number;
  hasDepthComponent32F?: boolean;
}

const makeMockCanvas = (spec: MockSpec): HTMLCanvasElement => {
  const gl = {
    MAX_TEXTURE_SIZE: 0x0d33,
    DEPTH_COMPONENT32F: spec.hasDepthComponent32F === false ? undefined : 0x8cac,
    getExtension(name: string) {
      return spec.supportedExtensions.has(name) ? {} : null;
    },
    getParameter(p: number) {
      if (p === 0x0d33) return spec.maxTextureSize;
      return 0;
    },
  };
  const canvas = {
    getContext(type: string) {
      if (type === 'webgl2') return gl;
      return null;
    },
  };
  return canvas as unknown as HTMLCanvasElement;
};

describe('GPUCapabilityProbe.run', () => {
  it('returns supportsReverseZ=true when EXT_clip_control is present', () => {
    const caps = GPUCapabilityProbe.run({
      canvasFactory: () =>
        makeMockCanvas({
          supportedExtensions: new Set(['EXT_clip_control']),
          maxTextureSize: 16384,
        }),
    });
    expect(caps.supportsReverseZ).toBe(true);
  });

  it('returns supportsReverseZ=false when EXT_clip_control is absent', () => {
    const caps = GPUCapabilityProbe.run({
      canvasFactory: () =>
        makeMockCanvas({
          supportedExtensions: new Set(),
          maxTextureSize: 16384,
        }),
    });
    expect(caps.supportsReverseZ).toBe(false);
  });

  it('recommends 8k tier when MAX_TEXTURE_SIZE ≥ 8192', () => {
    const caps = GPUCapabilityProbe.run({
      canvasFactory: () =>
        makeMockCanvas({
          supportedExtensions: new Set(['EXT_clip_control']),
          maxTextureSize: 8192,
        }),
    });
    expect(caps.recommendedTextureTier).toBe('8k');
  });

  it('recommends 4k tier when MAX_TEXTURE_SIZE < 8192', () => {
    const caps = GPUCapabilityProbe.run({
      canvasFactory: () =>
        makeMockCanvas({
          supportedExtensions: new Set(['EXT_clip_control']),
          maxTextureSize: 4096,
        }),
    });
    expect(caps.recommendedTextureTier).toBe('4k');
  });

  it('returns supportsFloatDepth=true when WebGL2 exposes DEPTH_COMPONENT32F', () => {
    const caps = GPUCapabilityProbe.run({
      canvasFactory: () =>
        makeMockCanvas({
          supportedExtensions: new Set(),
          maxTextureSize: 16384,
          hasDepthComponent32F: true,
        }),
    });
    expect(caps.supportsFloatDepth).toBe(true);
  });

  it('returns all-false capabilities when getContext returns null (no WebGL2)', () => {
    const noContextCanvas = {
      getContext() {
        return null;
      },
    } as unknown as HTMLCanvasElement;
    const caps = GPUCapabilityProbe.run({
      canvasFactory: () => noContextCanvas,
    });
    expect(caps.supportsReverseZ).toBe(false);
    expect(caps.supportsFloatDepth).toBe(false);
    expect(caps.recommendedTextureTier).toBe('4k');
  });

  it('handles canvasFactory throwing — returns fallback capabilities, no exception', () => {
    const caps = GPUCapabilityProbe.run({
      canvasFactory: () => {
        throw new Error('no canvas available');
      },
    });
    expect(caps).toEqual({
      supportsReverseZ: false,
      supportsFloatDepth: false,
      recommendedTextureTier: '4k',
    });
  });

  it('handles getExtension throwing — treats as unsupported', () => {
    const throwingCanvas = {
      getContext() {
        return {
          MAX_TEXTURE_SIZE: 0x0d33,
          DEPTH_COMPONENT32F: 0x8cac,
          getExtension() {
            throw new Error('hostile mock');
          },
          getParameter() {
            return 16384;
          },
        };
      },
    } as unknown as HTMLCanvasElement;
    const caps = GPUCapabilityProbe.run({
      canvasFactory: () => throwingCanvas,
    });
    expect(caps.supportsReverseZ).toBe(false);
  });

  it('exposes a callable static GPUCapabilityProbe.run that takes no args (uses defaults)', () => {
    // Default factory needs an environment-specific canvas implementation.
    // In Node-only test env, document and OffscreenCanvas are absent, so the
    // factory throws → fallback capabilities returned. Either way, no exception.
    const caps = GPUCapabilityProbe.run();
    expect(caps).toHaveProperty('supportsReverseZ');
    expect(caps).toHaveProperty('supportsFloatDepth');
    expect(caps).toHaveProperty('recommendedTextureTier');
  });

  it('spy: getExtension is queried for EXT_clip_control', () => {
    const getExtension = vi.fn((name: string) =>
      name === 'EXT_clip_control' ? {} : null,
    );
    const canvas = {
      getContext() {
        return {
          MAX_TEXTURE_SIZE: 0x0d33,
          DEPTH_COMPONENT32F: 0x8cac,
          getExtension,
          getParameter() {
            return 16384;
          },
        };
      },
    } as unknown as HTMLCanvasElement;
    GPUCapabilityProbe.run({ canvasFactory: () => canvas });
    expect(getExtension).toHaveBeenCalledWith('EXT_clip_control');
  });
});
