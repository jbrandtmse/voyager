import { html, css, type TemplateResult } from 'lit';

import { BaseElement } from './base-element';
import type { ChapterDirector } from '../services/chapter-director';
import type { ChapterTransitionEvent } from '../types/chapter';

/**
 * `<v-hud-chapter-title>` — top-left HUD chapter title (FR34).
 *
 * Story 1.11 shipped a stub that rendered `<h2 aria-live="polite"></h2>`
 * with no content. Story 4.10 BUG-006 fix (2026-05-23) wires the slot
 * to a `ChapterDirector` so the heading populates with the active
 * chapter's editorial name (e.g. "Voyager 1 — Jupiter") on `held`
 * transitions and clears on `from === 'held'` exits.
 *
 * Mirrors the subscription + seed pattern from `<v-chapter-copy>`
 * (Story 2.9 / 4.5) so the late-mount semantics, idempotency, and
 * disconnect cleanup are identical. Heading stays in the accessibility
 * tree (empty `<h2 aria-live>` during cruise) so AT can advertise the
 * live region before any chapter activates.
 *
 * ## Wiring
 *
 * The host (`first-paint.ts`) sets `chapterDirector` BEFORE the element
 * is appended (or shortly after; the connectedCallback handles both).
 * Multiple assignments unsubscribe the previous director cleanly.
 *
 * ## Subscriber contract
 *
 * - `to === 'held'`        → render `event.chapter.name`.
 * - `from === 'held'`      → clear (if this is the chapter we're showing).
 * - Other transitions are pure intermediates and ignored.
 *
 * Cold-load arrival into a chapter (`/c/v1-jupiter`) is covered by the
 * `seedFromActiveChapter` path called at first wire-up: the director's
 * sync seed (Story 2.1) has already populated `activeChapter`, so we
 * render the name immediately without waiting for the next transition.
 */
export class VHudChapterTitle extends BaseElement {
  static override styles = [
    BaseElement.styles,
    css`
      :host {
        display: block;
        font-family: var(--v-font-sans);
      }

      h2 {
        margin: 0;
        font-size: var(--v-font-size-chapter-title);
        font-weight: 500;
        color: var(--v-color-fg);
        line-height: 1.2;
      }

      /* During cruise the heading carries no text. Reserve the layout
         slot without occupying baseline space so the top-left HUD area
         doesn't reflow when content arrives. */
      h2:empty {
        min-height: 0;
      }
    `,
  ];

  private _chapterDirector: ChapterDirector | null = null;
  private directorUnsub: (() => void) | null = null;
  /** Currently displayed chapter name, or `''` during cruise. */
  private currentName: string = '';
  /** Slug of the chapter whose name is shown (for the `data-slug` attr). */
  private currentSlug: string | null = null;

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
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.directorUnsub !== null) {
      this.directorUnsub();
      this.directorUnsub = null;
    }
  }

  private subscribeToDirector(director: ChapterDirector): void {
    this.directorUnsub = director.subscribe(this.onTransition);
  }

  /**
   * Seed from the director's current `activeChapter` so late-mounts
   * (or cold-load /c/<slug> arrivals where the director's sync seed
   * already fired before this element subscribed) still show the
   * right name without waiting for the next transition.
   */
  private seedFromActiveChapter(director: ChapterDirector): void {
    const active = director.activeChapter;
    if (active === null) {
      this.setName('', null);
      return;
    }
    this.setName(active.name, active.slug);
  }

  private onTransition = (event: ChapterTransitionEvent): void => {
    if (event.to === 'held') {
      this.setName(event.chapter.name, event.chapter.slug);
    } else if (event.from === 'held' && this.currentSlug === event.chapter.slug) {
      // Left the held window — clear the heading (cruise period).
      this.setName('', null);
    }
  };

  private setName(name: string, slug: string | null): void {
    if (this.currentName === name && this.currentSlug === slug) return;
    this.currentName = name;
    this.currentSlug = slug;
    this.requestUpdate();
  }

  /** Test-friendly accessor for the currently displayed chapter name. */
  get displayedName(): string {
    return this.currentName;
  }

  /** Test-friendly accessor for the currently displayed chapter slug. */
  get displayedSlug(): string | null {
    return this.currentSlug;
  }

  override render(): TemplateResult {
    return html`<h2 aria-live="polite" data-slug=${this.currentSlug ?? ''}>${this.currentName}</h2>`;
  }
}

if (
  typeof customElements !== 'undefined' &&
  !customElements.get('v-hud-chapter-title')
) {
  customElements.define('v-hud-chapter-title', VHudChapterTitle);
}

declare global {
  interface HTMLElementTagNameMap {
    'v-hud-chapter-title': VHudChapterTitle;
  }
}
