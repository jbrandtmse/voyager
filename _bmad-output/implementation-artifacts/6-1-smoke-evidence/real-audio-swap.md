# Story 6.1 follow-up patch — real Golden Record audio swap (smoke evidence)

Date: 2026-05-24
Branch: `epic6`
Author: procurement+encoding agent (Claude Opus 4.7)

## Summary

Story 6.1 (commit `a40fed1`) shipped with five silent AAC-LC placeholder
tracks at `web/public/audio/golden-record/*.m4a` because the original
dev's procurement pass hit a 302 redirect from JPL's canonical Voyager
Golden Record asset URLs. Maintainer authorized real-audio procurement;
this patch swaps the placeholders for real NASA-public-domain content
sourced from the canonical NASA-hosted asset directory at
`voyager.jpl.nasa.gov/assets/audio/golden-record/`, fetched via the
Internet Archive's Wayback Machine (the live JPL host still 302s to a
missing-page placeholder).

## Source URLs (per track)

All five sources are from `voyager.jpl.nasa.gov/assets/audio/golden-record/`,
fetched via Wayback Machine `if_/` (raw) snapshots. Upstream
`Last-Modified: 2017-08-09` and `x-archive-orig-server: Apache` headers
confirm NASA-JPL upstream provenance.

| Slug              | NASA asset    | Wayback snapshot URL                                                                                                  |
|-------------------|---------------|-----------------------------------------------------------------------------------------------------------------------|
| `launch-v1`       | `english.au`  | <https://web.archive.org/web/20210319024735if_/https://voyager.jpl.nasa.gov/assets/audio/golden-record/english.au>    |
| `launch-v2`       | `arabic.au`   | <https://web.archive.org/web/20210318135029if_/https://voyager.jpl.nasa.gov/assets/audio/golden-record/arabic.au>     |
| `pale-blue-dot`   | `wind.wav`    | <https://web.archive.org/web/20210318210632if_/https://voyager.jpl.nasa.gov/assets/audio/golden-record/wind.wav>      |
| `v1-heliopause`   | `life.wav`    | <https://web.archive.org/web/20210320094802if_/https://voyager.jpl.nasa.gov/assets/audio/golden-record/life.wav>      |
| `v2-heliopause`   | `spheres.wav` | <https://web.archive.org/web/20210320094756if_/https://voyager.jpl.nasa.gov/assets/audio/golden-record/spheres.wav>   |

## License confirmation

NASA's standard media usage statement, accessed 2026-05-24 at
<https://www.nasa.gov/nasa-brand-center/images-and-media/>:

> "NASA content – images, audio, video, and media files used in the
> rendition of 3-dimensional models, such as texture maps and polygon
> data in any format – generally are not subject to copyright in the
> United States."

All five tracks fall inside the NASA-produced cohort (Cornell-recorded
greetings donated to NASA + JPL/NASA "Sounds of Earth" mission
recordings). The encumbered cohort (Bach Munich Bach Orchestra 1971,
Beethoven Otto Klemperer ~1955, Blind Willie Johnson 1927, Stravinsky
1959, etc. — 20th-century commercial recordings with separate
performance rights) was deliberately excluded from this procurement.

## Encoding command lines

```
ffmpeg-static path: C:/git/Voyager/web/node_modules/ffmpeg-static/ffmpeg.exe
  (installed via `cd web && npm install --no-save ffmpeg-static`)

ffmpeg -y -i english.au  -ac 1 -ar 44100 -c:a aac -b:a 96k launch-v1.m4a
ffmpeg -y -i arabic.au   -ac 1 -ar 44100 -c:a aac -b:a 96k launch-v2.m4a
ffmpeg -y -i wind.wav    -ac 1 -ar 44100 -c:a aac -b:a 96k pale-blue-dot.m4a
ffmpeg -y -i life.wav    -ac 1 -ar 44100 -c:a aac -b:a 96k v1-heliopause.m4a
ffmpeg -y -i spheres.wav -ac 1 -ar 44100 -c:a aac -b:a 96k v2-heliopause.m4a
```

Output format per file (verified via `ffmpeg -i <out>.m4a`):

```
major_brand     : M4A
Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp, 94-97 kb/s
```

