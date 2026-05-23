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

## Voyager 1 Jupiter encounter — interior sweep timeline

The V1 Jupiter encounter's nominal closest-approach instants for the four
Galilean moons + Amalthea, sourced from NASA SP-439 (the "Voyagers Encounter
Jupiter" mission report, JPL, 1979) Appendix A "Voyager 1 Jupiter encounter
sequence." All times are UTC. The instants are nominal trajectory
predictions reconciled with the post-encounter reconstruction; tolerance is
~1 minute against subsequent recoveries.

| Body     | NAIF | UTC instant            | Source |
| -------- | ---- | ---------------------- | ------ |
| Amalthea | 505  | `1979-03-05T06:54:00Z` | NASA SP-439 Appendix A |
| Jupiter  | 5    | `1979-03-05T12:05:00Z` | NASA SP-439 Appendix A (closest planetary approach) |
| Io       | 501  | `1979-03-05T15:14:00Z` | NASA SP-439 Appendix A |
| Europa   | 502  | `1979-03-05T18:19:00Z` | NASA SP-439 Appendix A |
| Ganymede | 503  | `1979-03-06T02:15:00Z` | NASA SP-439 Appendix A |
| Callisto | 504  | `1979-03-06T17:08:00Z` | NASA SP-439 Appendix A |

The full encounter, from first Amalthea approach to last Callisto recession,
spans roughly 34 hours; the editorial chapter copy rounds this to "the next
forty-eight hours" to encompass both the in-bound geometry (the moons appear
on approach as well as recession) and the public-facing colloquial framing
in the NASA mission summaries.

---

## Voyager 1 Jupiter ring discovery (1979-03-04)

Voyager 1 detected Jupiter's tenuous main ring during the in-bound encounter
phase on 1979-03-04. The detection frame is a single long-exposure (~11
minute) backlit image taken when the spacecraft was downstream of Jupiter,
looking back toward the planet against the Sun — the geometry that maximizes
forward-scatter from sub-micron ring dust. The ring image was assigned image
ID `FDS 16383.54` in the Voyager flight data system.

| Event | UTC date | Source |
| ----- | -------- | ------ |
| Jupiter ring detection | `1979-03-04` | Smith et al., *Science* 204, 951 (1979) — "The Jupiter system through the eyes of Voyager 1"; NASA SP-439 § 8 "The discovery of Jupiter's ring" |

The detection was a Voyager-mission scientific surprise — the ring had been
hypothesized but never observed — and was deliberately planned: imaging-team
member Tobias Owen had proposed the long-exposure backlit frame to look for
ring material in advance of the encounter, and the image was scheduled in
the sequence accordingly.

---

## Voyager 1 Io volcanic activity discovery (1979-03-08)

Three days after closest approach, on 1979-03-08, JPL navigation engineer
Linda Morabito identified a crescent-shaped plume rising above Io's limb in
a navigation reference image. The feature did not match any expected moon
or star occultation; subsequent analysis confirmed it was an active
volcanic eruption — the first observation of an active volcano outside
Earth.

| Event | UTC date | Frame ID | Source |
| ----- | -------- | -------- | ------ |
| Io plume identified by L. Morabito | `1979-03-08` | `FDS 16390.29` (often cited as `0468J1-001`) | Morabito et al., *Science* 204, 972 (1979) — "Discovery of currently active extraterrestrial volcanism" |

The frame designation `0468J1-001` is the Voyager imaging-team's session
identifier; `FDS 16390.29` is the Flight Data System sequence number from
which the SPICE-aware planetary archive ingest derives. Both are equivalent
references to the same image. The editorial chapter copy cites
`0468J1-001` to match the Morabito public-record narrative; the FDS number
appears in the peer-reviewed *Science* paper.

---

## Voyager 2 Jupiter encounter — interior sweep timeline

