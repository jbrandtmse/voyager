import { LitElement, html, type TemplateResult } from 'lit';

/**
 * `<v-attribution-panel>` — Story 2.7 AC3.
 *
 * Renders a semantic `<dl>` definition list naming each third-party data
 * source or asset that Voyager uses, paired with a license / usage
 * statement and (where applicable) a canonical link.
 *
 * ## Light DOM
 *
 * The panel extends `LitElement` directly and overrides `createRenderRoot`
 * to return the host element. This makes the dl/dt/dd live in the document
 * Light DOM so the global editorial typography (Source Serif 4 body, Inter
 * captions) inherits without any per-component style block. The same
 * approach is used by `<v-about-page>`. Per ADR-0013 + ADR-0026 we
 * register via `customElements.define()` (no decorators).
 *
 * ## Anchorability
 *
 * The dl carries `id="attribution"` so the homepage footer link can
 * deep-link via `/about#attribution`. Browser-native fragment scrolling
 * lands the section at the top of the viewport.
 *
 * ## Outbound links
 *
 * Each entry that has a canonical URL wraps the source name in
 * `<a href="..." target="_blank" rel="noopener">`. Opening in a new tab
 * keeps the institutional embedding scenario (kiosk + iframe) usable:
 * the embedder's iframe is never replaced by an outbound navigation.
 */

interface AttributionEntry {
  name: string;
  url: string | null;
  description: string;
}

const ATTRIBUTION_ENTRIES: readonly AttributionEntry[] = [
  {
    name: 'NAIF SPICE kernels',
    url: 'https://naif.jpl.nasa.gov/',
    description:
      'NASA public domain. Trajectory and attitude data (SPK + CK) for both Voyager spacecraft and the planets they visited.',
  },
  {
    name: 'PDS Rings Node CK products',
    url: 'https://pds-rings.seti.org/',
    description:
      'Public domain (SETI Institute, PDS Rings Node). Reconstructed attitude kernels for Voyager 1 and 2, with the Mitch Gordon QMW SEDR credit retained.',
  },
  {
    name: 'NASA 3D Resources — Voyager spacecraft model',
    url: 'https://nasa3d.arc.nasa.gov/',
    description:
      'NASA public domain. Used as the base mesh for both Voyager 1 and Voyager 2 spacecraft, articulated for scan-platform motion.',
  },
  {
    name: 'Björn Jónsson planetary textures',
    url: 'https://bjj.mmedia.is/',
    description:
      'Attribution required. Per-asset license terms documented in THIRD_PARTY.md; used for high-detail planetary surface maps.',
  },
  {
    name: 'USGS Astrogeology — planetary base maps',
    url: 'https://astrogeology.usgs.gov/',
    description:
      'Public domain. Planetary base maps used for global texture coverage.',
  },
  {
    name: 'Voyager Golden Record audio',
    url: 'https://voyager.jpl.nasa.gov/golden-record/',
    description:
      'NASA public domain. Five tracks from the canonical NASA-hosted Voyager Golden Record asset directory (Greetings in English + Arabic for the launches; "Wind, Rain, and Surf", "Life Signs / Pulsar", and "Music of the Spheres" from Sounds of Earth for Pale Blue Dot + heliopause crossings). Diegetic audio layer activated at the chapter markers. Per-track source URLs, license citations, and curation reasoning in THIRD_PARTY.md.',
  },
  {
    name: 'NASA Planetary Photojournal — Pale Blue Dot composite plates',
    url: 'https://photojournal.jpl.nasa.gov/',
    description:
      'NASA / JPL-Caltech public domain. Voyager 1 narrow-angle frames PIA00452 ("The Pale Blue Dot") and PIA00453 ("Solar System Portrait — Views of 6 Planets") from the 1990-02-14 family-portrait imaging sequence. Cropped per body and composited at each substate peak in the Pale Blue Dot scene (Story 5.3).',
  },
];

export class VAttributionPanel extends LitElement {
  /**
   * Lit Light DOM idiom (ADR-0013) — return the host element so the dl/dt/dd
   * live in the document tree and inherit the global token typography.
   */
  override createRenderRoot(): HTMLElement {
    return this;
  }

  override render(): TemplateResult {
    return html`
      <dl id="attribution" class="v-attribution-panel">
        ${ATTRIBUTION_ENTRIES.map((entry) => this.renderEntry(entry))}
      </dl>
    `;
  }

  private renderEntry(entry: AttributionEntry): TemplateResult {
    const nameNode =
      entry.url === null
        ? html`<span>${entry.name}</span>`
        : html`<a href=${entry.url} target="_blank" rel="noopener"
            >${entry.name}</a
          >`;
    return html`
      <dt>${nameNode}</dt>
      <dd>${entry.description}</dd>
    `;
  }
}

if (
  typeof customElements !== 'undefined' &&
  !customElements.get('v-attribution-panel')
) {
  customElements.define('v-attribution-panel', VAttributionPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    'v-attribution-panel': VAttributionPanel;
  }
}

export { ATTRIBUTION_ENTRIES };
export type { AttributionEntry };
