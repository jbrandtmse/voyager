# MISSION_FACTS.md

Canonical source of primary-mission citations for the Voyager visualization.
Per NFR-M3, every pinned timestamp, encounter date, closest-approach instant,
heliopause crossing, and instrument-shutoff date used by the simulation is
traceable from this document to a primary source (NASA / JPL press release,
NAIF SPICE documentation, peer-reviewed publication).

The TypeScript module `web/src/data/mission-facts.ts` is the runtime mirror of
this document. A parity test
(`web/src/data/mission-facts.test.ts`) enforces that the two stay aligned —
adding or changing a fact requires editing both, and CI fails if they drift.

When a fact is a midnight UTC date (no published sub-day instant), the time
component is rendered as `T00:00:00Z` and called out below as "date-level
sourcing." Sub-day instants come from NASA / JPL closest-approach event
summaries.

---

## Spacecraft launches

| Spacecraft | UTC instant            | Source |
| ---------- | ---------------------- | ------ |
| Voyager 1  | `1977-09-05T12:56:00Z` | NASA Voyager mission press kit; NSSDCA spacecraft master catalogue (ID 1977-084A) |
| Voyager 2  | `1977-08-20T14:29:00Z` | NASA Voyager mission press kit; NSSDCA spacecraft master catalogue (ID 1977-076A) |

Voyager 2 launched first chronologically. The 16-day delay between the two
launches reflects the launch window required to put V1 on the faster Saturn/
Titan trajectory while V2 took the slower Grand Tour route.

---

## Planetary encounters — closest approach (UTC)

| Spacecraft | Body    | UTC instant            | Source |
| ---------- | ------- | ---------------------- | ------ |
| Voyager 1  | Jupiter | `1979-03-05T12:05:00Z` | NASA/JPL Voyager-Jupiter Encounter timeline (NASA SP-439) |
| Voyager 2  | Jupiter | `1979-07-09T22:29:00Z` | NASA/JPL Voyager-Jupiter Encounter timeline (NASA SP-439) |
| Voyager 1  | Saturn  | `1980-11-12T23:46:00Z` | NASA/JPL Voyager-Saturn Encounter timeline (NASA SP-451) |
| Voyager 2  | Saturn  | `1981-08-26T00:00:00Z` | NASA/JPL Voyager-Saturn Encounter (date-level sourcing — closest approach 26 Aug 1981 03:24 UTC at S-ring; chapter uses midnight anchor for cross-spec consistency with Story 2.1) |
| Voyager 2  | Uranus  | `1986-01-24T17:59:00Z` | NASA/JPL Voyager-Uranus Encounter press release (NASA SP-495) |
| Voyager 2  | Neptune | `1989-08-25T03:56:00Z` | NASA/JPL Voyager-Neptune Encounter press release (NASA SP-525) |

---

## Pale Blue Dot family-portrait imaging sequence

| Spacecraft | UTC instant            | Source |
| ---------- | ---------------------- | ------ |
| Voyager 1  | `1990-02-14T00:00:00Z` | NASA/JPL "Voyager 1's Pale Blue Dot" — the family-portrait imaging sequence anchor; Sagan, *Pale Blue Dot* (Random House, 1994). Date-level sourcing — the imaging sequence executed across several hours, and the canonical instant is the midnight UTC anchor. |

The Pale Blue Dot date is included in the ck_sample.py encounter window
schedule (Story 3.1 AC7) so the attitude bake covers the family-portrait
imaging sequence at the 10-second cadence; Story 5.2 owns the choreographed
scan-platform attitude synthesis since there is no CK coverage for the scan
platform on this date (see `docs/kernels/ckbrief-inventory.md`).

---

## Heliopause crossings

| Spacecraft | UTC date     | Source |
| ---------- | ------------ | ------ |
| Voyager 1  | `2012-08-25` | NASA/JPL announcement (12 September 2013); Krimigis et al., *Science* 341, 144 (2013); Gurnett et al., *Science* 341, 1489 (2013) — date the plasma- and magnetic-field signatures consistent with departure from the heliosheath into the local interstellar medium were locked in. |
| Voyager 2  | `2018-11-05` | NASA/JPL announcement (10 December 2018); Stone et al., *Nature Astronomy* 3, 1013 (2019) — date the PLS, MAG, CRS and LECP instruments together showed Voyager 2 had crossed the heliopause boundary. |

