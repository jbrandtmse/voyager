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
