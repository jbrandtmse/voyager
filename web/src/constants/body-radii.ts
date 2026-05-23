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
 *
 * Story 4.3 T4.5 extension: the 12 outer-system moons that Voyager 1 / 2
 * imaged (Galilean × 4, Saturn × 3, Uranus × 5, Neptune × 1) are added
 * here so the encounter-chapter `CelestialBodies.add/removeMoon` path can
 * resolve them by NAIF ID. Radii are NASA fact-sheet mean radii — see
 * `MISSION_FACTS.md § Moon physical properties` for the per-moon citation
 * sources (Galileo / Voyager / Cassini / IAU 2015 working group).
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
  // === Story 4.3 T4.5 — outer-system moon mean radii (km) =================
  // Sources: NASA fact sheets via `nssdc.gsfc.nasa.gov/planetary/factsheet/`
  // — for example Galileon moons are at
  // `https://nssdc.gsfc.nasa.gov/planetary/factsheet/joviansatfact.html`.
  // Cited per-moon in `MISSION_FACTS.md § Moon physical properties`.
  501: 1_821.6, // Io (Jupiter I)
  502: 1_560.8, // Europa (Jupiter II)
  503: 2_634.1, // Ganymede (Jupiter III) — largest moon in the solar system
  504: 2_410.3, // Callisto (Jupiter IV)
  606: 2_574.7, // Titan (Saturn VI) — larger than Mercury
  607: 135.0, // Hyperion (Saturn VII) — chaotic rotation; mean of 360×266×205 ellipsoid (~135 km)
  608: 734.5, // Iapetus (Saturn VIII)
  701: 578.9, // Ariel (Uranus I)
  702: 584.7, // Umbriel (Uranus II)
  703: 788.9, // Titania (Uranus III) — largest Uranian moon
  704: 761.4, // Oberon (Uranus IV)
  705: 235.8, // Miranda (Uranus V) — smallest of the five major Uranian moons
  801: 1_353.4, // Triton (Neptune I) — only large retrograde moon in the solar system
});

/** NAIF ID for the Sun. */
export const SUN_NAIF_ID = 10;
/** NAIF ID for Earth's Moon. */
export const MOON_NAIF_ID = 301;

/**
 * The ten celestial bodies rendered by Story 1.13's CelestialBodies module,
 * in the same canonical order as `bake/src/bake_trajectories.py` —
 * Sun first, planets in heliocentric distance order, Moon last.
 *
 * These are the CRUISE-time always-rendered bodies. The 12 outer-system
 * moons (Story 4.3 T5) are NOT in this list — they are loaded lazily on
 * encounter-window entry via the `MOON_NAIF_IDS` constant + the
 * `CelestialBodies.addMoon`/`removeMoon` path wired to MissionPhaseFSM's
 * `soiEntered`/`soiExited` events.
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
 * `web/public/textures/<slug>-<tier>.<ext>`. The Sun has no real texture
 * (synthesized emissive). Hyperion (NAIF 607) is INTENTIONALLY OMITTED
 * because no public-domain equirectangular map exists for it — see the
 * comment on `MOON_NAIF_IDS` below + THIRD_PARTY.md `§ Moon equirectangular
 * maps (Story 4.3 T4.5)`. Callers that look up `BODY_TEXTURE_SLUGS[607]`
 * receive `undefined`; the texture loader returns null synchronously and
 * the fallback grey-sphere material is used.
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
  // === Story 4.3 T4.5 — outer-system moon texture slugs ====================
  // All 2K KTX2 (Basis UASTC); see `web/scripts/build_textures.ts` for the
  // build pipeline + THIRD_PARTY.md `§ Moon equirectangular maps (Story 4.3
  // T4.5)` for attribution. Hyperion (607) is INTENTIONALLY OMITTED (no
  // public-domain equirectangular map exists; runtime falls through to a
  // grey-sphere placeholder).
  501: 'io',
  502: 'europa',
  503: 'ganymede',
  504: 'callisto',
  606: 'titan',
  // 607: hyperion — DELIBERATELY OMITTED (no PD map; see MOON_NAIF_IDS doc).
  608: 'iapetus',
  701: 'ariel',
  702: 'umbriel',
  703: 'titania',
  704: 'oberon',
  705: 'miranda',
  801: 'triton',
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
  // === Story 4.3 T4.5 — outer-system moon display names ====================
  501: 'Io',
  502: 'Europa',
  503: 'Ganymede',
  504: 'Callisto',
  606: 'Titan',
  607: 'Hyperion',
  608: 'Iapetus',
  701: 'Ariel',
  702: 'Umbriel',
  703: 'Titania',
  704: 'Oberon',
  705: 'Miranda',
  801: 'Triton',
});

/**
 * Story 4.3 T5 — outer-system moon NAIF IDs that load lazily on
 * encounter-window entry. NOT included in `CELESTIAL_BODY_NAIF_IDS` (those
 * are the cruise-time always-rendered bodies). The `CelestialBodies` module
 * subscribes to `MissionPhaseFSM`'s `soiEntered` events and constructs the
 * relevant moon meshes; on `soiExited` the meshes are removed from the
 * scene (default — documented in Story 4.3 Dev Notes per the AC5 question).
 *
 * Per-parent-body grouping for the FSM wire-up:
 *   - Jupiter (NAIF 5): Io 501 / Europa 502 / Ganymede 503 / Callisto 504
 *   - Saturn  (NAIF 6): Titan 606 / Hyperion 607 / Iapetus 608
 *   - Uranus  (NAIF 7): Miranda 705 / Ariel 701 / Umbriel 702 /
 *                       Titania 703 / Oberon 704
 *   - Neptune (NAIF 8): Triton 801
 *
 * Hyperion (607) IS in this list because the moon mesh is still
 * constructible (`BODY_RADII_KM[607]` resolves), and the runtime falls
 * back to a grey-sphere material when `BODY_TEXTURE_SLUGS[607] === undefined`.
 * The user sees a grey textureless Hyperion at the V1/V2 Saturn flyby
 * rather than a missing body — see the chaotic-rotation rationale in
 * `MOON_NAIF_IDS_BY_PARENT` documentation below.
 */
export const MOON_NAIF_IDS: readonly number[] = Object.freeze([
  501, 502, 503, 504, // Jupiter system
  606, 607, 608, // Saturn system
  701, 702, 703, 704, 705, // Uranus system
  801, // Neptune system
]);

/**
 * Story 4.3 T5 — moon NAIF IDs grouped by parent gas-giant NAIF (which is
 * what `MissionPhaseFSM`'s SOI events key off). Used by the
 * `CelestialBodies` add/remove subscriber to look up which moons to load
 * on an SOI entry / unload on an SOI exit.
 */
export const MOON_NAIF_IDS_BY_PARENT: Readonly<Record<number, readonly number[]>> = Object.freeze({
  5: Object.freeze([501, 502, 503, 504]), // Jupiter: Io / Europa / Ganymede / Callisto
  6: Object.freeze([606, 607, 608]), // Saturn: Titan / Hyperion / Iapetus
  7: Object.freeze([701, 702, 703, 704, 705]), // Uranus: Ariel / Umbriel / Titania / Oberon / Miranda
  8: Object.freeze([801]), // Neptune: Triton
});
