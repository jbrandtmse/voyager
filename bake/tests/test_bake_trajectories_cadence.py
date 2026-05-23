"""Fast-tier tests for Story 4.3 AC1 — per-encounter cadence-refined chunks.

These tests do NOT require LFS-tracked NAIF kernels; they exercise the
pure-Python planning helpers (`_build_encounter_band_records`,
`ENCOUNTERS`, `CADENCE_BANDS`) plus a synthetic spice-stub so the per-
encounter cadence-band tuple structure is pinned in CI's fast sweep.

The end-to-end bake (which actually runs SPICE) lives in
`test_bake_trajectories.py` under `@pytest.mark.slow`; this module's
contract is the pre-bake plan shape so a misconfigured cadence table is
caught in the fast tier (no `git lfs pull` required).
"""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

BAKE_SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(BAKE_SRC))

from bake_trajectories import (  # noqa: E402 — runtime import after sys.path
    CADENCE_BANDS,
    ENCOUNTERS,
    ENCOUNTER_SPACECRAFT_TO_NAIF,
    _build_encounter_band_records,
)


# === Synthetic SPICE str2et stub =====================================
# Maps a small set of UTC strings used by the bake's encounter table to
# deterministic, recognisable ETs so the plan tuples carry visible signals.
_UTC_TO_ET: dict[str, float] = {
    "1979-03-05T12:05:00Z": 1.0e8,    # V1 Jupiter
    "1979-07-09T22:29:00Z": 1.0e8 + 1.1e7,  # V2 Jupiter (+~127 d)
    "1980-11-12T23:46:00Z": 1.5e8,    # V1 Saturn
    "1981-08-26T00:00:00Z": 1.5e8 + 2.5e7,  # V2 Saturn (+~289 d)
    "1986-01-24T17:59:00Z": 3.0e8,    # V2 Uranus
    "1989-08-25T03:56:00Z": 4.0e8,    # V2 Neptune
}


def _make_spice_stub() -> SimpleNamespace:
    """Return a SimpleNamespace exposing `str2et(utc)` over `_UTC_TO_ET`."""

    def str2et(utc: str) -> float:
        return _UTC_TO_ET[utc]

    return SimpleNamespace(str2et=str2et)


# === ENCOUNTER + CADENCE table sanity =================================


def test_encounter_table_matches_mission_facts_anchors() -> None:
    """Six gas-giant flybys: V1 Jupiter/Saturn + V2 Jupiter/Saturn/Uranus/Neptune.

    Mirrors `web/src/data/mission-facts.ts ENCOUNTER_DATES`. Drift between the
    bake's table and mission-facts.ts is a story-spec contract break; the
    mission-facts.ts parity test (separate) covers the runtime side.
    """
    expected = {
        ("voyager-1", "jupiter"),
        ("voyager-2", "jupiter"),
        ("voyager-1", "saturn"),
        ("voyager-2", "saturn"),
        ("voyager-2", "uranus"),
        ("voyager-2", "neptune"),
    }
    actual = {(e.spacecraft, e.body) for e in ENCOUNTERS}
    assert actual == expected


def test_cadence_bands_are_hourly_1min_10sec_in_order() -> None:
    """AC1 cadence schedule: hourly ±30d, 1-min ±2d, 10-sec ±1hr.

    The bands appear in *coarsest-to-finest* order so the bake's print loop
    is readable; binary-search at runtime is start-keyed so the in-table
    order does not affect runtime selection.
    """
    assert [tag for tag, _half, _cadence in CADENCE_BANDS] == [
        "hourly",
        "1min",
        "10sec",
    ]
    assert CADENCE_BANDS[0] == ("hourly", 30 * 86400.0, 3600.0)
    assert CADENCE_BANDS[1] == ("1min", 2 * 86400.0, 60.0)
    assert CADENCE_BANDS[2] == ("10sec", 3600.0, 10.0)


# === Plan-tuple shape (AC1 — file count per encounter, et alignment) ==


