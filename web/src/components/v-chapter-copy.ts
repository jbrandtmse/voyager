import { LitElement, html, nothing, type TemplateResult } from 'lit';

import { heliopauseCopyForSlug } from '../data/heliopause-copy';
import type {
  ChapterDirector,
} from '../services/chapter-director';
import type { ChapterSpec, ChapterTransitionEvent } from '../types/chapter';

/**
 * Normalised editorial copy shape — both heliopause (Story 2.9) and
 * encounter chapters (Story 4.5+) render through the same `<h2>` + `<p>`
 * skeleton. Heliopause copy carries a `paragraphs` array; encounter copy
 * carries a single `body` string which we wrap in a one-element array
 * for rendering uniformity.
 */
interface ChapterCopyBlock {
  readonly lede: string;
  readonly paragraphs: readonly string[];
}

/**
 * Story 4.5 AC5 — resolve an editorial copy block for a chapter, covering
 * both the heliopause copy module (Story 2.9, slug-keyed lookup) and the
 * Story 4.5+ encounter-chapter copy carried on `ChapterSpec.copy`.
 *
 * Returns `null` for chapters without copy (cruise / launch / PBD /
 * non-tuned encounters); the component clears the panel for null
 * results, matching the Story 2.9 behavior.
 */
const copyForChapter = (chapter: ChapterSpec): ChapterCopyBlock | null => {
  // Heliopause chapters keep their copy in heliopause-copy.ts per
  // ADR-0021 (the Story 2.9 source-of-truth) — preserve that wire-up so
  // existing test expectations + slug-based lookups continue to work.
  const heliopauseCopy = heliopauseCopyForSlug(chapter.slug);
  if (heliopauseCopy !== null) {
    return heliopauseCopy;
  }
  // Story 4.5 — encounter chapters carry their copy on the spec itself
  // (a single `body` string). Wrap in a one-element paragraphs array to
  // share the render path with heliopause copy.
  if (chapter.copy !== undefined) {
    return Object.freeze({
      lede: chapter.copy.lede,
      paragraphs: Object.freeze([chapter.copy.body]),
    });
  }
  return null;
};

/**
 * `<v-chapter-copy>` — minimal right-side text-card panel (Story 2.9 +
 * Story 4.5 encounter-chapter extension).
 *
 * Subscribes to a `ChapterDirector` and renders the chapter's editorial copy
 * (lede + body paragraphs) while the chapter is in `held` state. Story 2.9
 * shipped heliopause-only handling via the slug-keyed `heliopauseCopyForSlug`
 * lookup; Story 4.5 extends the lookup to also read `ChapterSpec.copy` for
 * encounter chapters (V1J first; V2J / V1S / V2S in Story 4.6; V2U / V2N in
 * Story 4.7). Pale Blue Dot remains out — Epic 5 introduces its own copy
 * shape.
 *
 * ## Light DOM
 *
 * Per ADR-0013 (Lit 3, no decorators) and the editorial-typography pattern
 * established by `<v-about-page>`: this component renders into Light DOM
 * (`createRenderRoot` returns `this`) so global serif body typography
 * inherits from `tokens.css` without per-component duplication. Scoping is
 * handled by the `.v-chapter-copy` CSS class authored in `chapter-copy.css`
 * — kept out of the component for the same editorial-pattern reason.
 *
 * ## Reduced motion
 *
 * The fade-in / fade-out is governed by the central `--v-duration-base`
 * token. Under `prefers-reduced-motion: reduce`, `global.css` collapses
 * that token to `0ms`, so the copy appears as an instant cut. The
 * component does NOT define its own `@media (prefers-reduced-motion)`
 * rules — that would re-introduce the per-component override pattern
 * Story 1.7 explicitly rejects.
 *
 * ## Wiring
 *
 * The host (`first-paint.ts`) sets `chapterDirector` BEFORE the element is
 * appended to the DOM. `connectedCallback` registers the subscription
 * lazily so test mounts that wire the director after mount still work.
 *
 * ## Subscriber contract
 *
 * Listens for `to === 'held'` transitions on the v1-heliopause /
 * v2-heliopause chapters → renders the corresponding copy block.
 * Listens for `from === 'held'` transitions (the chapter exits) → clears
 * the panel.
 *
 * Subscribers that don't recognise the chapter slug (e.g. an encounter
 * chapter) are ignored without throwing — Epic 4 will register additional
 * handlers via the same lookup pattern.
 */
/**
 * Story 6.2 AC4 — bottom-sheet drawer state for narrow viewports
 * (< 1024 px). Three discrete states cover the user's intent:
 *
 *   - 'collapsed': only the lede (chapter title sentence) is shown
 *     (1 line tall).
 *   - 'partial':   lede + 2 lines of body — the AC4-mandated default
 *     for narrow-viewport entries (lede + 2 body lines ≈ 3 lines
 *     total). User can drag UP for more, DOWN for less.
 *   - 'full':      drawer covers the bottom 2/3 of the viewport.
 *
 * Kept as a string union (not an enum) to mirror the substate-string
 * pattern from `<v-timeline-scrubber>` / `ChapterDirector`.
 */
