/**
 * `EmbedModeState` — Story 2.5 session-scoped flag for chrome-less mode.
 *
 * The `?embed=true` URL parameter is part of the public URL contract
 * (ADR-0001 / docs/url-contract.md). It enables a kiosk-friendly view
 * where chrome elements (chapter-index toggle, future about/help/
 * methodology links) are NOT mounted into the DOM — only the simulation
 * (canvas + HUD + scrubber + play + speed multiplier) renders.
 *
 * ## Contract
 *
 * - **Strict-boolean parse (NFR-S7)** — only the literal lowercase
 *   `?embed=true` enables embed mode. `1`, `yes`, `TRUE`, `on`, empty,
 *   and any other variant resolve silently to `enabled: false`. No
 *   error UI is surfaced.
 * - **Session-immutable** — the flag is captured once at boot from the
 *   URL and never mutated for the rest of the session. There is no
 *   public setter; even if the user edits `?embed=` in the address bar
 *   after load, the resolved state does not change. This matches the
 *   kiosk-deployment model where the parent shell controls the embed
 *   decision at navigation time.
 *
 * ## Why a class + factory (not a free function)
 *
 * Constructing the singleton at boot (rather than reading the URL on
 * every consumer) keeps the source-of-truth localized: first-paint and
 * any future consumer (HUDPresenter, About link, etc.) read the same
 * instance instead of re-parsing the URL. The class enforces the
 * "constructed once, never mutated" contract through the read-only
 * getter; consumers cannot accidentally toggle it at runtime.
 *
 * ## Architecture note
 *
 * Per ADR-0015 (no global store), this is NOT a singleton that consumers
 * import directly. `main.ts` constructs one `EmbedModeState` from the
 * URL at boot and passes its `.enabled` value through
 * `FirstPaintOptions` to first-paint, which gates the conditional
 * `appendChild` calls. The class itself is just the typed wrapper +
 * parse helper.
 */

/**
 * Parse a URL search-string (e.g. `?embed=true&t=...` or `'?t=...'`) and
 * return `true` only when the `embed` parameter equals the literal
 * lowercase `"true"`. Any other value, including a missing parameter,
 * returns `false`.
 *
 * This is `?embed=` strict-boolean per NFR-S7. The implementation uses
 * `URLSearchParams.get`, which:
 *   - returns `null` when the key is absent,
 *   - returns the verbatim decoded value when present (no case folding,
 *     no trimming).
 *
 * Strict equality against `"true"` therefore rejects every variant the
 * NFR enumerates (`1`, `yes`, `TRUE`, `Yes`, `on`, `True`, the empty
 * string, leading/trailing whitespace forms, etc.).
 */
export const parseEmbedParam = (search: string): boolean => {
  const params = new URLSearchParams(search);
  return params.get('embed') === 'true';
};

/**
 * Immutable session-scoped embed-mode flag. Construct once at boot from
 * `EmbedModeState.fromSearch(window.location.search)` and pass `.enabled`
 * through `FirstPaintOptions.embedEnabled` to first-paint.
 *
 * The `enabled` field is exposed as a read-only getter (no public
 * setter). The constructor is `private`-by-convention: prefer
 * `EmbedModeState.fromSearch(...)` so the parse rule is the single entry
 * point. The constructor is left `public` so tests can construct fixed
 * instances without juggling URL strings.
 */
export class EmbedModeState {
  private readonly _enabled: boolean;

  constructor(enabled: boolean) {
    this._enabled = enabled;
  }

  /** Read-only — captured at boot, never mutated for the session. */
  get enabled(): boolean {
    return this._enabled;
  }

  /**
   * Convenience factory: parse `search` (typically
   * `window.location.search`) and build the corresponding state.
   */
  static fromSearch(search: string): EmbedModeState {
    return new EmbedModeState(parseEmbedParam(search));
  }
}
