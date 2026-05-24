import { LitElement, html, type TemplateResult } from 'lit';

import './v-attribution-panel';

/**
 * `<v-about-page>` — Story 2.7 AC1 + AC2 editorial surface.
 *
 * The `/about` route mounts this component as its sole content (no canvas,
 * HUD, scrubber, or chapter index). The layout is a single column,
 * `max-width: 60ch`, centred horizontally with generous vertical spacing.
 *
 * ## Light DOM
 *
 * Per Story 2.7 Dev Notes the page renders in Light DOM (createRenderRoot
 * returns `this`) so the global token sheet — Source Serif 4 body, Inter
 * headings, JetBrains Mono for inline code — inherits directly. The
 * BaseElement Shadow DOM reset is intentionally NOT used here: editorial
 * typography is a document-level concern, not a component-shadow concern.
 *
 * ## Section order (AC2)
 *
 * 1. h1 — "Voyager — About"
 * 2. h2 — "About the project" (~200 words of editorial prose)
 * 3. h2 — "Data sources" (7-row table)
 * 4. h2 — "Validation" (3-row tolerance table)
 * 5. h2 — "Attribution" (embedded `<v-attribution-panel>`; id="attribution")
 * 6. h2 — "Embed contract"
 * 7. h2 — "Methodology"
 *
 * Each table carries `<caption>`, `<thead>` + `<th scope="col">` to satisfy
 * AC5's a11y-compliant-HTML requirement. axe-core verification is deferred
 * to Story 6.4 per Story 2.5 deferral.
 *
 * ## Anchors
 *
 * The Attribution section is wrapped by an `<v-attribution-panel>` whose
 * inner `<dl id="attribution">` is the deep-link target for the homepage
 * footer link (`/about#attribution`).
 */
export class VAboutPage extends LitElement {
  /** Lit Light DOM idiom (ADR-0013) — render onto the host element itself. */
  override createRenderRoot(): HTMLElement {
    return this;
  }

  override render(): TemplateResult {
    return html`
      <article class="v-about-page">
        <h1>Voyager — About</h1>

        <section aria-labelledby="about-project">
          <h2 id="about-project">About the project</h2>
          ${this.renderAboutProject()}
        </section>

        <section aria-labelledby="about-data-sources">
          <h2 id="about-data-sources">Data sources</h2>
          ${this.renderDataSourcesTable()}
        </section>

        <section aria-labelledby="about-validation">
          <h2 id="about-validation">Validation</h2>
          ${this.renderValidationTable()}
        </section>

        <section aria-labelledby="about-attribution">
          <h2 id="about-attribution">Attribution</h2>
          <v-attribution-panel></v-attribution-panel>
        </section>

        <section aria-labelledby="about-embed-contract">
          <h2 id="about-embed-contract">Embed contract</h2>
          ${this.renderEmbedContract()}
        </section>

        <section aria-labelledby="about-methodology">
          <h2 id="about-methodology">Methodology</h2>
          ${this.renderMethodology()}
        </section>
      </article>
    `;
  }

  private renderAboutProject(): TemplateResult {
    return html`
      <p>
        Voyager is a browser-native, time-anchored visualisation of the two
        Voyager spacecraft and the gas-giant flybys that turned them from
        engineering probes into instruments of public wonder. Every
        position, every encounter, every Pale Blue Dot frame is sourced
        from NASA's NAIF SPICE kernels and the PDS Rings Node attitude
        products. Nothing on the screen is invented for effect.
      </p>
      <p>
        The point of this project is not animation. It is provenance. When
        the simulation places Voyager 2 above Neptune's cloud tops at
        25 August 1989 09:23 UTC, that timestamp lines up with the kernel
        ephemeris to the second. When the heading badge says
        <em>synthesized cruise attitude</em>, it means there is no CK
        kernel for that window and the displayed orientation is an honest
        engineering reconstruction. Where data is missing, we say so —
        scientific honesty is the register, not the caveat.
      </p>
      <p>
        Use the scrubber to step through 53 years of mission time, jump to
        any of the eleven canonical chapters via the index, or deep-link a
        precise instant through the URL. The experience is keyboard- and
        screen-reader-accessible by design; the embed mode strips the
        chrome so institutional pages can frame the simulation directly.
      </p>
    `;
  }