def test_plan_emits_three_bands_per_encounter() -> None:
    """AC1: one file per (body × time-window × kind) — three cadence bands
    per (spacecraft × encounter)."""
    spice = _make_spice_stub()
    plan = _build_encounter_band_records(ENCOUNTERS, CADENCE_BANDS, spice)
    # 6 encounters × 3 bands = 18 plan tuples.
    assert len(plan) == 6 * 3


def test_plan_ets_align_with_anchor_plus_or_minus_half_window() -> None:
    """AC1: each band's [et_start, et_end] equals anchor ± half_window."""
    spice = _make_spice_stub()
    plan = _build_encounter_band_records(ENCOUNTERS, CADENCE_BANDS, spice)
    for enc, tag, sc_naif, band_start, band_end, cadence in plan:
        anchor_et = _UTC_TO_ET[enc.utc]
        # Find the band's half-window
        half_window = next(hw for t, hw, _c in CADENCE_BANDS if t == tag)
        cadence_seconds = next(c for t, _hw, c in CADENCE_BANDS if t == tag)
        assert band_start == anchor_et - half_window, (
            f"{enc.spacecraft} {enc.body} {tag}: band_start != anchor - half_window"
        )
        assert band_end == anchor_et + half_window
        assert cadence == cadence_seconds
        assert sc_naif == ENCOUNTER_SPACECRAFT_TO_NAIF[enc.spacecraft]


def test_plan_band_windows_are_nested_inside_wider_bands_per_encounter() -> None:
    """AC1 boundary-overlap-by-one-sample (architectural inverse): each
    encounter's narrower band sits fully inside the next-wider band's window,
    so EphemerisService's binary-search picks the finest cadence covering
    a queried ET and the wider band acts as the fallback.

    For (V1 Jupiter), hourly window ⊃ 1min window ⊃ 10sec window.
    """
    spice = _make_spice_stub()
    plan = _build_encounter_band_records(ENCOUNTERS, CADENCE_BANDS, spice)
    # Bucket by (spacecraft, body):
    buckets: dict[tuple[str, str], dict[str, tuple[float, float]]] = {}
    for enc, tag, _sc, start, end, _cad in plan:
        buckets.setdefault((enc.spacecraft, enc.body), {})[tag] = (start, end)
    for key, bands in buckets.items():
        h_start, h_end = bands["hourly"]
        m_start, m_end = bands["1min"]
        s_start, s_end = bands["10sec"]
        # 1min window ⊂ hourly window
        assert h_start <= m_start < m_end <= h_end, (
            f"{key} 1min not nested in hourly"
        )
        # 10sec window ⊂ 1min window
        assert m_start <= s_start < s_end <= m_end, (
            f"{key} 10sec not nested in 1min"
        )


def test_plan_filename_tags_are_unique_per_spacecraft() -> None:
    """The bake's filename composition is `<slug>-enc-<body>-<tag>.bin.br`;
    pre-flight here we assert that the (slug, body, tag) triple is unique
    across the plan so no two band files would collide on disk."""
    spice = _make_spice_stub()
    plan = _build_encounter_band_records(ENCOUNTERS, CADENCE_BANDS, spice)
    seen: set[tuple[str, str, str]] = set()
    for enc, tag, _sc, _start, _end, _cad in plan:
        triple = (enc.spacecraft, enc.body, tag)
        assert triple not in seen, f"duplicate plan triple: {triple}"
        seen.add(triple)


def test_v1_skips_uranus_and_neptune() -> None:
    """V1 trajectory ends at Saturn (its post-Saturn course exits the
    ecliptic). The encounter table must not declare a V1 Uranus / V1 Neptune
    entry — those would emit phantom band files for a body V1 never
    encountered."""
    v1_bodies = {e.body for e in ENCOUNTERS if e.spacecraft == "voyager-1"}
    assert v1_bodies == {"jupiter", "saturn"}


def test_v2_covers_all_four_gas_giants() -> None:
    """V2 visited all four gas giants — Jupiter, Saturn, Uranus, Neptune."""
    v2_bodies = {e.body for e in ENCOUNTERS if e.spacecraft == "voyager-2"}
    assert v2_bodies == {"jupiter", "saturn", "uranus", "neptune"}
