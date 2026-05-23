/**
 * Chapter type vocabulary (Story 2.1).
 *
 * Source of truth for the data shape consumed by `ChapterDirector`,
 * `ALL_CHAPTERS`, scrubber markers, chapter index, URL routing, and the
 * pre-rendered OG-card generator. ADR-0014 commits to the hybrid form:
 * 10 standard chapters use the `ChapterSpec` shape declared here, while
 * Pale Blue Dot (Epic 5) is authored as a richer module — but its
 * placeholder for Story 2.1 still satisfies `ChapterSpec` so the
 * registry and FSM can treat all 11 uniformly.
 *
 * Module shape: pure types only — no runtime dependencies. Importable
 * from any execution context (Node tests, browser, worker).
 */

/**
 * Which spacecraft the chapter centers on. Used by future stories
 * (scrubber colouring, marker glyph, OG-card framing) to disambiguate
 * V1/V2 encounters. `'both'` reserved for joint moments (e.g. launch
 * sequence cards) — Story 2.1 ships no `'both'` chapters but the type
 * is part of the contract.
 */
export type Spacecraft = 'v1' | 'v2' | 'both';

/**
 * Lifecycle state of a single chapter relative to the current ET cursor.
 *
 *   out ──(et ≥ windowStartEt)──► entering ──(et > windowStartEt)──► held
 *   held ──(et ≥ windowEndEt)──► exiting ──(et > windowEndEt)──► passed
 *
 * Reverse scrubbing traverses the same states in reverse with symmetric
 * subscriber emission. See `ChapterDirector` for the exact transition
 * semantics.
 */
export type ChapterState = 'out' | 'entering' | 'held' | 'exiting' | 'passed';

/**
 * Declarative spec for a single chapter. Authored once under
 * `web/src/chapters/specs/`, registered once in
 * `web/src/chapters/registry.ts`, consumed by every downstream story
 * that touches chapter metadata.
 *
 * The fields are deliberately minimal: anchor (the chapter's "you are
 * here" instant), window (the bounds for the FSM's held state), and
 * presentation hooks (slug, name, markerLabel, spacecraft). Behavioural
 * content (PBD turn choreography, encounter framing) lives in dedicated
 * modules for the chapters that warrant them — ADR-0014.
 */