Both heliopause anchors are date-level (`T00:00:00Z`) — the crossing is a
multi-hour signature transition, not a sub-second event, and the published
NASA/JPL anchor is the calendar date.

---

## Instrument-shutoff schedule

Voyager's eleven-instrument science payload has been wound down progressively
since launch to extend the spacecraft's operating life against the declining
RTG power budget. The simulation tracks the four instruments most legible to a
public audience — ISS (Imaging Science Subsystem), UVS (Ultraviolet
Spectrometer), PLS (Plasma Science), and LECP (Low-Energy Charged-Particle
detector). Other instruments (PRA, PWS, IRIS, MAG, CRS, etc.) are intentionally
omitted from the HUD readout to keep the bottom-left corner legible; the
canonical full instrument-status table lives at NASA/JPL.

Each row is the date the instrument was either powered off, declared
permanently inoperative, or had its last data return.

### Voyager 1

| Instrument | Shutoff UTC date | Source |
| ---------- | ---------------- | ------ |
| ISS        | `1990-04-14`     | NASA/JPL Voyager Mission Status — V1 imaging cameras powered down after the "family portrait" photo session (March–April 1990); the Pale Blue Dot is the final frame. |
| PLS        | `1980-04-01`     | NASA/JPL Voyager mission status; the V1 Plasma Science instrument failed on 1980-04-01 during the cruise between Jupiter and Saturn and never returned to operation. |
| UVS        | `2016-04-19`     | NASA/JPL Voyager Mission Status (April 2016) — V1 UVS was turned off to conserve power. |
| LECP       | `2025-09-30`     | NASA/JPL Voyager Mission Status (October 2024) — V1 LECP is being wound down in the late-mission power-management plan; the 2025 date used here is the forecast end-of-operation per the published power timeline. (Date-level sourcing.) |

### Voyager 2

| Instrument | Shutoff UTC date | Source |
| ---------- | ---------------- | ------ |
| ISS        | `1990-01-01`     | NASA/JPL Voyager Mission Status — V2 imaging cameras powered down in early 1990 after the post-Neptune phase; no further imaging since. |
| PLS        | `2024-10-01`     | NASA/JPL Voyager Mission Status (October 2024) — V2 Plasma Science was the last operating plasma instrument across both spacecraft; turned off as part of the late-mission power-management plan. |
| UVS        | `1998-01-01`     | NASA/JPL Voyager Mission Status — V2 UVS turned off in 1998 to conserve power. (Date-level sourcing.) |
| LECP       | `2026-09-30`     | NASA/JPL Voyager Mission Status (October 2024) — V2 LECP forecast end-of-operation per the published power timeline. (Date-level sourcing.) |

**Per Voyager skill rule 5 (NFR tripwire response):** some shutoff dates above
are "circa-year" public-record dates rather than published sub-day instants
because NASA/JPL communicates the late-mission power-management decisions at
calendar-month granularity. The strikethrough transition in the HUD therefore
flips at midnight UTC of the canonical date; this is the rationale for using
date-level sourcing rather than fabricating sub-second precision.

---

## Moon physical properties (Story 4.3 T4.5)

The 13 outer-system moons rendered during encounter chapters (12 imaged by
Voyager + Hyperion which Voyager 2 imaged but for which no equirectangular
texture map exists — see "Texture coverage" note below). Mean radii are NASA
fact-sheet values rounded to 0.1 km precision; the source canonical document
per system is the NASA Solar System Exploration "Moons" fact sheet collection
at `https://science.nasa.gov/moons/` and the parent-body fact sheets at
`https://nssdc.gsfc.nasa.gov/planetary/factsheet/`. The IAU 2015 working group
on Cartographic Coordinates & Rotational Elements final report (Archinal et
al., *Celestial Mechanics & Dynamical Astronomy* 130, 22 (2018)) is the upstream
reference both NASA fact sheets cite.

### Jupiter system (encountered by V1J + V2J)

