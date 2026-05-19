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

## Story 4.3 follow-up

Story 4.3 (SOI entry) is responsible for:
1. Acquiring the 4k + 8k tiers from the same Solar System Scope sources.
2. Converting all tiers to KTX2-Basis (ETC1S for skybox, UASTC for surface
   textures) via `toktx` from the Khronos KTX-Software toolkit.
3. Updating `TEXTURE_FILE_EXTENSION` in `texture-loader.ts` to `ktx2`.
4. Removing the `texture-loader.ts` Story-4.3-deferral docstring.
5. Updating `selectTier` to actually map `'8k' | '4k'` → real tiers.

The defense test in
[`web/tests/celestial-bodies-defense.test.ts`](../../tests/celestial-bodies-defense.test.ts)
locks the KTX2 deferral; it fails when Story 4.3 begins, signalling the
hand-off.
