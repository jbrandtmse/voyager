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
