#!/usr/bin/env python3
"""
Voyager font subsetter — one-off pipeline for Story 1.7.

Subsets three OFL-licensed font sources into latin-only .woff2 files for
self-hosted typography under web/public/fonts/:

- JetBrains Mono Regular  (HUD / mono)
- Inter Regular           (UI sans)
- Source Serif 4 variable (chapter body serif; weight axis 350-600 only)

Unicode subset target: U+0020-007F (basic latin) plus the extended-latin
punctuation glyphs the UX spec calls for (em dash U+2014, en dash U+2013,
horizontal ellipsis U+2026, single + double smart quotes U+2018-201D,
non-breaking space U+00A0, en/em space U+2002-2003, narrow no-break space
U+202F, degree sign U+00B0 for "169 AU"-style HUD readouts).

This is not a runtime dep. It is a one-off run; the resulting .woff2 files
are committed and LFS-tracked. To re-run after a font upgrade:

    python scripts/font-subset.py

Inputs are expected at C:\\temp\\voyager-fonts\\ (the download script's
target). Outputs land in web/public/fonts/.

OFL license: each output file's source ships under the SIL Open Font
License 1.1. THIRD_PARTY.md tracks attribution at the repo root.
"""
from __future__ import annotations

import sys
from pathlib import Path

from fontTools.subset import Subsetter, Options, load_font, save_font


REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = Path("C:/temp/voyager-fonts")
OUTPUT_DIR = REPO_ROOT / "web" / "public" / "fonts"

# Latin + extended punctuation glyphs we actually use across the UI.
# Spec: UX spec §Design Tokens line ~614-617 (font stacks) + ~1100 (smart
# quotes / em dash / ellipsis in chapter copy).
SUBSET_UNICODES = (
    # U+0020-007E  — basic latin (printable ASCII)
    list(range(0x0020, 0x007F))
    + [
        0x00A0,  # NBSP
        0x00A9,  # ©
        0x00AE,  # ®
        0x00B0,  # ° (degree, used in HUD coords)
        0x00B7,  # · middle dot
        0x00D7,  # × multiplication sign (occurs in "1×" speed multiplier)
        0x2002,  # en space
        0x2003,  # em space
        0x2009,  # thin space
        0x200B,  # zero-width space
        0x2013,  # en dash
        0x2014,  # em dash
        0x2018,  # left single quote
        0x2019,  # right single quote / apostrophe
        0x201C,  # left double quote
        0x201D,  # right double quote
        0x2026,  # horizontal ellipsis
        0x202F,  # narrow no-break space
        0x2122,  # ™
        0x2212,  # − minus
    ]
)


def make_options(*, lean_layout: bool = False) -> Options:
    """Construct a fonttools subsetter Options block.

    `lean_layout=True` drops most OpenType layout features (keeps only
    `kern` + `mark`/`mkmk` for diacritic positioning). Used for the
    Source Serif 4 variable font where GPOS alone is ~90 KB; trimming
    layout features brings the whole woff2 under budget.
    """
    options = Options()
    # Drop hints — woff2 reflows them anyway and the table costs bytes.
    options.hinting = False
    # Preserve the name-table records the SIL OFL 1.1 expects to travel
    # with a redistributed font: family name (1), subfamily (2), unique ID
    # (3), full name (4), version (5), PostScript name (6), trademark (7),
    # manufacturer (8), description (10), vendor URL (11), designer (12),
    # license description (13), license info URL (14). Drop the rest
    # (sample text, WWS family/sub) for size.
    options.name_IDs = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14]
    options.layout_features = (
        ["kern", "mark", "mkmk", "ccmp"] if lean_layout else ["*"]
    )
    options.notdef_glyph = True
    options.notdef_outline = True
    options.recommended_glyphs = True
    options.drop_tables = ["DSIG"]
    # Best-effort woff2 compression.
    options.with_zopfli = True
    return options


def subset_static(
    src: Path,
    dst: Path,
    *,
    flavor: str = "woff2",
) -> int:
    """Subset a static font to the SUBSET_UNICODES range. Returns output size."""
    print(f"  [subset] {src.name} -> {dst.name}")
    options = make_options()
    options.flavor = flavor
    font = load_font(str(src), options)
    subsetter = Subsetter(options=options)
    subsetter.populate(unicodes=SUBSET_UNICODES)
    subsetter.subset(font)
    save_font(font, str(dst), options)
    font.close()
    return dst.stat().st_size


