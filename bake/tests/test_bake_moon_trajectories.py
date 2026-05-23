"""Story 4.11 slow-tier end-to-end test for moon trajectory bake.

Closes Rule 11 (build-pipeline E2E runtime test). Exercises the full bake
pipeline against the real satellite SPK kernels (`jup365.bsp`, `sat441.bsp`,
`ura184_part-3.bsp`, `nep097.bsp`) procured by Story 4.11, asserts that:

  AC4 T3.1:
  - The bake emits a VTRJ for every moon in `MOON_BODIES` (13 moons total).
  - Each VTRJ carries a sane body_id matching its NAIF entry.
  - Sampled positions land at the expected orbital range from the moon's
    parent planet (Galilean orbital ranges per the story's smoke-probe plan;
    Saturn/Uranus/Neptune ranges per `spkbrief` verification in T1.5).
  - Re-running the bake produces byte-identical output (NFR-R4
    determinism — same as the trajectory + attitude slow tiers).

Gated on satellite-SPK presence (size check against the manifest), so the
test skips cleanly in environments without `git lfs pull` for the satellite
SPKs (e.g., contributors who haven't fetched the ~2.3 GB satellite tier).
"""

from __future__ import annotations

import hashlib
import json
import struct
import sys
from pathlib import Path

import brotli
import pytest

BAKE_SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(BAKE_SRC))

REPO_ROOT = Path(__file__).resolve().parents[2]
KERNELS_MANIFEST = REPO_ROOT / "kernels" / "kernels-manifest.json"

SATELLITE_SPK_FILES = ("jup365.bsp", "sat441.bsp", "ura184_part-3.bsp", "nep097.bsp")


def _satellite_spks_present() -> bool:
    """True iff all four satellite SPKs are hydrated on disk (LFS-pulled).

    A minimum size threshold rules out tiny LFS pointer stubs (which are
    ~130 bytes) — the smallest real satellite SPK is `nep097.bsp` at
    ~105 MB, so a 1 MB floor is comfortably above any LFS pointer.
    """
    if not KERNELS_MANIFEST.exists():
        return False
    data = json.loads(KERNELS_MANIFEST.read_text(encoding="utf-8"))
    spk_index = {k["file"]: k for k in data.get("kernels", []) if k.get("kind") == "spk"}
    for spk_name in SATELLITE_SPK_FILES:
        entry = spk_index.get(spk_name)
        if entry is None:
            return False
        path = REPO_ROOT / entry["target_path"]
        if not path.exists() or path.stat().st_size < 1_000_000:
            return False
    return True


pytestmark = pytest.mark.skipif(
    not _satellite_spks_present(),
    reason=(
        "satellite SPK kernels missing on disk — run `git lfs pull && just fetch-kernels` "
        "to hydrate jup365.bsp / sat441.bsp / ura184_part-3.bsp / nep097.bsp"
    ),
)


# Expected MOON_BODIES roster from bake_trajectories.py
EXPECTED_MOON_NAIFS = {501, 502, 503, 504, 606, 607, 608, 701, 702, 703, 704, 705, 801}
EXPECTED_MOON_SLUGS = {
    "io",
    "europa",
    "ganymede",
    "callisto",
    "titan",
    "hyperion",
    "iapetus",
    "ariel",
    "umbriel",
    "titania",
    "oberon",
    "miranda",
    "triton",
}

# Per-moon expected orbital-range bounds at mission-midpoint ET (km from the
# parent planet's barycenter). These ranges encompass the moon's full orbit
# at typical Voyager-era distances; they're deliberately wide to avoid
# false-positive failures from the bake's mission-midpoint probe (1990s)
# vs. the test's later probe ET (varies by moon's orbital period). Sourced
# from the T1.5 verification run at each encounter anchor:
#   Io 423k, Europa 670k, Ganymede 1.07M, Callisto 1.88M  (km from Jupiter)
#   Titan 1.21M, Hyperion 1.46M, Iapetus 3.57M           (km from Saturn)
#   Miranda 130k, Ariel 191k, Umbriel 266k, Titania 437k, Oberon 583k  (km from Uranus)
#   Triton 354k                                          (km from Neptune)
EXPECTED_ORBITAL_RANGE_KM: dict[int, tuple[float, float]] = {
    501: (350_000, 500_000),  # Io
    502: (600_000, 730_000),  # Europa
    503: (1_000_000, 1_150_000),  # Ganymede
    504: (1_700_000, 2_000_000),  # Callisto
    606: (1_100_000, 1_300_000),  # Titan
    607: (1_300_000, 1_600_000),  # Hyperion (chaotic orbit allows wider bounds)
    608: (3_300_000, 3_800_000),  # Iapetus
    701: (150_000, 230_000),  # Ariel
    702: (220_000, 310_000),  # Umbriel
    703: (380_000, 490_000),  # Titania
    704: (530_000, 640_000),  # Oberon
    705: (100_000, 160_000),  # Miranda
    801: (290_000, 410_000),  # Triton
}