  private renderDataSourcesTable(): TemplateResult {
    return html`
      <table>
        <caption>
          Voyager data sources used by the simulation (7 entries).
        </caption>
        <thead>
          <tr>
            <th scope="col">Source</th>
            <th scope="col">Product</th>
            <th scope="col">Use</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">NAIF SPICE kernels</th>
            <td>SPK trajectory + CK attitude</td>
            <td>Spacecraft positions across the full mission window</td>
          </tr>
          <tr>
            <th scope="row">PDS Rings Node</th>
            <td>Voyager CK attitude products</td>
            <td>Reconstructed scan-platform pointing during encounters</td>
          </tr>
          <tr>
            <th scope="row">NASA 3D Resources</th>
            <td>Voyager spacecraft mesh</td>
            <td>Articulated bus + scan platform GLB asset</td>
          </tr>
          <tr>
            <th scope="row">USGS Astrogeology</th>
            <td>Planetary base maps</td>
            <td>Global texture coverage for the visited bodies</td>
          </tr>
          <tr>
            <th scope="row">Björn Jónsson planetary textures</th>
            <td>High-resolution planet maps</td>
            <td>Surface detail at the encounter scenes</td>
          </tr>
          <tr>
            <th scope="row">NASA Photojournal</th>
            <td>Pale Blue Dot composite plates</td>
            <td>Source frames for the PBD chapter</td>
          </tr>
          <tr>
            <th scope="row">Voyager Golden Record</th>
            <td>NASA mission audio</td>
            <td>Audio surface (wired in Story 6.1)</td>
          </tr>
        </tbody>
      </table>
    `;
  }

  private renderValidationTable(): TemplateResult {
    return html`
      <table>
        <caption>
          Validation tolerances enforced by the bake pipeline and the
          runtime perf budget.
        </caption>
        <thead>
          <tr>
            <th scope="col">Domain</th>
            <th scope="col">Tolerance</th>
            <th scope="col">Source</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Trajectory error</th>
            <td>
              <code>max ≤ 20 km</code> · <code>RMS ≤ 5 km</code> vs SPICE
            </td>
            <td>L1 Python harness over the full mission window</td>
          </tr>
          <tr>
            <th scope="row">Attitude error</th>
            <td><code>≤ 1 mrad</code> vs CK kernel</td>
            <td>L2 attitude consistency check (Epic 3)</td>
          </tr>
          <tr>
            <th scope="row">Frame rate</th>
            <td><code>≥ 60 FPS</code> on a mid-range laptop</td>
            <td>Per-frame budget (NFR-P1)</td>
          </tr>
        </tbody>
      </table>
    `;
  }

  private renderEmbedContract(): TemplateResult {
    return html`
      <p>
        Voyager supports a chrome-less embed mode for institutional and
        editorial pages. Append <code>?embed=true</code> to any Voyager URL
        and the simulation renders without the chapter-index toggle,
        attribution footer, or future help overlay — only the canvas, HUD,
        scrubber, play button, and speed multiplier remain.
      </p>
      <p>
        Every URL writeback preserves the parameter, so a kiosk that
        deep-links to <code>/c/v2-neptune?embed=true</code> survives both
        director-driven boundary crossings and browser back/forward
        navigations. The full slug list is frozen by ADR-0001 (see
        <code>docs/url-contract.md</code>) and will not change for the life
        of the project: <code>launch-v1</code>, <code>launch-v2</code>,
        <code>v1-jupiter</code>, <code>v2-jupiter</code>,
        <code>v1-saturn</code>, <code>v2-saturn</code>,
        <code>v2-uranus</code>, <code>v2-neptune</code>,
        <code>pale-blue-dot</code>, <code>v1-heliopause</code>, and
        <code>v2-heliopause</code>.
      </p>
    `;
  }

  private renderMethodology(): TemplateResult {
    return html`
      <p>
        The bake pipeline ingests NAIF SPICE kernels, samples trajectory
        and attitude on a curated cadence, and emits compact binary chunks
        that the browser fetches on demand. Every chunk is checksum-pinned
        in the manifest, so a kernel update is a deliberate act with a
        diff, not a silent regression.
      </p>
      <p>
        The Golden Record audio layer that activates at the launch, Pale
        Blue Dot, and heliopause chapters is <em>diegetic</em>: it is the
        same NASA public-domain recording shipped on the actual
        spacecraft, attached at the chapter markers as an artifact
        reproduction. It is not a narration or voiceover. A spoken
        narration layer is a v1.1 candidate; the current scope keeps the
        Record's own bass-note elegy as the only audio Voyager carries.
      </p>
      <p>
        Source, build pipeline, and validation harness will be published
        when the project goes public. Until then, the technical research
        and architecture documents in this repository's
        <code>_bmad-output/</code> tree are the authoritative reference for
        how the simulation is constructed.
      </p>
    `;
  }
}

if (
  typeof customElements !== 'undefined' &&
  !customElements.get('v-about-page')
) {
  customElements.define('v-about-page', VAboutPage);
}

declare global {
  interface HTMLElementTagNameMap {
    'v-about-page': VAboutPage;
  }
}