The V2 Jupiter encounter took a different approach geometry than V1 — V2
passed through the system roughly four months later (1979-07-09) on a
trajectory that traversed the outer Galilean moons inbound (Callisto →
Ganymede) and the inner moons (Europa → Io) outbound. V2 did NOT make a
close pass at Amalthea; the inner red moon was a V1-only close encounter.
The closest-approach instants for the four Galilean moons are sourced
from NASA SP-439 ("Voyagers Encounter Jupiter", JPL, 1979) Appendix A
"Voyager 2 Jupiter encounter sequence." Times are UTC, with tolerance
~1 minute against post-encounter reconstruction.

| Body     | NAIF | UTC instant            | Source |
| -------- | ---- | ---------------------- | ------ |
| Callisto | 504  | `1979-07-08T12:21:00Z` | NASA SP-439 Appendix A (V2 Jupiter sequence) |
| Ganymede | 503  | `1979-07-09T07:14:00Z` | NASA SP-439 Appendix A (V2 Jupiter sequence) |
| Europa   | 502  | `1979-07-09T17:53:00Z` | NASA SP-439 Appendix A (V2 Jupiter sequence) |
| Jupiter  | 5    | `1979-07-09T22:29:00Z` | NASA SP-439 Appendix A (closest planetary approach) |
| Io       | 501  | `1979-07-09T23:17:00Z` | NASA SP-439 Appendix A (V2 Jupiter sequence) |

Voyager 2's Jupiter trajectory was deliberately shaped — V2's flyby
geometry was chosen to bend the spacecraft onto the Saturn-and-beyond
Grand Tour path, in contrast with V1's Titan-priority deflection. Smith
et al., *Science* 206, 925 (1979) — "The Galilean satellites and Jupiter:
Voyager 2 imaging science results" — reports the post-encounter imaging
products that show finer ring structure than V1 captured (V2 returned a
multi-exposure ring sequence at higher signal-to-noise) and the first
high-resolution coverage of Ganymede's grooved terrain. Editorial chapter
copy at `web/src/chapters/specs/v2-jupiter.ts` rounds the Callisto-through-
Io sweep to "a day" — the actual span from Callisto (07/08 12:21 UT) to
Io (07/09 23:17 UT) is roughly 35 hours.

---

## Voyager 1 Saturn encounter — Titan flyby parameters

Voyager 1's Saturn flyby was shaped around a single targeting priority:
a close pass at Titan to characterize its atmosphere. The close-approach
trajectory came at the cost of V1's planetary tour — the Titan gravity
assist deflected V1's path northward out of the ecliptic plane, ending
its inner-solar-system mission. NASA SP-451 ("Voyages to Saturn", JPL,
1982) and Smith et al., *Science* 212, 159 (1981) — "Encounter with
Saturn: Voyager 1 imaging science results" — document the encounter
sequence and Titan flyby geometry.

| Event | UTC instant            | Parameter | Value | Source |
| ----- | ---------------------- | --------- | ----- | ------ |
| Titan closest approach | `1980-11-12T05:41:00Z` | Altitude above Titan's surface | `6,490 km` | NASA SP-451 § 3 "The Titan encounter"; Smith et al., *Science* 212, 159 (1981) |
| Saturn closest approach | `1980-11-12T23:46:00Z` | (planetary closest approach) | — | NASA SP-451 (planetary closest approach) |

