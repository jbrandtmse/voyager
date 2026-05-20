/**
 * heliopause-copy.ts — hand-written chapter prose for V1H / V2H (Story 2.9).
 *
 * Per ADR-0021, chapter copy lives in TypeScript template literals — not in
 * external Markdown files. The strings here are consumed by
 * `<v-chapter-copy>` when the simulation enters the V1 / V2 heliopause
 * windows (FR29 / FR30 text-card content).
 *
 * Each block is ~80–120 words of editorial prose describing the cosmic-ray
 * spike and solar-wind drop signatures that mark the boundary crossing.
 * The "V1 heliopause." / "V2 heliopause." lede is structural — the
 * component renders it as an `<h2>` heading; the body follows in `<p>`
 * paragraphs.
 *
 * The scientific content is sourced from the same NASA/JPL announcements +
 * peer-reviewed publications cited in `MISSION_FACTS.md` (Krimigis et al.
 * 2013 / Gurnett et al. 2013 for V1; Stone et al. 2019 for V2). The copy
 * is editorial framing, not direct quotation.
 */

export interface HeliopauseCopy {
  /** Heading lede, e.g. "V1 heliopause." */
  readonly lede: string;
  /** Body paragraphs (already plain text, no Markdown). */
  readonly paragraphs: readonly string[];
}

export const V1_HELIOPAUSE_COPY: HeliopauseCopy = Object.freeze({
  lede: 'V1 heliopause.',
  paragraphs: Object.freeze([
    "On 25 August 2012, Voyager 1's instruments record the bass note. The cosmic-ray detector climbs to a level it has not seen since launch — galactic particles, until now thinned by the Sun's outbound solar wind, now reach the spacecraft unfiltered. Across the same days, the plasma-wave instrument hears the density of the medium itself jump upward by a factor of forty. The solar wind has stopped. The interstellar medium has begun.",
    "Voyager 1 is now the first human-made object to leave the heliosphere. There is no fanfare, no horizon to cross — only the slow, instrumented certainty that the Sun's wind has thinned to nothing and a denser, colder medium has taken its place. The spacecraft continues outward, still in radio contact, still listening.",
  ]),
});

export const V2_HELIOPAUSE_COPY: HeliopauseCopy = Object.freeze({
  lede: 'V2 heliopause.',
  paragraphs: Object.freeze([
    "On 5 November 2018, Voyager 2 reaches the same threshold its twin crossed six years earlier — but this time, the Plasma Science instrument is still operating. The signature is unambiguous: the solar wind drops to undetectable levels within hours, the magnetic field rotates into alignment with the local interstellar field, and the cosmic-ray counts step up to the same plateau Voyager 1 already inhabits.",
    "Two probes, on different trajectories, separated by years and billions of kilometres, agree on where the heliopause is. The Sun's bubble has a measurable edge. Voyager 2 has crossed it. Both spacecraft now drift in the medium between the stars, their bass notes locked at interstellar baseline.",
  ]),
});

/**
 * Lookup the copy block for a chapter slug. Returns `null` for any slug
 * other than `v1-heliopause` / `v2-heliopause` — `<v-chapter-copy>` treats
 * null as "this chapter does not have copy in this story" (Epic 4 will
 * extend the lookup for encounter chapters).
 */
export const heliopauseCopyForSlug = (slug: string): HeliopauseCopy | null => {
  if (slug === 'v1-heliopause') return V1_HELIOPAUSE_COPY;
  if (slug === 'v2-heliopause') return V2_HELIOPAUSE_COPY;
  return null;
};
