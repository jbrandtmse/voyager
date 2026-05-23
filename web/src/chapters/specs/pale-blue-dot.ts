/**
 * Pale Blue Dot chapter spec — re-export shim (Story 5.1 AC1).
 *
 * Per ADR-0014 (Hybrid Chapter Definition — Spec for 10, Module for PBD),
 * the Pale Blue Dot chapter is a dedicated module rather than a flat
 * declarative spec. The canonical PBD definition lives at
 * `web/src/chapters/pale-blue-dot/` (introduced by Story 5.1). The
 * `ALL_CHAPTERS` registry (`web/src/chapters/registry.ts`) imports
 * from this `specs/` location for parity with the other 10 chapters;
 * this file re-exports the module's `ChapterSpec`-compatible default
 * so the registry-uniformity surface (scrubber-marker, URL-routing,
 * OG-card-generator, `<v-chapter-copy>`, Story 5.0 production smoke)
 * resolves PBD without code change.
 *
 * The slug + anchor ET + window + spacecraft are preserved exactly
 * from the pre-Story-5.1 placeholder so the existing Stories 2.1 /
 * 2.2 / 2.4 / 2.6 / 2.9 / 5.0 wire-ups remain valid. Story 5.1
 * additionally populates `copy` (the 80-120-word PBD prose) on the
 * spec view.
 *
 * Consumers that need the PBD module's imperative behaviour (Story 5.2
 * turn choreography, Story 5.3 photo-plate compositing) import the
 * `PaleBlueDot` class directly from `web/src/chapters/pale-blue-dot/`.
 */

import paleBlueDot from '../pale-blue-dot';

export default paleBlueDot;