export interface ChapterSpec {
  /** URL slug, kebab-case. Stable contract (ADR-0001) — never rename without an URL migration. */
  readonly slug: string;
  /** Editorial name shown in chapter index + HUD. */
  readonly name: string;
  /** 2–4 character uppercase monospace label rendered on scrubber vertebrae. */
  readonly markerLabel: string;
  /** Canonical "you are here" ET (SPICE TDB seconds past J2000). */
  readonly anchorEt: number;
  /** Lower bound of the held-state window (inclusive). */
  readonly windowStartEt: number;
  /** Upper bound of the held-state window (inclusive). */
  readonly windowEndEt: number;
  /** Spacecraft the chapter centers on. */
  readonly spacecraft: Spacecraft;
  /**
   * One-sentence chapter summary used as the `og:description` /
   * `twitter:description` meta tag value on the per-chapter HTML shell
   * (Story 2.6 AC2). Plain text — no HTML entities, no quote characters
   * that would break attribute serialisation.
   */
  readonly ogDescription: string;
  /**
   * Story 4.1 AC5 — optional NAIF body ID that this chapter's view-frame
   * blend should center on during the held window. Populated only on the
   * six encounter chapters (V1/V2 × Jupiter/Saturn + V2 × Uranus/Neptune);
   * left `undefined` on cruise / launch / heliopause / Pale Blue Dot
   * chapters, which keep the heliocentric (identity) origin shift.
   *
   * The IDs are NAIF SPK barycenter IDs (Jupiter = 5, Saturn = 6,
   * Uranus = 7, Neptune = 8) — matches the runtime manifest's
   * `bodies[].naifId` convention established by Story 1.13 and used by
   * `BODY_RADII_KM` in `constants/body-radii.ts`. The bake samples
   * planet positions at the barycenter rather than the body itself
   * because the gas-giant moons orbit the barycenter; barycenter ↔
   * body offset is sub-pixel at solar-system zoom.
   *
   * Consumed by `ViewFrameService.getTransform(et, activeChapter)`:
   * `undefined` ⇒ identity (`originOffsetWorld = (0, 0, 0)`); populated
   * ⇒ smoothstep blend over the ±2-day window per ADR-0023.
   */
  readonly targetBody?: number;
  /**
   * Story 4.5 — hand-written editorial chapter copy for encounter chapters.
   *
   * Populated on encounter chapters (V1J first; V2J / V1S / V2S in Story
   * 4.6; V2U / V2N in Story 4.7). Consumed by `<v-chapter-copy>` (Story
   * 2.9) which extends its slug lookup to read this field directly when
   * the active chapter holds. Heliopause chapters keep their copy in
   * `web/src/data/heliopause-copy.ts` (per ADR-0021) for backwards
   * compatibility; the cruise / launch / Pale Blue Dot chapters leave
   * this field `undefined`.
   *
   * The shape mirrors `HeliopauseCopy` (lede + body) but uses a single
   * `body` string rather than an array of paragraphs — encounter copy is
   * a single 80–120 word block per the Epic 4 PRD encounter coverage
   * table. If a future encounter genuinely needs multi-paragraph prose,
   * Story 4.6 / 4.7 can amend the shape per Rule 5.
   */
  readonly copy?: EncounterChapterCopy;
  /**
   * Story 4.5 — chapter-specific default camera framing.
   *
   * Consumed by `VoyagerCameraController` via the `resolveDefaultFraming`
   * closure wired in `main.ts`. When the chapter is held and the closure
   * resolves a non-null framing, the camera positions itself at
   * `target + offsetKm` (target is the active body in shifted-render-
   * space coordinates) and looks at the target with the given world-up.
   * When undefined, the controller falls back to its built-in cruise /
   * encounter default (see `voyager-camera-controller.ts` constants
   * `CRUISE_DEFAULT_DISTANCE_KM` + `DEFAULT_ENCOUNTER_DISTANCE_KM`).
   *
   * Populated for encounter chapters that need a deliberately-framed
   * shot at chapter activation; left undefined on cruise / launch /
   * heliopause / Pale Blue Dot. Story 4.6 / 4.7 populate this for the
   * remaining encounter chapters.
   */
  readonly defaultFraming?: ChapterDefaultFraming;
}

/**
 * Story 4.5 — editorial chapter copy for encounter chapters.
 *
 * `lede` is a short heading rendered as `<h2>` (e.g. "V1 Jupiter.").
 * `body` is the 80–120 word prose block rendered as a single `<p>`.
 *
 * The constraint is enforced by per-chapter unit tests (see
 * `web/src/chapters/specs/v1-jupiter.test.ts`) — the type itself
 * cannot statically enforce a word-count band.
 */
export interface EncounterChapterCopy {
  readonly lede: string;
  readonly body: string;
}

/**
 * Story 4.5 — declarative default-framing shape consumed by the
 * `VoyagerCameraController` chapter-default resolver.
 *
 * - `offsetKm` is the camera position relative to the chapter's target
 *   body in the shifted-render-space frame (post-floating-origin) — i.e.
 *   `camera.position = activeTarget + offsetKm`. Authored as a tuple of
 *   render-space kilometers; the resolver converts to a `THREE.Vector3`.
 * - `upWorld` (optional) overrides the world-up axis used by the
 *   `lookAt` rotation; defaults to `[0, 1, 0]` (J2000 ecliptic-Z aligns
 *   with render-space-Y per the renderer's basis convention).
 * - `fovDeg` is reserved — populating it is a future story; the
 *   Story 4.5 resolver ignores it. Documented here so the shape is
 *   stable across Story 4.6 / 4.7.
 */
export interface ChapterDefaultFraming {
  readonly offsetKm: readonly [number, number, number];
  readonly upWorld?: readonly [number, number, number];
  readonly fovDeg?: number;
}

/**
 * Event payload emitted by `ChapterDirector.subscribe`. Fired exactly
 * once per state transition (both forward and reverse), never per
 * frame. Per-frame consumers should read `activeChapter` directly.
 */
export interface ChapterTransitionEvent {
  readonly chapter: ChapterSpec;
  readonly from: ChapterState;
  readonly to: ChapterState;
  readonly et: number;
}
