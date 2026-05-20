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

## Editorial chapter copy

Per ADR-0021, the heliopause chapter prose lives in
`web/src/data/heliopause-copy.ts` as TypeScript template literals. The copy is
hand-written for the V1H and V2H text-cards; the source for the scientific
content is the same NASA/JPL announcement + peer-reviewed publications cited
in the heliopause-crossings table above. The copy is editorial, not a direct
quotation, so a single block citation in the chapter-copy module footer is
sufficient; this file (MISSION_FACTS.md) is the canonical citation surface.
