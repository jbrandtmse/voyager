/**
 * Canonical IAU radii for the Sun, eight planets, and Earth's Moon (Story 1.13).
 *
 * Keyed by NAIF SPK ID. The planet IDs here are the planet-barycenter IDs
 * (1..8) because the bake (Story 1.13 AC1) queries the barycenters rather
 * than the planet-itself IDs (199, 299, 399, ..., 899). The barycenter and
 * the planet-itself centre coincide to within ~one rendered pixel at
 * solar-system zoom, so reusing the barycenter ID for the radius lookup is
 * the cheapest correct answer.
 *
 * Values are the IAU 2015 working-group reported mean radii where they
 * differ from the gas giants' equatorial radius — Saturn's quoted radius
 * is the equatorial 1-bar value (60,268 km is the official IAU mean
 * radius; the story locks 58,232 km which is the volumetric mean radius
 * used by NASA fact sheets, so we adopt that for visual-rendering parity
 * with NASA-provided textures). The Sun's radius is the IAU 2015
 * Resolution B3 nominal solar radius of 695,700 km.
 *
 * @see _bmad-output/implementation-artifacts/1-13-celestial-bodies-sun-eight-planets-and-one-moon.md#AC2
 */

/**
 * IAU radii in kilometres, keyed by NAIF SPK ID. Lookup by NAIF body ID
 * yields the sphere radius used for the rendered THREE.Mesh.
 */
export const BODY_RADII_KM: Readonly<Record<number, number>> = Object.freeze({
  10: 695_700, // Sun
  1: 2_439.7, // Mercury (barycenter)
  2: 6_051.8, // Venus (barycenter)
  3: 6_371, // Earth (Earth-Moon barycenter; planet centre)
  4: 3_389.5, // Mars (barycenter)
  5: 69_911, // Jupiter (barycenter)
  6: 58_232, // Saturn (barycenter; volumetric mean radius)
  7: 25_362, // Uranus (barycenter)
  8: 24_622, // Neptune (barycenter)
  301: 1_737.4, // Moon
});

/** NAIF ID for the Sun. */
export const SUN_NAIF_ID = 10;
/** NAIF ID for Earth's Moon. */
export const MOON_NAIF_ID = 301;

/**
 * The ten celestial bodies rendered by Story 1.13's CelestialBodies module,
 * in the same canonical order as `bake/src/bake_trajectories.py` —
 * Sun first, planets in heliocentric distance order, Moon last.
 */
export const CELESTIAL_BODY_NAIF_IDS: readonly number[] = Object.freeze([
  10, // Sun
  1, // Mercury
  2, // Venus
  3, // Earth
  4, // Mars
  5, // Jupiter
  6, // Saturn
  7, // Uranus
  8, // Neptune
  301, // Moon
]);

/**
 * Texture slug for each celestial body. The slug maps 1:1 to a filename:
 * `web/public/textures/<slug>-<tier>.png`. The Sun has no real texture
 * — its slug is reserved for future use (Story 4.3) and the runtime never
 * issues a fetch for it (Sun uses a synthesized emissive material).
 */
export const BODY_TEXTURE_SLUGS: Readonly<Record<number, string>> = Object.freeze({
  10: 'sun',
  1: 'mercury',
  2: 'venus',
  3: 'earth',
  4: 'mars',
  5: 'jupiter',
  6: 'saturn',
  7: 'uranus',
  8: 'neptune',
  301: 'moon',
});

/**
 * Display names for each body. Used by debug overlays and the `?perf=fps`
 * readout's body-count line.
 */
export const BODY_DISPLAY_NAMES: Readonly<Record<number, string>> = Object.freeze({
  10: 'Sun',
  1: 'Mercury',
  2: 'Venus',
  3: 'Earth',
  4: 'Mars',
  5: 'Jupiter',
  6: 'Saturn',
  7: 'Uranus',
  8: 'Neptune',
  301: 'Moon',
});