export type ChapterCopyDrawerState = 'collapsed' | 'partial' | 'full';

/**
 * Story 6.2 AC4 — narrow-viewport breakpoint matching Story 1.7's
 * tablet breakpoint (`max-width: 1023px`). Re-declared here as the
 * media-query string consumed by `matchMedia` so the component does
 * not silently fork the project's structural breakpoint set.
 */
const NARROW_MEDIA_QUERY = '(max-width: 1023px)';

export class VChapterCopy extends LitElement {
  /** Lit Light DOM idiom — render onto the host element itself. */
  override createRenderRoot(): HTMLElement {
    return this;
  }

  static override properties = {
    /**
     * Story 6.2 AC4 — true when the viewport is narrow enough to
     * switch from right-side panel to bottom-sheet drawer layout
     * (matches `(max-width: 1023px)`). Reflected to `data-narrow` so
     * the chapter-copy CSS can apply the bottom-sheet positioning.
     * Rule 10 — declare-only + ctor-body initialised.
     */
    narrowViewport: { type: Boolean, reflect: true, attribute: 'data-narrow' },
    /**
     * Story 6.2 AC4 — drawer state at narrow viewports. Reflected as
     * `data-drawer="collapsed|partial|full"` so the CSS can size the
     * drawer accordingly. Initial value is 'partial' (the AC's
     * "default" state: lede + 2 lines).
     */
    drawerState: {
      type: String,
      reflect: true,
      attribute: 'data-drawer',
    },
  };

  declare narrowViewport: boolean;
  declare drawerState: ChapterCopyDrawerState;

  private _chapterDirector: ChapterDirector | null = null;
  private directorUnsub: (() => void) | null = null;
  private mediaQueryList: MediaQueryList | null = null;
  private mediaListener: ((e: MediaQueryListEvent) => void) | null = null;

  /**
   * Currently displayed copy block, or null when no chapter is `held`.
   * Kept as a state field so external tests can assert on it directly,
   * and so the render() pure-function pattern stays simple.
   */
  private currentCopy: ChapterCopyBlock | null = null;
  /** Slug of the chapter whose copy is shown (for the data-slug attribute). */
  private currentSlug: string | null = null;

  constructor() {
    super();
    this.narrowViewport = false;
    this.drawerState = 'partial';
  }