The Titan flyby occurred roughly 18 hours before Saturn closest approach
on the same UTC date. The 6,490 km figure is the published altitude above
Titan's solid surface; the upper-atmosphere encounter geometry let the
radio-science occultation experiment probe Titan's atmosphere top-down
(Tyler et al., *Science* 212, 201, 1981 — "Radio science investigations
of the Saturn system with Voyager 1"). Post-encounter, V1 climbed north
of the ecliptic plane; the trajectory bend is the V1S "slingshot" visible
in the simulation per Story 4.6 AC4 + Story 4.8.

Saturn ring detail captured by V1 was the first high-resolution
photometric coverage of the ring system; SP-451 reports the F-ring
braiding structure, the broad-ring radial fine structure, and the
discovery of ring "spokes" — radial features rotating with the magnetic
field rather than Keplerian motion (Smith et al., 1981, *Science* 212).

---

## Voyager 2 Saturn encounter — moon flyby parameters

The V2 Saturn encounter (1981-08-26) covered the Saturn system without
the Titan-priority constraint that shaped V1's flyby — V2's trajectory
was tuned for the Uranus-and-Neptune Grand Tour continuation, with moon
flybys targeted opportunistically along the way. NASA's published Voyager
2 Saturn encounter timeline and Smith et al., *Science* 215, 504 (1982) —
"A new look at the Saturn system: the Voyager 2 images" — document the
sequence.

| Body    | NAIF | UTC instant            | Source |
| ------- | ---- | ---------------------- | ------ |
| Iapetus | 608  | `1981-08-22T01:26:00Z` | Smith et al., *Science* 215, 504 (1982) (V2 Saturn encounter table) |
| Hyperion | 607 | `1981-08-25T01:25:00Z` | Smith et al., *Science* 215, 504 (1982) (V2 Saturn encounter table) |
| Titan   | 606  | `1981-08-25T09:37:00Z` | Smith et al., *Science* 215, 504 (1982) (V2 Saturn encounter table) |
| Saturn  | 6    | `1981-08-26T00:00:00Z` | NASA/JPL Voyager-Saturn Encounter (date-level sourcing — closest approach 26 Aug 1981 03:24 UTC at S-ring; chapter uses midnight anchor for cross-spec consistency with Story 2.1) |

V2's Saturn flyby returned the first close imagery of Iapetus's two-toned
hemispheres (Cassini Regio is the dark trailing hemisphere documented in
the *Science* 215 paper) and the first close imagery of Hyperion's
irregular shape (~360 × 266 × 205 km tri-axial). V2 also returned ring
imagery at higher cadence than V1, contributing to the C-ring and D-ring
structure characterization in Smith et al. (1982). Editorial chapter copy
at `web/src/chapters/specs/v2-saturn.ts` cites the Iapetus / Hyperion /
Titan triple-flyby and the Uranus-trajectory setup.

---

## Voyager 2 Uranus encounter — moon flyby parameters and discoveries

The V2 Uranus encounter (1986-01-24) was the first — and to date only —
spacecraft visit to the Uranian system. The encounter trajectory was
designed around a close pass at Miranda, the smallest and innermost of
the five major Uranian moons, with progressively more distant flybys of
Ariel, Umbriel, Titania, and Oberon along the inbound approach. NASA
SP-466 ("Voyager 2 at Uranus", JPL final mission report) and the *Science*
233 (1986) special issue ("Voyager 2 at Uranus" — Stone & Miner
introduction at *Science* 233, 39 (1986); Smith et al., *Science* 233,
43 (1986) — "Voyager 2 in the Uranian system: Imaging science results")
document the sequence and discoveries.

| Body    | NAIF | Closest-approach UTC instant | Altitude / range | Source |
| ------- | ---- | ---------------------------- | ---------------- | ------ |
| Miranda | 705  | `1986-01-24T17:00:00Z`       | `29,000 km` (above Miranda's surface — closest of any Uranian moon flyby) | Stone & Miner, *Science* 233, 39 (1986); Smith et al., *Science* 233, 43 (1986). Date-level sub-day sourcing — Miranda closest approach was ~1 hour before Uranus closest approach per the published encounter timeline. |
| Uranus  | 7    | `1986-01-24T17:59:00Z`       | (planetary closest approach) | NASA/JPL Voyager-Uranus Encounter press release (NASA SP-495); Stone & Miner, *Science* 233, 39 (1986). |
| Ariel   | 701  | `1986-01-24T16:11:00Z`       | `127,000 km`     | Smith et al., *Science* 233, 43 (1986) (V2 Uranus encounter table). |
| Umbriel | 702  | `1986-01-24T15:40:00Z`       | `325,000 km`     | Smith et al., *Science* 233, 43 (1986). |
| Titania | 703  | `1986-01-24T15:13:00Z`       | `365,200 km`     | Smith et al., *Science* 233, 43 (1986). |
| Oberon  | 704  | `1986-01-24T14:36:00Z`       | `470,600 km`     | Smith et al., *Science* 233, 43 (1986). |

### New moons discovered at Uranus

Voyager 2 discovered **10 new moons** of Uranus during the encounter
approach phase (December 1985 through January 1986) — small inner moons
all interior to Miranda's orbit. The full list with NAIF body IDs per
the JPL planetary satellite ephemeris (NAIF satellites kernel):
Cordelia (706), Ophelia (707), Bianca (708), Cressida (709), Desdemona
(710), Juliet (711), Portia (712), Rosalind (713), Belinda (714), and
Puck (715, the largest of the ten, discovered earliest at 30 December
1985). An 11th moon, **Perdita** (725), was identified in V2 Uranus
encounter imagery only in 1999 by Erich Karkoschka's re-analysis of
the archived Voyager frames (Karkoschka, *Icarus* 151, 51 (2001) —
"Voyager's eleventh discovery of a satellite of Uranus and photometry
and the first size measurements of nine satellites"). The
contemporaneous 1986 count is 10; the historical total credited to the
V2 Uranus encounter imagery is **11 satellites** once Perdita was
identified.

| Event | UTC date | Source |
| ----- | -------- | ------ |
| 10 new Uranian moons discovered (contemporaneous count) | `1985-12` through `1986-01` | Smith et al., *Science* 233, 43 (1986); Stone & Miner, *Science* 233, 39 (1986). |
| 11th moon (Perdita) identified in archived V2 frames | `1999` | Karkoschka, *Icarus* 151, 51 (2001). |

The chapter copy at `web/src/chapters/specs/v2-uranus.ts` cites the
**11 new moons** total credited to the V2 Uranus encounter imagery — the
contemporaneous 10 + Perdita — consistent with the PRD encounter
coverage table phrasing.

### Uranus rings

Voyager 2 imagery refined the Uranian ring system count — the
ground-based stellar-occultation discoveries (1977 — Elliot, Dunham &
Mink, *Nature* 267, 328 (1977)) had identified the nine outer narrow
rings; Voyager 2 added two more (ε ring substructure characterised
plus the broad outer ν and μ rings reported later). The principal
*Science* 233 (1986) imaging-team paper documents the 10-ring count
recognised at encounter time. Story 4.7 editorial copy cites the
**new ring detail** in the V2U encounter qualitatively per the *Science*
233 paper; specific ring counts are NOT cited in the editorial copy.

### Miranda surface fractures (Story 4.7 editorial fact)

V2 imagery of Miranda's surface — at 29,000 km closest-approach altitude
— captured the moon's coronae (large oval surface features), ridged
"chevron" terrain, and surface cliffs up to ~20 km in vertical relief
(Verona Rupes). Smith et al., *Science* 233, 43 (1986) reports the
imagery and identifies the geological surface anomalies; the editorial
copy at `web/src/chapters/specs/v2-uranus.ts` cites the **dramatic
surface fractures** qualitatively.

---

## Voyager 2 Neptune encounter — Triton flyby parameters and discoveries

The V2 Neptune encounter (1989-08-25) was the spacecraft's final
planetary encounter and the first — and to date only — visit to the
Neptunian system. The encounter trajectory was designed around a close
pass at Triton, Neptune's large retrograde moon. NASA SP-525 ("Voyager
at Neptune", JPL final mission report) and the *Science* 246 (1989)
special issue ("Voyager 2 at Neptune" — Stone & Miner introduction at
*Science* 246, 1417 (1989); Smith et al., *Science* 246, 1422 (1989) —
"Voyager 2 at Neptune: Imaging science results") document the sequence
and discoveries.

| Body    | NAIF | Closest-approach UTC instant | Altitude / range | Source |
| ------- | ---- | ---------------------------- | ---------------- | ------ |
| Neptune | 8    | `1989-08-25T03:56:00Z`       | (planetary closest approach — 4,950 km above Neptune's 1-bar level, the closest-altitude planetary flyby of either Voyager) | NASA/JPL Voyager-Neptune Encounter press release (NASA SP-525); Stone & Miner, *Science* 246, 1417 (1989). |
| Triton  | 801  | `1989-08-25T09:10:00Z`       | `39,800 km` (above Triton's surface) | Smith et al., *Science* 246, 1422 (1989) (V2 Neptune encounter table); NASA SP-525. |

The Triton closest approach occurred roughly five hours after Neptune
closest approach on the same UTC date. The 39,800 km figure is the
published altitude above Triton's solid surface; the close geometry let
the imaging team resolve the moon's polar cap, cantaloupe terrain, and
the active geyser plumes described below.

### Triton nitrogen geyser discovery

V2 imagery of Triton's southern hemisphere captured **active nitrogen
geyser plumes** rising from the surface — dark streaks extending ~8 km
into the thin nitrogen atmosphere, identified as wind-blown plumes of
nitrogen gas and entrained dark dust originating from sub-surface
vents heated by weak solar insolation. The geyser activity was the
second confirmed observation of cryovolcanic activity in the solar
system (after Io's silicate volcanism, V1 1979). Soderblom et al.,
*Science* 250, 410 (1990) — "Triton's geyser-like plumes: Discovery
and basic characterization" — is the primary citation; Smith et al.,
*Science* 246, 1422 (1989) reports the initial imaging observation in
the V2 Neptune special issue.

### Neptune Great Dark Spot

V2 imagery of Neptune's southern hemisphere captured the **Great Dark
Spot** — a large anticyclonic storm system roughly the size of Earth,
analogous in scale (though not lifetime) to Jupiter's Great Red Spot.
Subsequent Hubble Space Telescope observations (1994 onwards) showed
that the Great Dark Spot had dissipated and re-formed elsewhere on the
planet — Neptune's storms are transient on decadal timescales. Smith
et al., *Science* 246, 1422 (1989) — V2 Neptune imaging-science
results paper — documents the initial discovery.

### Neptune ring arcs and new moons

V2 imagery confirmed the existence of **complete (not arc) rings**
around Neptune — ground-based stellar-occultation observations
(1984 onwards) had detected partial brightness anomalies interpreted
as "ring arcs"; V2 imagery established that complete rings exist
(Adams, Le Verrier, Galle, Lassell, Arago in IAU-final designations)
with the brightness anomalies being azimuthal density variations
within the Adams ring rather than discontinuous arcs. The
ring-arc-to-complete-ring resolution is documented in Smith et al.,
*Science* 246, 1422 (1989) § "The ring system."

V2 also discovered **six new inner moons of Neptune**:

| Moon    | NAIF | Discovery context | Source |
| ------- | ---- | ----------------- | ------ |
| Naiad   | 803  | V2 imagery, 1989  | Smith et al., *Science* 246, 1422 (1989); IAU Circular 4867 (1989). |
| Thalassa | 804 | V2 imagery, 1989  | Smith et al., *Science* 246, 1422 (1989); IAU Circular 4867 (1989). |
| Despina | 805  | V2 imagery, 1989  | Smith et al., *Science* 246, 1422 (1989); IAU Circular 4824 (1989). |
| Galatea | 806  | V2 imagery, 1989  | Smith et al., *Science* 246, 1422 (1989); IAU Circular 4824 (1989). |
| Larissa | 807  | (Re-)discovered V2 1989; earlier 1981 ground-based detection (Reitsema et al.) confirmed by V2 | Smith et al., *Science* 246, 1422 (1989); IAU Circular 4824 (1989). |
| Proteus | 808  | V2 imagery, 1989 (largest of the six discoveries; ~210 km radius) | Smith et al., *Science* 246, 1422 (1989); IAU Circular 4806 (1989). |

The chapter copy at `web/src/chapters/specs/v2-neptune.ts` cites the
six new moons + ring-arc → complete-ring resolution qualitatively per
the *Science* 246 imaging paper.

### Triton gravity-assist bend (FR12)

The close Triton flyby (39,800 km altitude, retrograde encounter
geometry) deflected V2's heliocentric trajectory **south of the
ecliptic plane** — the final gravity assist of the Voyager mission and
the largest plane-change of either spacecraft's trajectory. The
post-Neptune trajectory carries V2 progressively southward of the
ecliptic; the bend's full visualisation in heliocentric framing
develops over the post-encounter cruise era (1990 onwards) rather than
inside the ±5d V2 Neptune encounter window. Story 4.7 AC4 documents
the bend's qualitative visibility "at the end of the mission (2030)";
Story 4.8 captures the canonical annotated screenshot. The
gravity-assist bend is documented in Stone & Miner, *Science* 246,
1417 (1989) — V2 Neptune encounter introduction — and the NASA SP-525
trajectory appendix.

---

## Editorial chapter copy

Per ADR-0021, the heliopause chapter prose lives in
`web/src/data/heliopause-copy.ts` as TypeScript template literals. The copy is
hand-written for the V1H and V2H text-cards; the source for the scientific
content is the same NASA/JPL announcement + peer-reviewed publications cited
in the heliopause-crossings table above. The copy is editorial, not a direct
quotation, so a single block citation in the chapter-copy module footer is
sufficient; this file (MISSION_FACTS.md) is the canonical citation surface.

Story 4.5 extends the editorial-copy surface to encounter chapters by adding
an optional `copy?: EncounterChapterCopy` field on `ChapterSpec`
(`web/src/types/chapter.ts`). The V1J chapter spec at
`web/src/chapters/specs/v1-jupiter.ts` populates this field; the prose
covers the ring discovery (1979-03-04), the closest-approach instant
(1979-03-05T12:05:00Z), the 48-hour Amalthea/Io/Europa/Ganymede/Callisto
sweep (table above), and Linda Morabito's Io volcano discovery (1979-03-08).
Every dated / distanced / named / counted fact traces back to a primary
source in this document — no invented values.

Story 4.6 extends the editorial-copy surface to three more encounter
chapters — V2 Jupiter (`v2-jupiter.ts`), V1 Saturn (`v1-saturn.ts`), and
V2 Saturn (`v2-saturn.ts`). The V2J prose covers the
Callisto/Ganymede/Europa/Io sweep + the deflection onto the Saturn-and-
beyond trajectory + V2's finer ring imaging; the V1S prose covers the
Titan flyby at 6,490 km + the slingshot deflection out of the ecliptic +
the ring-spoke discovery; the V2S prose covers the
Iapetus/Hyperion/Titan flybys + the additional ring detail + the Uranus
trajectory setup. Every dated / distanced / named fact traces to the
tables above. Per the looser Story 4.6 band, encounter prose is
50–150 words rather than Story 4.5's 80–120 — the historical record's
density varies across the four encounters.

Story 4.7 closes the editorial-copy surface for the final two encounter
chapters — V2 Uranus (`v2-uranus.ts`) and V2 Neptune (`v2-neptune.ts`).
The V2U prose covers the Miranda flyby at 29,000 km + the
Ariel/Umbriel/Titania/Oberon flyby sequence + the 11 new moons + Miranda's
dramatic surface fractures; the V2N prose covers the Triton flyby at
39,800 km + the nitrogen geysers + Neptune's Great Dark Spot + the
new moons + ring-arc-to-complete-ring resolution + the gravity-assist
bend south of the ecliptic (FR12). Every dated / distanced / named fact
traces to the V2 Uranus / V2 Neptune sections above. The V2U + V2N copy
also stays in the looser Story 4.6 band of 50–150 words per chapter. FR30
(all six gas-giant encounters fully populated with copy + framing) is
now closed at the content tier.
