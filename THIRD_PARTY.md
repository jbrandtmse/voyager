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
Story 1.13. Story 4.3's 4k + 8k tier acquisition is expected to add an
additional ~80-160 MB at the KTX2-Basis compression ratio.