  get chapterDirector(): ChapterDirector | null {
    return this._chapterDirector;
  }
  set chapterDirector(value: ChapterDirector | null) {
    if (value === this._chapterDirector) return;
    if (this.directorUnsub !== null) {
      this.directorUnsub();
      this.directorUnsub = null;
    }
    this._chapterDirector = value;
    if (this.isConnected && value !== null) {
      this.subscribeToDirector(value);
      this.seedFromActiveChapter(value);
    }
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this._chapterDirector !== null && this.directorUnsub === null) {
      this.subscribeToDirector(this._chapterDirector);
      this.seedFromActiveChapter(this._chapterDirector);
    }
    // Story 6.2 AC4 — wire matchMedia for narrow-viewport detection.
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.mediaQueryList = window.matchMedia(NARROW_MEDIA_QUERY);
      this.narrowViewport = this.mediaQueryList.matches;
      this.mediaListener = (e: MediaQueryListEvent): void => {
        this.narrowViewport = e.matches;
      };
      if (typeof this.mediaQueryList.addEventListener === 'function') {
        this.mediaQueryList.addEventListener('change', this.mediaListener);
      } else if (
        typeof (this.mediaQueryList as unknown as {
          addListener?: (l: (e: MediaQueryListEvent) => void) => void;
        }).addListener === 'function'
      ) {
        (this.mediaQueryList as unknown as {
          addListener: (l: (e: MediaQueryListEvent) => void) => void;
        }).addListener(this.mediaListener);
      }
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.directorUnsub !== null) {
      this.directorUnsub();
      this.directorUnsub = null;
    }
    if (this.mediaQueryList !== null && this.mediaListener !== null) {
      if (typeof this.mediaQueryList.removeEventListener === 'function') {
        this.mediaQueryList.removeEventListener('change', this.mediaListener);
      } else if (
        typeof (this.mediaQueryList as unknown as {
          removeListener?: (l: (e: MediaQueryListEvent) => void) => void;
        }).removeListener === 'function'
      ) {
        (this.mediaQueryList as unknown as {
          removeListener: (l: (e: MediaQueryListEvent) => void) => void;
        }).removeListener(this.mediaListener);
      }
      this.mediaQueryList = null;
      this.mediaListener = null;
    }
  }

  /**
   * Story 6.2 AC4 — public API for keyboard / pointer drivers to cycle
   * the drawer state. The state machine:
   *
   *   collapsed → partial → full → collapsed → ...
   *
   * Used by the grab-handle's Enter keystroke (Subtask 3.4).
   */
  cycleDrawerState(): void {
    if (this.drawerState === 'collapsed') this.drawerState = 'partial';
    else if (this.drawerState === 'partial') this.drawerState = 'full';
    else this.drawerState = 'collapsed';
  }

  /**
   * Story 6.2 AC4 — step the drawer "up" (partial → full or collapsed →
   * partial); a no-op when already 'full'.
   */
  expandDrawer(): void {
    if (this.drawerState === 'collapsed') this.drawerState = 'partial';
    else if (this.drawerState === 'partial') this.drawerState = 'full';
  }

  /**
   * Story 6.2 AC4 — step the drawer "down" (full → partial or partial →
   * collapsed); a no-op when already 'collapsed'.
   */
  collapseDrawer(): void {
    if (this.drawerState === 'full') this.drawerState = 'partial';
    else if (this.drawerState === 'partial') this.drawerState = 'collapsed';
  }

  /** Story 6.2 AC4 — keyboard handler for the grab-handle button. */
  private onGrabHandleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.expandDrawer();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.collapseDrawer();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Toggle between partial and full per Subtask 3.4.
      this.drawerState = this.drawerState === 'full' ? 'partial' : 'full';
    }
  };

  /** Story 6.2 AC4 — click handler for the grab-handle. */
  private onGrabHandleClick = (): void => {
    this.cycleDrawerState();
  };

  private subscribeToDirector(director: ChapterDirector): void {
    this.directorUnsub = director.subscribe(this.onTransition);
  }

  /**
   * Seed from the director's current `activeChapter` so a late-mount (e.g.
   * mounting `<v-chapter-copy>` after the simulation has already entered a
   * heliopause window) still shows the right copy without waiting for the
   * next transition.
   */
  private seedFromActiveChapter(director: ChapterDirector): void {
    const active = director.activeChapter;
    if (active === null) {
      this.clearCopy();
      return;
    }
    const copy = copyForChapter(active);
    if (copy !== null) {
      this.setCopy(active.slug, copy);
    } else {
      this.clearCopy();
    }
  }

  private onTransition = (event: ChapterTransitionEvent): void => {
    const copy = copyForChapter(event.chapter);
    if (copy === null) return; // Not a chapter this story handles
    if (event.to === 'held') {
      this.setCopy(event.chapter.slug, copy);
    } else if (event.from === 'held') {
      // Leaving the held window in either direction (exiting forward or
      // entering reverse) — clear the panel. The narrowest correct check is
      // `from === 'held'` because that's the only transition that always
      // means "we just left the held state."
      if (this.currentSlug === event.chapter.slug) {
        this.clearCopy();
      }
    }
  };

  private setCopy(slug: string, copy: ChapterCopyBlock): void {
    this.currentSlug = slug;
    this.currentCopy = copy;
    this.requestUpdate();
  }

  private clearCopy(): void {
    if (this.currentCopy === null && this.currentSlug === null) return;
    this.currentSlug = null;
    this.currentCopy = null;
    this.requestUpdate();
  }

  /** Test-friendly accessor for the currently-displayed slug. */
  get displayedSlug(): string | null {
    return this.currentSlug;
  }

  override render(): TemplateResult | typeof nothing {
    const copy = this.currentCopy;
    // Story 6.2 AC4 — grab-handle rendered for narrow viewports only.
    // The handle is a focusable button so keyboard users can adjust the
    // drawer state via Enter / ArrowUp / ArrowDown.
    const grabHandle = this.narrowViewport
      ? html`<button
          type="button"
          class="v-chapter-copy-drawer-handle"
          aria-label="Adjust chapter detail drawer"
          aria-expanded=${this.drawerState === 'full' ? 'true' : 'false'}
          @click=${this.onGrabHandleClick}
          @keydown=${this.onGrabHandleKeyDown}
        >
          <span aria-hidden="true" class="v-chapter-copy-drawer-grip"></span>
        </button>`
      : null;
    if (copy === null) {
      // Render an empty article so the DOM node is stable (eases CSS fade-
      // in/out targeting) but contains no editorial content. Hidden via the
      // `data-active` attribute selector in chapter-copy.css.
      return html`<article
        class="v-chapter-copy"
        data-active="false"
        aria-hidden="true"
      ></article>`;
    }
    return html`
      <article
        class="v-chapter-copy"
        data-active="true"
        data-slug=${this.currentSlug ?? ''}
        aria-live="polite"
      >
        ${grabHandle}
        <h2 class="v-chapter-copy-lede">${copy.lede}</h2>
        ${copy.paragraphs.map(
          (p) => html`<p class="v-chapter-copy-paragraph">${p}</p>`,
        )}
      </article>
    `;
  }
}

if (
  typeof customElements !== 'undefined' &&
  !customElements.get('v-chapter-copy')
) {
  customElements.define('v-chapter-copy', VChapterCopy);
}

declare global {
  interface HTMLElementTagNameMap {
    'v-chapter-copy': VChapterCopy;
  }
}
