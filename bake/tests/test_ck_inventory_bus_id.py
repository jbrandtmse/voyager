"""Story 3.0 AC1 regression test — ENCOUNTERS gains an explicit `bus_id` field.

Replaces the prior `" V1 " in f" {label} " or label.startswith("V1")` substring
match on each encounter's label with a direct field read. This test locks the
mapping so a future label-text edit can't silently swap a V1 encounter onto the
V2 bus structure ID (or vice versa).
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
BAKE_SRC = REPO_ROOT / "bake" / "src"
if str(BAKE_SRC) not in sys.path:
    sys.path.insert(0, str(BAKE_SRC))

from ck_inventory import ENCOUNTERS, V1_BUS, V2_BUS  # noqa: E402


def test_every_encounter_resolves_to_correct_bus_id() -> None:
    """V1-labelled encounters bus to V1_BUS (-31000); V2-labelled encounters bus to V2_BUS (-32000).

    The "Pale Blue Dot" entry's label starts with "V1 " so the pre-Story-3.0
    `label.startswith("V1")` branch happened to route it correctly. The
    fragility AC1 closes is the next encounter whose label might NOT lead
    with the spacecraft prefix (e.g. a rephrased "1990 family portrait
    (V1)" tail-prefix would have silently fallen through to V2). The
    field-based mapping makes the routing explicit instead of label-shape-
    dependent.
    """
    assert ENCOUNTERS, "ENCOUNTERS list is empty"
    for label, _start, _end, _scan_id, bus_id, _closest in ENCOUNTERS:
        if "V1" in label or "Pale Blue Dot" in label:
            assert bus_id == V1_BUS, (
                f"{label!r}: bus_id={bus_id}, expected V1_BUS={V1_BUS}"
            )
        elif "V2" in label:
            assert bus_id == V2_BUS, (
                f"{label!r}: bus_id={bus_id}, expected V2_BUS={V2_BUS}"
            )
        else:
            raise AssertionError(
                f"encounter label has no spacecraft marker: {label!r}"
            )


def test_bus_id_is_one_of_the_two_voyager_structure_ids() -> None:
    """Belt-and-braces: bus_id must be V1_BUS or V2_BUS only."""
    for label, _start, _end, _scan_id, bus_id, _closest in ENCOUNTERS:
        assert bus_id in (V1_BUS, V2_BUS), (
            f"{label!r}: bus_id={bus_id} not in {{V1_BUS={V1_BUS}, V2_BUS={V2_BUS}}}"
        )


def test_pale_blue_dot_buses_to_v1() -> None:
    """PBD is the V1 family-portrait window (1990-02-14); bus must be V1_BUS."""
    pbd = [e for e in ENCOUNTERS if "Pale Blue Dot" in e[0]]
    assert len(pbd) == 1, f"expected exactly one PBD encounter, got {len(pbd)}"
    _label, _start, _end, _scan_id, bus_id, _closest = pbd[0]
    assert bus_id == V1_BUS, f"PBD bus_id={bus_id}, expected V1_BUS={V1_BUS}"


def test_encounters_have_valid_closest_approach_utc() -> None:
    """Story 3.1 AC7: every ENCOUNTERS entry has a parseable ISO-8601 UTC string in
    the closest_approach_utc field (6th positional element).

    This locks the schema contract so a future label-text edit or row-reorder
    can't silently drop or malform the closest-approach anchor that ck_sample.py
    consumes for the 10-second-cadence band.
    """
    from datetime import datetime

    assert ENCOUNTERS, "ENCOUNTERS list is empty"
    for entry in ENCOUNTERS:
        assert len(entry) == 6, (
            f"ENCOUNTERS entry must be 6-tuple "
            f"(label, start_utc, end_utc, scan_id, bus_id, closest_approach_utc); "
            f"got {len(entry)}-tuple: {entry!r}"
        )
        label, _start, _end, _scan_id, _bus_id, closest_approach_utc = entry
        assert isinstance(closest_approach_utc, str) and closest_approach_utc, (
            f"{label!r}: closest_approach_utc must be a non-empty ISO-8601 UTC string"
        )
        # Parse — must succeed. Accept the trailing 'Z' (per MISSION_FACTS.md
        # convention) by replacing with +00:00 for fromisoformat.
        normalized = closest_approach_utc.replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError as exc:
            raise AssertionError(
                f"{label!r}: closest_approach_utc={closest_approach_utc!r} is not parseable ISO-8601: {exc}"
            ) from exc
        assert parsed is not None  # type guard


def test_encounters_closest_approach_utc_falls_inside_window() -> None:
    """Story 3.1 AC7: closest_approach_utc must lie within [start_utc, end_utc] of its row.

    Sanity check: a future edit that swaps the closest-approach value between
    encounter rows (e.g., V1 Jupiter value pasted into V2 Jupiter) would be
    caught here. The window bounds in ck_inventory are wide (±~1 month) so
    inversions are clearly out-of-range.
    """
    from datetime import datetime

    for label, start_utc, end_utc, _scan_id, _bus_id, closest_approach_utc in ENCOUNTERS:
        start = datetime.fromisoformat(start_utc)
        end = datetime.fromisoformat(end_utc)
        closest = datetime.fromisoformat(closest_approach_utc.replace("Z", "+00:00"))
        # Strip tz from closest for the comparison if start/end are naive
        if closest.tzinfo is not None and start.tzinfo is None:
            closest = closest.replace(tzinfo=None)
        assert start <= closest <= end, (
            f"{label!r}: closest_approach_utc={closest_approach_utc} "
            f"not inside [{start_utc}, {end_utc}]"
        )


def test_ck_inventory_source_no_longer_uses_substring_match() -> None:
    """Source-level tripwire: the fragile substring fallback must be gone.

    Catches regressions where a future refactor re-introduces the
    label-substring check. AC1 contract: bus-ID resolution is by direct
    field read.
    """
    src = (BAKE_SRC / "ck_inventory.py").read_text(encoding="utf-8")
    assert '" V1 " in f" {label} "' not in src, (
        "fragile substring match on encounter label has been re-introduced — "
        "AC1 contract regression"
    )
    assert 'label.startswith("V1")' not in src, (
        "fragile startswith fallback on encounter label has been re-introduced — "
        "AC1 contract regression"
    )


# === Story 3.1 AC7 (QA gap-fill): cross-half parity with MISSION_FACTS.md ===


def test_encounters_closest_approach_utcs_appear_in_mission_facts_md() -> None:
    """Story 3.1 AC7 parity: every ENCOUNTERS closest_approach_utc value must appear
    verbatim in MISSION_FACTS.md (the canonical citation surface, Story 2.9 R4).

    The web-side mission-facts.test.ts asserts this parity for ENCOUNTER_DATES
    in mission-facts.ts; this is the bake-side mirror — ck_inventory.py's
    ENCOUNTERS is an independent source surface, so a future edit that "fixes"
    a closest-approach value without updating MISSION_FACTS.md would silently
    drift the two surfaces apart. This test closes that gap.

    Voyager-skill-rules.md Rule 5 (planning artifacts amended in place): if a
    new closest-approach value is introduced in ENCOUNTERS, MISSION_FACTS.md
    MUST be the authoritative source — not the reverse.
    """
    mission_facts_path = REPO_ROOT / "MISSION_FACTS.md"
    assert mission_facts_path.exists(), f"MISSION_FACTS.md missing at {mission_facts_path}"
    doc = mission_facts_path.read_text(encoding="utf-8")

    for label, _start, _end, _scan_id, _bus_id, closest_approach_utc in ENCOUNTERS:
        assert closest_approach_utc in doc, (
            f"{label!r}: closest_approach_utc={closest_approach_utc!r} does NOT appear "
            f"verbatim in MISSION_FACTS.md. Either fix the bake constant or add the value "
            f"to MISSION_FACTS.md (per voyager-skill-rules.md Rule 5 — planning artifacts "
            f"amended in place, not worked around)."
        )