def subset_variable(
    src: Path,
    dst: Path,
    *,
    wght_min: float,
    wght_max: float,
    flavor: str = "woff2",
) -> int:
    """Subset a variable font: apply unicode subset first, then clip the
    weight axis. Doing the unicode pass before instancing keeps the gvar
    table consistent: instantiateVariableFont expects every glyph in its
    variation dict to still exist post-subset, so we shrink the glyph set
    first then rewrite the master axis on the smaller table.
    """
    print(f"  [subset] {src.name} -> {dst.name}  (wght: {wght_min}-{wght_max})")
    from fontTools.varLib.instancer import instantiateVariableFont  # type: ignore

    # Pass 1 — unicode subset on the variable font, preserving its
    # variable-font tables (fvar/gvar/HVAR). Save as woff2 only at the end.
    # Lean layout features keep the woff2 under 80 KB after axis-clip.
    options = make_options(lean_layout=True)
    options.flavor = None  # keep ttf in-memory; final flavor set on save
    font = load_font(str(src), options)
    subsetter = Subsetter(options=options)
    subsetter.populate(unicodes=SUBSET_UNICODES)
    subsetter.subset(font)

    # Pass 2 — clip the weight axis to [wght_min, wght_max]. Use the
    # AxisTriple form (min, default, max). The default within range is
    # interpolated; we pick 400 (regular) as the in-range default.
    default_wght = (wght_min + wght_max) / 2
    if not (wght_min <= 400 <= wght_max):
        default_wght = (wght_min + wght_max) / 2
    else:
        default_wght = 400
    font = instantiateVariableFont(
        font,
        {"wght": (wght_min, default_wght, wght_max)},
        inplace=True,
        optimize=True,
    )

    # Pass 3 — emit as woff2.
    save_options = make_options(lean_layout=True)
    save_options.flavor = flavor
    save_font(font, str(dst), save_options)
    font.close()
    return dst.stat().st_size


def main() -> int:
    if not SOURCE_DIR.exists():
        print(f"ERROR: source dir not found: {SOURCE_DIR}", file=sys.stderr)
        print(
            "Run scripts/font-acquire.ps1 first to download the source archives.",
            file=sys.stderr,
        )
        return 2

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    jbm_src = SOURCE_DIR / "jbm" / "fonts" / "ttf" / "JetBrainsMono-Regular.ttf"
    inter_src = SOURCE_DIR / "inter" / "extras" / "ttf" / "Inter-Regular.ttf"
    ss_src = (
        SOURCE_DIR
        / "source-serif"
        / "source-serif-4.005_Desktop"
        / "VAR"
        / "SourceSerif4Variable-Roman.ttf"
    )

    for src in [jbm_src, inter_src, ss_src]:
        if not src.exists():
            print(f"ERROR: missing input font: {src}", file=sys.stderr)
            return 3

    print("== Voyager font subset ==")
    print(f"  output: {OUTPUT_DIR}")
    print(f"  unicode glyphs: {len(SUBSET_UNICODES)} (latin + smart punct)")
    print()

    total = 0
    total += subset_static(
        jbm_src,
        OUTPUT_DIR / "jetbrains-mono-regular.woff2",
    )
    total += subset_static(
        inter_src,
        OUTPUT_DIR / "inter-regular.woff2",
    )
    total += subset_variable(
        ss_src,
        OUTPUT_DIR / "source-serif-4-variable.woff2",
        wght_min=350,
        wght_max=600,
    )

    print()
    print("== Output sizes ==")
    budget = 120 * 1024
    for f in sorted(OUTPUT_DIR.glob("*.woff2")):
        size = f.stat().st_size
        print(f"  {f.name:40s} {size:>8d} B  ({size / 1024:.1f} KB)")
    print(f"  {'TOTAL':40s} {total:>8d} B  ({total / 1024:.1f} KB)")
    print(f"  {'BUDGET':40s} {budget:>8d} B  ({budget / 1024:.1f} KB)")

    if total > budget:
        print(
            f"ERROR: font bundle exceeds 120 KB budget by {total - budget} B",
            file=sys.stderr,
        )
        return 4
    print(f"  OK — {(budget - total) / 1024:.1f} KB under budget")
    return 0


if __name__ == "__main__":
    sys.exit(main())
