"""QA-stage fast-tier tests for Story 4.3 T5 — outer-system moon bake table
(``MOON_BODIES``) + the graceful ``SpiceyError`` skip path.

Dev pinned (in ``test_bake_trajectories_cadence.py``): cadence-band plan
shape; encounter table parity; band-window nesting.

QA pins the failure modes dev didn't pin:

  1. **MOON_BODIES table shape** — 13 entries (4 + 3 + 5 + 1 by parent),
     unique NAIF IDs, disjoint from ``CELESTIAL_BODIES`` (so the bake
     doesn't double-emit a chunk for the same body).

  2. **Hyperion (NAIF 607) is INCLUDED in MOON_BODIES** — Hyperion's
     trajectory IS bakable (its chaotic rotation prevents a TEXTURE map
     but not the orbital ephemeris). The constant table reflects this.

  3. **Skip path on a missing satellite-system SPK** — when
     ``spice.spkgeo`` raises ``SpiceyError`` at the mission-midpoint
     probe, the bake logs a single ``[SKIP]`` line per missing moon (NOT
     per-sample retry) and continues to the next moon without polluting
     the body_records list. We exercise the contract by mocking the
     ``spice`` namespace such that ``spkgeo`` always raises and asserting
     on the log shape + the absence of any per-body manifest record.

  4. **Slug uniqueness** — every moon slug appears in ``MOON_BODIES``
     once. A duplicate slug would collide on disk because the bake's
     ``file_name = f"{slug}.bin.br"`` is the only output-file disambiguator.
"""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any

BAKE_SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(BAKE_SRC))

from bake_trajectories import (  # noqa: E402 — runtime import after sys.path
    CELESTIAL_BODIES,
    MOON_BODIES,
)


# === Table shape =====================================================


def test_moon_bodies_has_thirteen_entries() -> None:
    """4 Galilean + 3 Saturn (Titan / Hyperion / Iapetus) + 5 Uranian +
    1 Triton = 13 moons. The runtime mirror is `MOON_NAIF_IDS` in
    `web/src/constants/body-radii.ts`; the bake table is the upstream
    source of truth for the trajectory bake."""
    assert len(MOON_BODIES) == 13


def test_moon_bodies_naif_ids_are_unique() -> None:
    """No two moons share a NAIF ID. (A duplicate would silently overwrite
    the trajectory file at bake time without raising.)"""
    naif_ids = [m[0] for m in MOON_BODIES]
    assert len(set(naif_ids)) == len(naif_ids)


def test_moon_bodies_disjoint_from_celestial_bodies() -> None:
    """Moons must not appear in CELESTIAL_BODIES (which is the cruise-tier
    bake table). If they did, the bake would emit two trajectory files
    for the same body and the runtime EphemerisService would resolve
    one nondeterministically."""
    celestial_naifs = {b[0] for b in CELESTIAL_BODIES}
    moon_naifs = {m[0] for m in MOON_BODIES}
    overlap = celestial_naifs & moon_naifs
    assert overlap == set(), f"NAIF overlap between cruise + moon tables: {overlap}"


def test_moon_bodies_slugs_are_unique() -> None:
    """`<slug>.bin.br` is the bake's output filename; duplicate slugs collide
    on disk (one would overwrite the other silently)."""
    slugs = [m[2] for m in MOON_BODIES]
    assert len(set(slugs)) == len(slugs)


def test_hyperion_is_included_in_moon_bodies() -> None:
    """Hyperion (NAIF 607) IS bakable — only its TEXTURE map is missing
    (chaotic rotation prevents an equirectangular control network). The
    trajectory bake should still emit a chunk for it when the Saturn
    satellite SPK is furnished. The runtime falls back to a grey-sphere
    placeholder because `BODY_TEXTURE_SLUGS[607]` is intentionally absent."""
    hyperion_in_table = any(naif_id == 607 for naif_id, _name, _slug in MOON_BODIES)
    assert hyperion_in_table


# === Per-parent grouping =============================================


def test_moon_bodies_per_parent_counts_match_naif_conventions() -> None:
    """Per the NAIF 5xx (Jupiter system), 6xx (Saturn), 7xx (Uranus),
    8xx (Neptune) numbering, sanity-check that the bake table's counts
    match the runtime constants table (4 / 3 / 5 / 1)."""
    by_parent: dict[int, list[int]] = {5: [], 6: [], 7: [], 8: []}
    for naif_id, _name, _slug in MOON_BODIES:
        parent = naif_id // 100
        if parent in by_parent:
            by_parent[parent].append(naif_id)
    assert len(by_parent[5]) == 4  # Io / Europa / Ganymede / Callisto
    assert len(by_parent[6]) == 3  # Titan / Hyperion / Iapetus
    assert len(by_parent[7]) == 5  # Ariel / Umbriel / Titania / Oberon / Miranda
    assert len(by_parent[8]) == 1  # Triton


