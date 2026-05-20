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
    for label, _start, _end, _scan_id, bus_id in ENCOUNTERS:
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
    for label, _start, _end, _scan_id, bus_id in ENCOUNTERS:
        assert bus_id in (V1_BUS, V2_BUS), (
            f"{label!r}: bus_id={bus_id} not in {{V1_BUS={V1_BUS}, V2_BUS={V2_BUS}}}"
        )


def test_pale_blue_dot_buses_to_v1() -> None:
    """PBD is the V1 family-portrait window (1990-02-14); bus must be V1_BUS."""
    pbd = [e for e in ENCOUNTERS if "Pale Blue Dot" in e[0]]
    assert len(pbd) == 1, f"expected exactly one PBD encounter, got {len(pbd)}"
    _label, _start, _end, _scan_id, bus_id = pbd[0]
    assert bus_id == V1_BUS, f"PBD bus_id={bus_id}, expected V1_BUS={V1_BUS}"


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