## Final file sizes + checksums

| Slug              | Duration | Final size | Source SHA-256                                                       | Final SHA-256                                                       |
|-------------------|----------|------------|----------------------------------------------------------------------|---------------------------------------------------------------------|
| `launch-v1`       | 4.27 s   | 53,339 B   | `43893d11b645d63258d056d5e542789055c3092038bbaac0cedcceb2d00072e7`   | `64c171e549aeffc57403d020c10bbafc0871c9b4fd8f7cec9e1bc9237d5517ec`  |
| `launch-v2`       | 6.01 s   | 75,294 B   | `0f31bf782342e412f37751ce0cf1095454184b02c1832adf3e3383a7b99350a8`   | `9600db0511ff63aa8df356d7fd760a25ceca0da9226f9b6feaa44291fb1daae3`  |
| `pale-blue-dot`   | 97.73 s  | 1,182,615 B| `d1c7722fe70a388c8765889baed7acb93d8cee0a88f408ffb0272b2c6ed00e1b`   | `51de466560dd8974bd1d296f2b6aff0bc524aae1f790963330550bea15c02924`  |
| `v1-heliopause`   | 51.03 s  | 616,538 B  | `42710bc73dce1caa38b21062e07cfc89e9ddd65d145231278f36ac2cef1aec27`   | `36f3eeac892447048a77fee27e16156c1298398b169d7903c26c503a8ecd2254`  |
| `v2-heliopause`   | 37.38 s  | 447,798 B  | `fb208e402a40417da4b3c5f8c7e81d09ae825448ae01e5e93673162a0f080f77`   | `97c6068dc001d5086053a28ea0eeb37791ff8281094c310aa07739708e7d26d6`  |

**Bundle total:** ~2.4 MB. Well under the ≤ 32 MB ceiling. (Smaller than
the planning estimate because NASA's upstream source is 8 kHz mono and
short per-track; fidelity is upstream-bound, not encode-bound.)

## Test pass count (AC7)

```
cd web && npm test -- audio v-audio-toggle --run

> web@0.0.0 test
> vitest run --passWithNoTests audio v-audio-toggle --run

 RUN  v4.1.6 C:/git/Voyager/web

 Test Files  3 passed (3)
      Tests  65 passed (65)
   Start at  11:34:15
   Duration  1.87s
```

65/65 audio + v-audio-toggle tests pass against the real-audio bundle —
no test relies on placeholder properties (silence detection, fixed
checksum equality, etc.), so the swap is transparent to the runtime
test surface as expected.

## Build verification

```
cd web && npm run build
[32m✓ built in 1.53s[39m

ls -la web/dist/audio/golden-record/
-rw-r--r-- 1 Josh 197121   53339 May 24 11:30 launch-v1.m4a
-rw-r--r-- 1 Josh 197121   75294 May 24 11:30 launch-v2.m4a
-rw-r--r-- 1 Josh 197121 1182615 May 24 11:30 pale-blue-dot.m4a
-rw-r--r-- 1 Josh 197121  616538 May 24 11:30 v1-heliopause.m4a
-rw-r--r-- 1 Josh 197121  447798 May 24 11:30 v2-heliopause.m4a
```

Vite's `public/` -> `dist/` copy preserves the audio bundle with
identical sizes; runtime can serve `/audio/golden-record/<slug>.m4a`
at deploy time without any pipeline change.

## Documentation updates

- `docs/audio/golden-record-curation.md` — removed "Placeholder audio
  — real procurement deferred" callout; replaced with "Real audio
  procured" section + per-track source URL + license citation +
  source-file SHA-256 + encoding settings + curation reasoning +
  final-file SHA-256.
- `THIRD_PARTY.md` — removed all "Placeholder" qualifiers from the
  Voyager Golden Record audio assets (Story 6.1) section; per-track
  inventory now carries source URL + Wayback snapshot + license citation
  + final size + final SHA-256.
- `web/src/components/v-attribution-panel.ts` — Golden Record entry
  description updated to list the five real-track titles (Greetings in
  English + Arabic; Wind, Rain and Surf; Life Signs / Pulsar; Music of
  the Spheres). Data-shape preserved (`name`, `url`, `description`).