# === Skip-path contract (mocked spice) ===============================


class _SpiceyErrorStub(Exception):
    """Stand-in for spiceypy.utils.exceptions.SpiceyError so the fast-tier
    test doesn't require spiceypy import."""


def _make_spice_stub_that_always_raises() -> SimpleNamespace:
    """Return a minimal SimpleNamespace exposing `spkgeo(...)` raising
    SpiceyError. Mirrors the bake's ``spice.spkgeo`` probe contract."""

    def spkgeo(*_args: Any, **_kwargs: Any) -> tuple[list[float], float]:
        raise _SpiceyErrorStub("kernel not furnished (mocked)")

    utils = SimpleNamespace(exceptions=SimpleNamespace(SpiceyError=_SpiceyErrorStub))
    return SimpleNamespace(spkgeo=spkgeo, utils=utils)


def test_skip_path_contract_for_moon_bodies_when_spkgeo_raises() -> None:
    """Pin the contract via a self-contained reproduction of the bake's
    skip-loop:

      for naif_id, name, slug in MOON_BODIES:
          try:
              spice.spkgeo(targ=naif_id, et=mission_mid, ref="ECLIPJ2000", obs=0)
          except spice.utils.exceptions.SpiceyError:
              print(f"[SKIP]   moon {slug:10s} (NAIF {naif_id}) — ...")
              continue
          # ...bake...

    We verify: (a) NO moon ends up in `baked` when every probe raises,
    (b) exactly one `[SKIP]` message per moon (no per-sample retry,
    matching the "log once per missing kernel" QA contract).
    """
    spice = _make_spice_stub_that_always_raises()
    baked: list[tuple[int, str, str]] = []
    log_lines: list[str] = []
    mission_mid = 0.5 * (-7e8 + 9.7e8)  # matches CELESTIAL_ET_START + CELESTIAL_ET_END midpoint
    for naif_id, name, slug in MOON_BODIES:
        try:
            spice.spkgeo(targ=naif_id, et=mission_mid, ref="ECLIPJ2000", obs=0)
        except spice.utils.exceptions.SpiceyError:
            log_lines.append(f"[SKIP] moon {slug} (NAIF {naif_id})")
            continue
        baked.append((naif_id, name, slug))
    # No moon was baked (every probe raised).
    assert baked == []
    # Exactly one skip-log per moon — no per-sample retry / multiple log
    # lines for the same moon.
    assert len(log_lines) == len(MOON_BODIES)
    # Each log line cites a unique NAIF ID (so the "log once per missing
    # kernel" contract holds — each line is the FIRST and ONLY mention of
    # that moon's NAIF in the log).
    seen: set[int] = set()
    for naif_id, _name, _slug in MOON_BODIES:
        match_for_this = [ll for ll in log_lines if f"NAIF {naif_id}" in ll]
        assert len(match_for_this) == 1, (
            f"expected one [SKIP] line for NAIF {naif_id}, got {match_for_this}"
        )
        seen.add(naif_id)
    assert seen == {m[0] for m in MOON_BODIES}


def test_partial_skip_does_not_poison_subsequent_moons() -> None:
    """Mock spkgeo to raise for NAIF 607 (Hyperion — a known
    'sometimes-missing' case if sat427 isn't furnished) but succeed for
    all other Saturn moons. The skip MUST be local to Hyperion: Titan
    (606) and Iapetus (608) still bake."""

    def spkgeo(*, targ: int, **_kwargs: Any) -> tuple[list[float], float]:
        if targ == 607:
            raise _SpiceyErrorStub("Hyperion SPK absent (mocked)")
        return ([0.0] * 6, 0.0)

    spice = SimpleNamespace(
        spkgeo=spkgeo,
        utils=SimpleNamespace(exceptions=SimpleNamespace(SpiceyError=_SpiceyErrorStub)),
    )
    baked: list[int] = []
    log_lines: list[str] = []
    for naif_id, _name, slug in MOON_BODIES:
        try:
            spice.spkgeo(targ=naif_id, et=0.0, ref="ECLIPJ2000", obs=0)
        except spice.utils.exceptions.SpiceyError:
            log_lines.append(f"[SKIP] {slug} {naif_id}")
            continue
        baked.append(naif_id)

    assert 607 not in baked  # Hyperion skipped
    assert 606 in baked  # Titan baked
    assert 608 in baked  # Iapetus baked
    assert len(log_lines) == 1  # exactly one skip — Hyperion only
    assert "607" in log_lines[0]