| Moon     | NAIF | Mean radius (km) | Notes / Source |
| -------- | ---- | ---------------- | -------------- |
| Io       | 501  | 1,821.6          | Galileo + Juno-derived; volcanically active, the most geologically active body in the solar system. |
| Europa   | 502  | 1,560.8          | Galileo + Juno (Perijove 45) confirmed sub-surface ocean. |
| Ganymede | 503  | 2,634.1          | Largest moon in the solar system — larger than Mercury (2,439.7 km) by volume; smaller by mass due to ice composition. |
| Callisto | 504  | 2,410.3          | Outermost Galilean; heavily cratered, geologically inert. |

### Saturn system (encountered by V1S + V2S)

| Moon     | NAIF | Mean radius (km) | Notes / Source |
| -------- | ---- | ---------------- | -------------- |
| Titan    | 606  | 2,574.7          | Second-largest moon in the solar system; only moon with a substantial atmosphere. Cassini ISS global map at PIA19658. |
| Hyperion | 607  | 135.0            | Mean of the 360×266×205 km tri-axial ellipsoid (`(180+133+102.5)/3 ≈ 138.5`; NASA fact sheet rounds to 135). Chaotic rotation; the only known major moon with a non-equilibrium rotational state. **No public-domain equirectangular texture map exists** — USGS Astrogeology confirms no Hyperion control network exists (`https://astrogeology.usgs.gov/search/map/hyperion_image_control_network`). The simulation renders Hyperion as a grey-sphere placeholder per the Story 4.3 T4.5 deferral. |
| Iapetus  | 608  | 734.5            | Two-toned moon (Cassini Regio bright/dark hemispheres). Voyager + Cassini composite. |

### Uranus system (encountered by V2U)

| Moon    | NAIF | Mean radius (km) | Notes / Source |
| ------- | ---- | ---------------- | -------------- |
| Miranda | 705  | 235.8            | Smallest of the five major Uranian moons; dramatic Voyager-2-imaged surface fractures. |
| Ariel   | 701  | 578.9            | Brightest of the Uranian moons. Voyager 2 imagery is grayscale-only (Story 4.3 build pipeline expands to RGB). |
| Umbriel | 702  | 584.7            | Darkest of the Uranian moons. Voyager 2 grayscale source. |
| Titania | 703  | 788.9            | Largest Uranian moon. |
| Oberon  | 704  | 761.4            | Outermost Uranian moon (of the five major). |

### Neptune system (encountered by V2N)

| Moon   | NAIF | Mean radius (km) | Notes / Source |
| ------ | ---- | ---------------- | -------------- |
| Triton | 801  | 1,353.4          | Only large moon in the solar system with a retrograde orbit; thought to be a captured Kuiper Belt object. Voyager 2 1989 flyby imagery covers ~75% of the surface. |

### Texture coverage caveat (Story 4.3 T4.5)

Voyager 1 imaged the Galilean moons + the inner Saturn moons; Voyager 2 added
Uranus's major moons + Triton at Neptune. Cassini (Saturn, 2004-2017) and
Galileo (Jupiter, 1995-2003) filled in the modern high-resolution mosaics.
Where Cassini / Galileo mosaics exist (Io, Europa, Ganymede, Callisto, Titan,
Iapetus) the texture is near-complete. Where only Voyager 2 imagery exists
(Uranus moons, Triton) the texture covers ~50-75% of the surface — the
unilluminated half is filled with the average surface tone, which is visually
plausible at flyby scrub distances.

**Hyperion specifically** — Voyager 2 captured Hyperion in 1981 from ~500,000 km;
Cassini added closer imaging in 2005-2010. No control network has been
established by USGS because Hyperion's chaotic 3:4 rotation resonance prevents
a clean body-fixed coordinate system. The simulation renders Hyperion as a
grey sphere using `BODY_RADII_KM[607]` for the geometry but no `textureSlug`,
which the `CelestialBodies` fallback path resolves to the default grey
material.

---

## Editorial chapter copy

Per ADR-0021, the heliopause chapter prose lives in
`web/src/data/heliopause-copy.ts` as TypeScript template literals. The copy is
hand-written for the V1H and V2H text-cards; the source for the scientific
content is the same NASA/JPL announcement + peer-reviewed publications cited
in the heliopause-crossings table above. The copy is editorial, not a direct
quotation, so a single block citation in the chapter-copy module footer is
sufficient; this file (MISSION_FACTS.md) is the canonical citation surface.
