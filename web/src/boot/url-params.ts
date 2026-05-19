// Boot-time URL flag parsing. Centralized so the parsing rules are testable
// in isolation and the rest of the codebase reads a typed object.

export interface UrlParams {
  // ?force-log-depth=1 — manual override; force logarithmic depth even if
  // the GPU probe reports reverse-Z support. For testing the fallback path.
  forceLogDepth: boolean;
  // ?dev=<name> — dev-mode trigger. The only recognized value in this story
  // is "precision" (the AC5 smoke scene); future dev modes can extend.
  devMode: string | null;
}

const DEFAULTS: UrlParams = {
  forceLogDepth: false,
  devMode: null,
};

// Truthy values that flip a flag on. Accepts "1", "true", or empty (?flag=
// is treated as on per common usage).
const TRUTHY = new Set(['1', 'true', '']);

export const getUrlParams = (search?: string): UrlParams => {
  const raw = search ?? (typeof location !== 'undefined' ? location.search : undefined);
  if (raw === undefined) return { ...DEFAULTS };

  const params = new URLSearchParams(raw);
  const forceLogDepthRaw = params.get('force-log-depth');
  return {
    forceLogDepth:
      forceLogDepthRaw !== null && TRUTHY.has(forceLogDepthRaw.toLowerCase()),
    devMode: params.get('dev'),
  };
};
