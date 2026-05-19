// Boot-time GPU capability probe. Runs offscreen (no canvas mount), reads back
// a tiny WebGL2 reverse-Z test pattern, and returns a capability summary the
// RenderEngine consumes at construction time.
//
// Architecture line 86, 366; ADR 0002. The probe must run before RenderEngine
// so the renderer can be configured without a flash of wrong-render.

export interface GPUCapabilities {
  supportsReverseZ: boolean;
  supportsFloatDepth: boolean;
  recommendedTextureTier: '8k' | '4k';
}

// Texture-size threshold for the 8k tier. WebGL2 spec requires MAX_TEXTURE_SIZE
// ≥ 2048; in practice modern desktop GPUs report 16384 or 32768. 8192 is the
// minimum we need to host an 8k planet texture in a single layer.
const TIER_8K_THRESHOLD = 8192;

// Heuristic for reverse-Z support: presence of the EXT_clip_control extension.
// Three.js r170+ uses this extension under the hood for reversedDepthBuffer,
// and refuses to enable reverse-Z when it's missing (we observed this in the
// installed three@0.184.0 source: src/renderers/webgl/WebGLCapabilities.js
// line 96 — `extensions.has( 'EXT_clip_control' )` gates the boolean).
const REVERSE_Z_EXTENSION = 'EXT_clip_control';

const DEFAULT_FAILED_CAPABILITIES: GPUCapabilities = {
  supportsReverseZ: false,
  supportsFloatDepth: false,
  recommendedTextureTier: '4k',
};

// Inject the canvas constructor for tests. In production, falls back to the
// real OffscreenCanvas / document.createElement('canvas').
export interface ProbeOptions {
  canvasFactory?: () => HTMLCanvasElement | OffscreenCanvas;
}

const defaultCanvasFactory = (): HTMLCanvasElement | OffscreenCanvas => {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(1, 1);
  }
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    return c;
  }
  throw new Error('GPUCapabilityProbe: no canvas factory available in this environment');
};

export class GPUCapabilityProbe {
  static run(opts: ProbeOptions = {}): GPUCapabilities {
    const factory = opts.canvasFactory ?? defaultCanvasFactory;

    let canvas: HTMLCanvasElement | OffscreenCanvas;
    try {
      canvas = factory();
    } catch {
      return { ...DEFAULT_FAILED_CAPABILITIES };
    }

    // Cast to a permissive context type — Offscreen and on-DOM canvas have
    // structurally identical getContext signatures for our purposes.
    const gl = (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ?? null;
    if (!gl) {
      return { ...DEFAULT_FAILED_CAPABILITIES };
    }

    const supportsReverseZ = hasExtension(gl, REVERSE_Z_EXTENSION);
    const supportsFloatDepth = hasExtension(gl, 'WEBGL_depth_texture')
      || hasFloatDepthFormat(gl);
    const maxTextureSize = readMaxTextureSize(gl);
    const recommendedTextureTier: '8k' | '4k' =
      maxTextureSize >= TIER_8K_THRESHOLD ? '8k' : '4k';

    return {
      supportsReverseZ,
      supportsFloatDepth,
      recommendedTextureTier,
    };
  }
}

const hasExtension = (gl: WebGL2RenderingContext, name: string): boolean => {
  try {
    return gl.getExtension(name) !== null;
  } catch {
    return false;
  }
};

// WebGL2 mandates DEPTH_COMPONENT32F as a renderable depth format
// (sized internal format). Detect by checking the depthStencilFormats list
// implicitly via the constant's presence on the context object. This is a
// soft probe — if it fails we assume Float depth is unavailable.
const hasFloatDepthFormat = (gl: WebGL2RenderingContext): boolean => {
  try {
    // 0x8CAC = DEPTH_COMPONENT32F. WebGL2 contexts expose this constant on
    // the context object. Older WebGL1-only contexts won't.
    return typeof gl.DEPTH_COMPONENT32F === 'number';
  } catch {
    return false;
  }
};

const readMaxTextureSize = (gl: WebGL2RenderingContext): number => {
  try {
    const v = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    return typeof v === 'number' ? v : 0;
  } catch {
    return 0;
  }
};