@pytest.fixture(scope="module")
def moon_bake_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Run the trajectory bake once per module; subsequent tests inspect outputs."""
    from bake_trajectories import bake  # noqa: WPS433

    out_dir = tmp_path_factory.mktemp("moon_traj_bake")
    rc = bake(root=REPO_ROOT, out_dir=out_dir)
    assert rc == 0, "trajectory bake failed (prerequisite for moon assertions)"
    return out_dir


@pytest.mark.slow
def test_all_thirteen_moon_vtrjs_emitted(moon_bake_dir: Path) -> None:
    """T3.1 — every moon in MOON_BODIES gets a `<slug>.bin.br` VTRJ.

    The bake's graceful-skip path (`SpiceyError → [SKIP]`) MUST be
    replaced by real outputs once the satellite SPKs are furnished —
    that's the load-bearing assertion for AC2.
    """
    moon_files = {p.stem.split(".")[0]: p for p in moon_bake_dir.glob("*.bin.br")}
    missing = EXPECTED_MOON_SLUGS - set(moon_files.keys())
    assert missing == set(), (
        f"moon VTRJs missing after bake: {sorted(missing)}; "
        f"got slugs: {sorted(moon_files.keys())}"
    )


@pytest.mark.slow
def test_moon_vtrjs_carry_expected_naif_body_ids(moon_bake_dir: Path) -> None:
    """T3.1 — each moon VTRJ's body_id matches MOON_BODIES.

    Locks the vtrj_writer Story 4.11 allow-list extension (MOON_BODY_IDS).
    A typo or transposed NAIF in MOON_BODIES would surface here.
    """
    slug_to_naif = {
        "io": 501,
        "europa": 502,
        "ganymede": 503,
        "callisto": 504,
        "titan": 606,
        "hyperion": 607,
        "iapetus": 608,
        "ariel": 701,
        "umbriel": 702,
        "titania": 703,
        "oberon": 704,
        "miranda": 705,
        "triton": 801,
    }
    header_struct = struct.Struct("<4sHiddId2s")
    for slug, expected_naif in slug_to_naif.items():
        vtrj_path = moon_bake_dir / f"{slug}.bin.br"
        assert vtrj_path.exists(), f"{slug}.bin.br missing"
        decompressed = brotli.decompress(vtrj_path.read_bytes())
        header_tuple = header_struct.unpack_from(decompressed, 0)
        body_id = header_tuple[2]
        assert body_id == expected_naif, (
            f"{slug}.bin.br: expected body_id={expected_naif}, got {body_id}"
        )


@pytest.mark.slow
def test_moon_positions_land_at_expected_orbital_range(moon_bake_dir: Path) -> None:
    """T3.1 — sampled positions are in the moon's expected orbital range from
    its parent planet's barycenter.

    Reads the first sample of each moon VTRJ and asserts
    `|pos - parent_barycenter_pos|` falls inside EXPECTED_ORBITAL_RANGE_KM.
    This is the load-bearing assertion that the moons aren't stacked at
    their parent planet's heliocentric coords (the Story 4.3 graceful-skip
    behaviour), proving AC3's "real position, not null" gate at the bake
    tier.
    """
    header_struct = struct.Struct("<4sHiddId2s")
    body_struct = struct.Struct("<6d")

    # First read each planet barycenter's first sample (parent reference frame).
    # The barycenter VTRJs carry the same heliocentric state vectors via
    # CELESTIAL_BODIES, so we can read them with the same header+body layout.
    parent_pos: dict[int, tuple[float, float, float]] = {}
    for parent_naif, parent_slug in [(5, "jupiter"), (6, "saturn"), (7, "uranus"), (8, "neptune")]:
        path = moon_bake_dir / f"{parent_slug}.bin.br"
        decompressed = brotli.decompress(path.read_bytes())
        body_id = header_struct.unpack_from(decompressed, 0)[2]
        assert body_id == parent_naif, f"{parent_slug}.bin.br body_id mismatch"
        first_sample = body_struct.unpack_from(decompressed, header_struct.size)
        parent_pos[parent_naif] = (first_sample[0], first_sample[1], first_sample[2])

    slug_to_naif = {
        "io": 501,
        "europa": 502,
        "ganymede": 503,
        "callisto": 504,
        "titan": 606,
        "hyperion": 607,
        "iapetus": 608,
        "ariel": 701,
        "umbriel": 702,
        "titania": 703,
        "oberon": 704,
        "miranda": 705,
        "triton": 801,
    }

    for slug, naif in slug_to_naif.items():
        parent_naif = naif // 100
        parent_x, parent_y, parent_z = parent_pos[parent_naif]
        path = moon_bake_dir / f"{slug}.bin.br"
        decompressed = brotli.decompress(path.read_bytes())
        first_sample = body_struct.unpack_from(decompressed, header_struct.size)
        moon_x, moon_y, moon_z = first_sample[0], first_sample[1], first_sample[2]
        dx, dy, dz = moon_x - parent_x, moon_y - parent_y, moon_z - parent_z
        distance_km = (dx * dx + dy * dy + dz * dz) ** 0.5
        lower, upper = EXPECTED_ORBITAL_RANGE_KM[naif]
        assert lower <= distance_km <= upper, (
            f"{slug} (NAIF {naif}): distance from parent barycenter "
            f"{parent_naif} = {distance_km:.0f} km, expected [{lower}, {upper}] km; "
            f"the moon may be incorrectly stacked at its parent's heliocentric coords."
        )


@pytest.mark.slow
def test_moon_bake_determinism(
    moon_bake_dir: Path, tmp_path_factory: pytest.TempPathFactory
) -> None:
    """NFR-R4 — re-baking moons yields byte-identical SHA-256 per file.

    Mirrors `test_bake_attitude_slow.test_attitude_bake_determinism` for the
    trajectory tier specifically applied to moons. Catches accidental
    nondeterminism from spkgeo state-vector floats / brotli compressor
    nondeterminism / numpy sample-grid drift.
    """
    from bake_trajectories import bake  # noqa: WPS433

    out_b = tmp_path_factory.mktemp("moon_traj_bake_rerun")
    rc = bake(root=REPO_ROOT, out_dir=out_b)
    assert rc == 0

    moon_slugs = sorted(EXPECTED_MOON_SLUGS)
    for slug in moon_slugs:
        path_a = moon_bake_dir / f"{slug}.bin.br"
        path_b = out_b / f"{slug}.bin.br"
        assert path_a.exists() and path_b.exists(), f"{slug}.bin.br missing in one of the two bakes"
        sha_a = hashlib.sha256(path_a.read_bytes()).hexdigest()
        sha_b = hashlib.sha256(path_b.read_bytes()).hexdigest()
        assert sha_a == sha_b, (
            f"{slug}.bin.br: byte-determinism broken — "
            f"sha_a={sha_a[:12]}... vs sha_b={sha_b[:12]}..."
        )


@pytest.mark.slow
def test_moon_entries_present_in_manifest(moon_bake_dir: Path) -> None:
    """AC2 — `bake/out/manifest.json` carries an entry per moon with a
    `trajectory` file URL pointing at the `<slug>.bin.br` artifact.

    Locks the producer↔runtime contract: the EphemerisService loads
    `manifest.json` and indexes by body_id; missing entries would silently
    skip the moon at runtime (the same defect Story 4.11 set out to fix at
    bake time).
    """
    manifest_path = moon_bake_dir / "manifest.json"
    assert manifest_path.exists(), "bake did not emit manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    body_index = {b["naifId"]: b for b in manifest["bodies"]}
    for naif in EXPECTED_MOON_NAIFS:
        assert naif in body_index, f"moon NAIF {naif} missing from manifest.json bodies"
        files = body_index[naif]["files"]
        traj_files = [f for f in files if f["kind"] == "trajectory"]
        assert traj_files, f"moon NAIF {naif} has no trajectory file in manifest"
