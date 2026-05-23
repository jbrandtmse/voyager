# Planet + skybox textures (Story 1.13)

This directory holds equirectangular-projection PNG textures for the Sun,
eight planets, Earth's Moon, and the Milky Way skybox. All textures are at
the **2k tier (2048 × 1024)**; the 4k tier + KTX2-Basis compression are
deferred to Story 4.3 (SOI entry — which already needs 8k textures and the
full Khronos KTX-Software toolchain).

## File naming

The slug-based naming + tier suffix is locked: `<body-slug>-<tier>.png`.
When Story 4.3 swaps to KTX2-Basis, only the extension changes
(`<body-slug>-<tier>.ktx2`) — no other call-site edits are needed. See
[`web/src/services/texture-loader.ts`](../../src/services/texture-loader.ts)
for the format-agnostic loader abstraction that absorbs that swap.

## Source + acquisition

All eleven textures and the Milky Way skybox come from **Solar System Scope**
(<https://www.solarsystemscope.com/textures>) under
[Creative Commons Attribution 4.0 International (CC-BY-4.0)](https://creativecommons.org/licenses/by/4.0/).
This source was chosen over Björn Jónsson's planetary maps because Jónsson's
explicit usage statement (`https://bjj.mmedia.is/data/planetary_maps.html`)
forbids redistribution: *"please do not place a copy of the maps on your
website"*. Solar System Scope's CC-BY-4.0 license explicitly permits
redistribution provided attribution is preserved.

## Compression pipeline

Each upstream JPG is converted to PNG via the script below. Most bodies
use a 256-color indexed palette (PNG-8) which produces a ~300-1.5 MB file;
Earth — the only planet with significant multi-hue content (oceans +
continents + ice caps) — is kept as PNG-24 for full 24-bit colour fidelity.
Mercury and Moon use 96 / 80-colour palettes to fit under the 1.5 MB
per-file target.

```python
# Conversion (Pillow):
from PIL import Image
img = Image.open(src).convert('RGB').resize((2048, 1024), Image.LANCZOS)
if body == 'earth':
    img.save(dst, 'PNG', optimize=True, compress_level=9)  # PNG-24
else:
    img.quantize(colors=256, method=Image.Quantize.MEDIANCUT,
                 dither=Image.Dither.FLOYDSTEINBERG).save(
        dst, 'PNG', optimize=True, compress_level=9
    )  # PNG-8 indexed
```

## Sizes (2026-05-19 acquisition)

| Body         | File              | Size (KB) | Palette  |
|--------------|-------------------|-----------|----------|
| Sun          | `sun-2k.png`      | 1,346     | PNG-8 (256) |
| Mercury      | `mercury-2k.png`  | 1,497     | PNG-8 (96)  |
| Venus        | `venus-2k.png`    |   852     | PNG-8 (256) |
| Earth        | `earth-2k.png`    | 1,418     | PNG-24      |
| Mars         | `mars-2k.png`     | 1,292     | PNG-8 (256) |
| Jupiter      | `jupiter-2k.png`  |   805     | PNG-8 (256) |
| Saturn       | `saturn-2k.png`   |   324     | PNG-8 (256) |
| Uranus       | `uranus-2k.png`   |    25     | PNG-8 (256) |
| Neptune      | `neptune-2k.png`  |   376     | PNG-8 (256) |
| Moon         | `moon-2k.png`     | 1,449     | PNG-8 (80)  |
| Milky Way    | `milky-way-2k.png`|   552     | PNG-8 (256) |
| **Total**    |                   | **~9.7 MB** |             |

Well under the 30-80 MB LFS budget approved for this story.

## Attribution

The full attribution + license text lives in [`THIRD_PARTY.md`](../../../THIRD_PARTY.md)
at the repository root. Distribution of this repository must preserve that
file.

## Story 4.3 follow-up (2026-05-23 — landed; partial)

Story 4.3 (SOI entry) was responsible for:

1. ~~Acquiring the 4k + 8k tiers from the same Solar System Scope sources.~~
   **LANDED 2026-05-23 (partial)** — 4K KTX2 tier shipped for all 4 gas
   giants. The 8K tier was DROPPED per a Rule 5 NFR-tripwire amendment:
   Solar System Scope's "8K" files are actually 4K dimensions, and no
   canonical upstream (NASA SVS / USGS Astrogeology / JPL Photojournal)
   ships ≥ 4K equirectangular cylindrical maps for the gas giants. See
   `THIRD_PARTY.md § Source-resolution cap (Story 4.3 Rule-5 amendment
   to AC4)` for the amendment + the `web/scripts/build_textures.ts`
   `GAS_GIANT_JOBS` docstring for the source-code breadcrumb.
2. ~~Converting all tiers to KTX2-Basis...~~ **LANDED 2026-05-23** —
   `web/scripts/build_textures.ts` transcodes via `toktx` UASTC + Basis
   Universal for gas-giant surfaces (ADR-0006 § Decision step 3 — UASTC
   for hero textures). Outputs committed as `<slug>-4k.ktx2`.
3. ~~Updating `TEXTURE_FILE_EXTENSION` in `texture-loader.ts` to `ktx2`.~~
   **LANDED 2026-05-23** — `TEXTURE_FILE_EXTENSION_BY_TIER` per-tier
   routing introduced (`'2k' → 'png'`, `'4k' | '8k' → 'ktx2'`). The
   legacy `TEXTURE_FILE_EXTENSION = 'png'` export is preserved.
4. ~~Removing the `texture-loader.ts` Story-4.3-deferral docstring.~~
   **LANDED 2026-05-23** — module docstring rewritten.
5. ~~Updating `selectTier` to actually map `'8k' | '4k'` → real tiers.~~
   **LANDED 2026-05-23 (with revision)** — `selectTier` still returns
   `'2k'` as the CRUISE default; the 4K upgrade fires explicitly on SOI
   entry via `RenderEngine.upgradePlanetTexture(bodyId, '4k')`. The
   per-encounter upgrade pattern (not boot-time) is documented in the
   `selectTier` docstring.

### Still pending — moon textures

The 12 outer-system moon textures (Io / Europa / Ganymede / Callisto /
Titan / Iapetus / Hyperion / Miranda / Ariel / Umbriel / Titania /
Oberon / Triton) are NOT yet procured. The moon 2K KTX2 tier awaits a
follow-up procurement clarification — see the Story 4.3 file's
"Clarification Needed (narrower — moons only)" block.

### Defense test status

The KTX2-deferral defense test in
[`web/tests/celestial-bodies-defense.test.ts`](../../tests/celestial-bodies-defense.test.ts)
was rewritten by Story 4.3 to lift the deferral cleanly: `KTX2Loader`
usage is now permitted in BOTH `src/render/spacecraft-models.ts` (Story
3.3 landing) AND `src/services/texture-loader.ts` (this Story-4.3
landing). New `KTX2Loader` consumers MUST be added to the whitelist with
an inline justification.
