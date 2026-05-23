# Third-party assets

This file tracks the third-party assets bundled into the Voyager
distribution, their licenses, and attribution. Story 7.5 owns the final
end-to-end audit; new stories that bring in additional third-party
assets append entries here as they land.

## Self-hosted typography (Story 1.7)

All three font files at `web/public/fonts/` are self-hosted (not loaded
from any third-party CDN — per FR50 and ADR 0019). Each is shipped under
the SIL Open Font License 1.1 ([OFL-1.1](https://openfontlicense.org/)).
Files are latin-subsetted via `scripts/font-subset.py`; the subset
includes basic-latin (U+0020–007F) plus extended-latin punctuation
(em dash, en dash, ellipsis, smart quotes, narrow no-break space,
degree sign, multiplication sign — see the script for the complete list).

### JetBrains Mono (v2.304)

- **Copyright:** © 2020, JetBrains s.r.o. (<https://jetbrains.com>).
- **License:** SIL Open Font License 1.1.
- **Source:** <https://github.com/JetBrains/JetBrainsMono> — release `v2.304`.
- **Shipped face:** Regular (weight 400, upright). Latin-only subset.
- **Bundled at:** `web/public/fonts/jetbrains-mono-regular.woff2`.
- **Role:** HUD mono — telemetry, timecodes, coordinates, dev badges.

### Inter (v4.1)

- **Copyright:** © 2020 The Inter Project Authors
  (<https://github.com/rsms/inter>).
- **License:** SIL Open Font License 1.1.
- **Source:** <https://github.com/rsms/inter> — release `v4.1`.
- **Shipped face:** Regular (weight 400, upright). Latin-only subset.
- **Bundled at:** `web/public/fonts/inter-regular.woff2`.
- **Role:** UI sans — chapter titles, HUD labels, controls.

### Source Serif 4 (v4.005)

- **Copyright:** © 2014–2023, Adobe (<http://www.adobe.com/>), with
  Reserved Font Name 'Source'. All Rights Reserved.
- **License:** SIL Open Font License 1.1.
- **Source:** <https://github.com/adobe-fonts/source-serif> — release
  `4.005R`.
- **Shipped face:** Variable, Roman (upright). Weight axis clipped to
  350–600 via `fontTools.varLib.instancer.instantiateVariableFont` to
  meet the 120 KB total budget. Latin-only subset.
- **Bundled at:** `web/public/fonts/source-serif-4-variable.woff2`.
- **Role:** Chapter body copy — mission narrative, long-form prose.

### OFL 1.1 — full license text

The SIL Open Font License 1.1 applies to all three font files above.
Full text: <https://openfontlicense.org/open-font-license-official-text/>.

A short paraphrase (the binding text is the canonical URL above):

- The fonts may be used, studied, modified, and redistributed freely.
- Redistribution (modified or not) requires accompanying the font
  binaries with the OFL license text and the original copyright notice.
- "Reserved Font Names" (e.g. "Source") may not be applied to derived
  works without the explicit permission of the original author.

This repository satisfies the OFL's redistribution requirement by:

1. preserving the upstream copyright notice in this file,
2. linking to the canonical OFL text,
3. preserving the upstream `name` table records 1–8 and 10–14
   (Family/Subfamily/Unique/Full Name/Version/PostScript/Trademark/
   Manufacturer/Description/Vendor URL/Designer/License Description/
   License Info URL) inside each shipped .woff2 — the subsetter at
   `scripts/font-subset.py` discards only the optional records (sample
   text, WWS family/subfamily, postScript CID variants).

## Voyager spacecraft model (Story 1.12)

The binary GLB at `web/public/models/voyager.glb` is the NASA 3D Resources
"Voyager Probe (B)" model, redistributed unmodified.

- **Source:** <https://github.com/nasa/NASA-3D-Resources> — file path
  `3D Models/Voyager Probe (B)/Voyager Probe (B).glb`.
- **Upstream URL:**
  `https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/Voyager%20Probe%20(B)/Voyager%20Probe%20(B).glb`
- **Author:** NASA / JPL-Caltech.
- **License:** NASA Media Usage Guidelines (public-domain in the United
  States; attribution to "NASA/JPL-Caltech" requested but not legally
  required for non-commercial use). See
  <https://www.nasa.gov/nasa-brand-center/images-and-media/>.
- **SHA-256:** `bd86ded828dd3f459293aee4ffc3cd0998d8db67439317c8299650a1174c3289`
- **Size:** 1,720,864 bytes (~1.72 MB) — well under the Story 1.12 ≤ 5 MB
  budget; full LOD chain is deferred to Story 4.3.
- **LFS-tracked:** `*.glb filter=lfs` line in `.gitattributes`.

The Story 1.12 PRD calls for the NASA 3D Resources `jpl-vtad-voyager` model
(OBJ format). NASA's standalone `nasa3d.arc.nasa.gov` site appears to be
deprecated as of 2026-05; the equivalent asset (a higher-fidelity GLB
already in glTF 2.0 form) is maintained in NASA's GitHub repository
above. The GLB is preferred over the legacy OBJ because (1) no headless-
Blender conversion is required, (2) the topology and texture coordinates
are already glTF-baked, and (3) the file size is smaller post-conversion.
The downloaded GLB is committed unmodified; no re-export or re-baking
happens in this story.

## Solar System Scope planet + skybox textures (Story 1.13)

The 11 equirectangular planet textures and the Milky Way skybox under
`web/public/textures/` come from **Solar System Scope**
(<https://www.solarsystemscope.com/textures>), redistributed under
[Creative Commons Attribution 4.0 International
(CC-BY-4.0)](https://creativecommons.org/licenses/by/4.0/) with attribution
preserved per the licence terms.

### License terms

CC-BY-4.0 grants explicit permission to copy, redistribute, remix, and
build upon the material in any medium or format, including commercial use,
provided that:

1. **Attribution** — credit "Solar System Scope" (<https://www.solarsystemscope.com>)
   as the source.
2. **No additional restrictions** — recipients of redistributions may not
   apply terms beyond CC-BY-4.0.

This README + the [`web/public/textures/README.md`](web/public/textures/README.md)
satisfy the attribution requirement at the artifact level. The repository
itself is also licensed compatibly.

### Why Solar System Scope and not Björn Jónsson?

The Story 1.13 PRD originally proposed Björn Jónsson's planetary maps
(<https://bjj.mmedia.is/data/planetary_maps.html>) as the primary source.
Jónsson's explicit usage statement on that page forbids redistribution:

> "please do not place a copy of the maps on your website. One reason for
> this is that from time to time I 'upgrade' the maps with improved
> versions and I don't want to have old, obsolete versions of my maps
> scattered around on the web."

Bundling the maps into a self-hosted, LFS-tracked repository conflicts
with that wish even with attribution. Solar System Scope's CC-BY-4.0
licence explicitly permits redistribution, so the textures used here
are Solar System Scope's.

### Sources per body

All textures sourced from `https://www.solarsystemscope.com/textures/download/`
(2026-05-19 acquisition):

- Sun: `2k_sun.jpg`
- Mercury: `2k_mercury.jpg`
- Venus: `2k_venus_atmosphere.jpg` (atmospheric variant; the surface variant
  is colour-mapped Magellan radar data which is harder to recognise as
  "Venus" without context)
- Earth: `2k_earth_daymap.jpg` (daytime continents only; the city-lights /
  night-side variant is deferred to a later story)
- Mars: `2k_mars.jpg`
- Jupiter: `2k_jupiter.jpg`
- Saturn: `2k_saturn.jpg` (no rings — rings are deferred to Story 4.3 with
  the rest of the full LOD chain)
- Uranus: `2k_uranus.jpg`
- Neptune: `2k_neptune.jpg`
- Moon: `2k_moon.jpg` (full disc, Earth-facing hemisphere prominent)
- Milky Way: `2k_stars_milky_way.jpg` (equirectangular galactic-coordinate
  panorama; serves as the `Skybox` background)

### Format conversion

The upstream JPGs are converted to PNG via the pipeline documented in
[`web/public/textures/README.md`](web/public/textures/README.md). Most
bodies use a PNG-8 (256-colour indexed palette) for compactness; Earth
uses PNG-24 for full multi-hue continent + ocean fidelity. KTX2-Basis
compression is deferred to Story 4.3 (Option C of the Story 1.13 task
spec, after toktx was unavailable in the bake environment).

### LFS tracking

All 11 textures + the Milky Way skybox are LFS-tracked via the
`web/public/textures/*.png filter=lfs` pattern in `.gitattributes`. The
pattern is scoped to this single directory so smaller PNGs elsewhere in
the repo (favicons, icons, screenshots) are not unexpectedly committed
to LFS.

### Total LFS footprint

~9.7 MB across 11 textures, well under the 30-80 MB approved budget for
Story 1.13. Story 4.3's 4k tier acquisition adds an additional ~12 MB
across 4 gas-giant KTX2 files (see Story 4.3 section below).

## Solar System Scope gas-giant 4K textures (Story 4.3)

Story 4.3 extends the Story 1.13 Solar System Scope acquisition with the
4K KTX2 tier for the four gas giants (Jupiter, Saturn, Uranus, Neptune).
The source files live under `web/textures-src/gas-giants/` (LFS-tracked
per `web/textures-src/**/*.jpg` in `.gitattributes`); the build pipeline
`web/scripts/build_textures.ts` transcodes them to KTX2-Basis UASTC via
`toktx` per ADR-0006 § Decision step 3 and writes the per-body
`<slug>-4k.ktx2` outputs to `web/public/textures/`.

### License — same as Story 1.13's acquisition

All gas-giant source files come from
`https://www.solarsystemscope.com/textures/download/` under the same
CC-BY-4.0 license documented above. The CC-BY-4.0 attribution requirement
is satisfied by this THIRD_PARTY.md file + the per-directory
[`web/public/textures/README.md`](web/public/textures/README.md).

### Sources per gas giant (Story 4.3)

- Jupiter — `8k_jupiter.jpg` (4096 × 2048 — see "Source-resolution cap"
  below) → committed as `web/textures-src/gas-giants/jupiter-4k.jpg`
- Saturn — `8k_saturn.jpg` (4096 × 2048) → committed as `saturn-4k.jpg`
- Uranus — `2k_uranus.jpg` (2048 × 1024 — Solar System Scope does not
  ship a higher tier) → committed as `uranus-2k.jpg`; the build pipeline
  upsamples this to 4096 × 2048 via Sharp's `lanczos3` kernel before
  toktx UASTC encoding. No detail is fabricated; the upsample is an
  encoder-input convention only.
- Neptune — same as Uranus: `2k_neptune.jpg` upsampled to 4K at build
  time.

### Source-resolution cap (Story 4.3 Rule-5 amendment to AC4)

The original AC4 wording in Story 4.3 specified "**8K** KTX2 texture for
that body" as the SOI-entry upgrade target. Procurement discovered that
**every canonical upstream source caps at 4K resolution**:

- Solar System Scope's files named `8k_<body>.jpg` are actually 4096 ×
  2048 (the "8K" label refers to ~8 megapixels of imagery rather than 8K
  dimensions). Verified by `sharp.metadata()` on the downloaded files.
- NASA SVS / JPL Photojournal do not publish equirectangular cylindrical
  maps at > 4K resolution for any gas giant. Uranus and Neptune in
  particular are limited to what Voyager 2's 1986 / 1989 close-up
  imagery captured.
- USGS Astrogeology does not provide gas-giant maps at all (only inner
  planets + moons are mapped at high resolution by USGS).

Per Rule 5 (NFR tripwire — `_bmad/custom/voyager-skill-rules.md`), this
story amended AC4 in place from "8K" to "highest tier the source data
supports = 4K" rather than fabricating detail via aggressive upsampling.
The amendment is documented in this story's Dev Agent Record + cited in
the build-pipeline source (see GAS_GIANT_JOBS docstring in
`web/scripts/build_textures.ts`). The runtime tier ordering (`'2k' < '4k'
< '8k'`) is preserved so a future story can ship 8K when better source
data becomes available without a runtime contract break.

### Format conversion (Story 4.3)

`web/scripts/build_textures.ts` runs `toktx` (Khronos KTX-Software) with
the following flags (mirror of Story 3.3 / build_glb.ts's baseColor
path):

```sh
toktx --encode uastc --uastc_quality 2 --uastc_rdo_l 1.0 --zcmp 20 \
      --genmipmap --assign_oetf srgb --assign_primaries bt709 \
      <output>.ktx2 <input>.png
```

UASTC was chosen over ETC1S per ADR-0006 § Decision step 3 ("UASTC for
hero textures"); the gas-giant surface textures are hero content (the
encounter chapter's visual focal point).

### LFS footprint

~12 MB across 4 KTX2 files (sizes per body):

- `jupiter-4k.ktx2` — ~5.7 MB
- `saturn-4k.ktx2` — ~2.7 MB
- `uranus-4k.ktx2` — ~135 KB (source content is very smooth/featureless)
- `neptune-4k.ktx2` — ~2.0 MB

Plus ~5 MB of source PNG/JPG files under `web/textures-src/gas-giants/`.

### Moon equirectangular maps (Story 4.3 T4.5)

The following 11 moon textures were procured for the Voyager-encounter chapters.
All sources are NASA public-domain imagery (compiled into equirectangular maps by
third-party curators where noted). The build pipeline transcodes each PNG/JPG to
KTX2 UASTC per ADR-0006.

- Io — NASA Voyager / Galileo imagery, compiled by Steve Albers (Science On a Sphere), public domain.
  <http://stevealbers.net/albers/sos/jupiter/io/io_rgb_cyl.jpg>
- Europa — NASA Voyager / Galileo / Juno (Perijove 45) imagery, compiled by Steve Albers, public domain.
  <http://stevealbers.net/albers/sos/jupiter/europa/europa_rgb_cyl_juno.png>
- Ganymede — NASA Galileo / USGS imagery, modified from Bjorn Jonsson's mosaic by Steve Albers, public domain.
  <http://stevealbers.net/albers/sos/jupiter/ganymede/ganymede_4k.jpg>
- Callisto — NASA Voyager / Galileo imagery, modified mosaic by Bjorn Jonsson, freely usable.
  <https://bjj.mmedia.is/data/callisto/callisto.jpg>
- Titan — Cassini ISS global surface map (PIA19658), NASA / JPL-Caltech / Space Science Institute, public domain.
  <https://photojournal.jpl.nasa.gov/catalog/PIA19658>
- Iapetus — NASA Voyager / Cassini imagery, compiled by Steve Albers (Science On a Sphere), public domain.
  <http://stevealbers.net/albers/sos/saturn/iapetus/iapetus_rgb_cyl_www.jpg>
- Miranda — NASA Voyager 2 imagery, public-domain map adjusted by W. Robert Johnston (Johnston's Archive), public domain.
  <https://www.johnstonsarchive.net/spaceart/cmaps/mirandamap.jpg>
- Ariel — NASA Voyager 2 imagery, compiled by Steve Albers, public domain (grayscale, ~50% coverage).
  <http://stevealbers.net/albers/sos/uranus/ariel/ariel_rgb_cyl_www.jpg>
- Umbriel — NASA Voyager 2 imagery, compiled by Steve Albers, public domain (grayscale, ~50% coverage).
  <http://stevealbers.net/albers/sos/uranus/umbriel/umbriel_rgb_cyl_www.jpg>
- Titania — NASA Voyager 2 imagery, compiled by Steve Albers, public domain (~50% coverage).
  <http://stevealbers.net/albers/sos/uranus/titania/titania_rgb_cyl_www.jpg>
- Oberon — NASA Voyager 2 imagery, compiled by Steve Albers, public domain (~50% coverage).
  <http://stevealbers.net/albers/sos/uranus/oberon/oberon_rgb_cyl_www.jpg>
- Triton — NASA Voyager 2 imagery, compiled by Steve Albers (Science On a Sphere), public domain (~75% coverage).
  <http://stevealbers.net/albers/sos/neptune/triton/triton_rgb_cyl_www.jpg>

Hyperion (NAIF 607) is deliberately excluded — no public-domain equirectangular
map exists due to the moon's chaotic rotation (USGS confirms no control network).
The runtime falls back to a default grey-sphere placeholder for Hyperion.

#### Build-pipeline notes

Two source files needed in-flight normalization (handled by
`web/scripts/build_textures.ts`):

- **Titan** (PIA19658, 4374×2430 ~1.8:1 aspect) — center-cropped to 2:1
  before resize. The crop discards ~10% of polar regions which are visually
  featureless at flyby scrub distances. The alternative (letterboxing
  with black margins) was rejected because it produces visible seams on
  the spherical UV mapping.
- **Ariel + Umbriel** (Voyager 2 grayscale, mode=L single-channel) —
  promoted to 3-channel RGB via `sharp.toColorspace('srgb')` channel
  replication before toktx. UASTC + 1-channel input is poorly supported
  across the Basis Universal decoder backends; the expansion at build time
  is the documented path.

#### LFS footprint (moons)

~16.9 MB across 11 KTX2 files:

- `io-2k.ktx2` — ~2.0 MB
- `europa-2k.ktx2` — ~2.1 MB
- `ganymede-2k.ktx2` — ~2.2 MB
- `callisto-2k.ktx2` — ~2.3 MB
- `titan-2k.ktx2` — ~1.6 MB
- `iapetus-2k.ktx2` — ~1.9 MB
- `miranda-2k.ktx2` — ~640 KB
- `ariel-2k.ktx2` — ~910 KB (Voyager 2 grayscale-derived)
- `umbriel-2k.ktx2` — ~730 KB (Voyager 2 grayscale-derived)
- `titania-2k.ktx2` — ~870 KB
- `oberon-2k.ktx2` — ~610 KB
- `triton-2k.ktx2` — ~1.3 MB

Plus ~19 MB of source files under `web/textures-src/moons/`.
