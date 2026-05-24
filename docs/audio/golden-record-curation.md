# Golden Record audio curation (Story 6.1)

Voyager's Golden Record audio layer activates in five chapter-marker
windows: V1 launch (`launch-v1`), V2 launch (`launch-v2`), Pale Blue Dot
(`pale-blue-dot`), V1 heliopause (`v1-heliopause`), and V2 heliopause
(`v2-heliopause`). This document carries the curation reasoning,
encoding settings, source-file checksums, and runtime persistence
contract for the bundle. It pairs with the attribution + license posture
in [`THIRD_PARTY.md`](../../THIRD_PARTY.md) § "Voyager Golden Record
audio assets (Story 6.1)".

## Real audio procured (Story 6.1 follow-up patch)

The five `.m4a` files at `web/public/audio/golden-record/` carry **real
Voyager Golden Record content** sourced from the canonical NASA-hosted
asset directory at `voyager.jpl.nasa.gov/assets/audio/golden-record/`.
The live JPL host now serves a 302 to a missing-page placeholder (the
same redirect Story 6.1 dev observed), so the procurement pass routed
through the Internet Archive's Wayback Machine, which preserves the
NASA-hosted assets with their original `Last-Modified: 2017-08-09`
headers intact and with `x-archive-orig-server: Apache` confirming the
upstream was the JPL Apache host. The Wayback snapshot date for each
asset is captured per-track below.

**License posture.** NASA's standard media usage statement (per
<https://www.nasa.gov/nasa-brand-center/images-and-media/>) is:
"NASA content – images, audio, video, and media files used in the
rendition of 3-dimensional models, such as texture maps and polygon
data in any format – generally are not subject to copyright in the
United States." All five selections fall inside the NASA-produced cohort
(Cornell-recorded greetings donated to NASA + JPL/NASA Sounds-of-Earth
mission recordings) and carry no encumbering performance rights — they
are NOT from the orchestral / 20th-century commercial-recording cohort
of the Record (Bach Munich Bach Orchestra 1971, Beethoven Otto Klemperer
~1955, Blind Willie Johnson 1927, etc.), which Story 6.1's planning
notes flagged as performance-rights-encumbered and which this patch
deliberately avoided.

**Curation principle.** Because the encumbered cohort was excluded, the
selections favor the unambiguously-NASA-PD subset: the 55-languages
greetings (recorded by Carl Sagan's Cornell team for NASA) for the
launch tracks, and the "Sounds of Earth" mission recordings (NASA-
produced ambient/environmental tracks plus the cosmic-spheres
sonification) for the chapters in interstellar space. Each chapter
window gets a track whose duration ≤ the natural source length; the
audio service simply plays through and goes silent at end-of-source
inside the wider chapter window — the cross-fade + chapter-marker
contract still binds.

## Encoding settings

- **Codec:** AAC-LC. Chosen for universal cross-browser support per
  Story 6.1 AC1. Safari, Chrome, and Firefox all decode AAC-LC natively
  in `<audio>` elements without polyfills, and the codec is
  hardware-accelerated on every target platform per the architecture
  base-tier (ADR-0008).
- **Container:** `.m4a` (ISO/IEC 14496-14 MPEG-4 audio container).
- **Sample rate:** 44.1 kHz output (upsampled from 8 kHz NASA source).
  The NASA-hosted Golden Record assets are 8 kHz mu-law (`.au`) for the
  greetings and 8 kHz 8-bit PCM (`.wav`) for the Sounds of Earth — both
  preserved at the original 1977 telemetry-grade fidelity. Upsampling
  to 44.1 kHz at encode time interpolates cleanly and matches the
  runtime `<audio>` element's playback rate without resampling.
- **Channel count:** mono. All five NASA source files are mono.
- **Bitrate:** 96 kbps. Sweet spot for low-fidelity NASA source content;
  the AAC encoder runs well below the bitrate ceiling for these short
  sources, so per-file sizes land in the 50 KB – 1.2 MB range (well
  below the ~6 MB per-track upper bound) and the bundle totals ~2.4 MB
  (well below the ≤ 32 MB ceiling). Total bundle is small because the
  NASA source content itself is short and 8 kHz mono — fidelity is
  upstream-bound, not encode-bound.
- **ffmpeg invocation:**
  `ffmpeg -y -i <input> -ac 1 -ar 44100 -c:a aac -b:a 96k <out>.m4a`

## Per-track curation reasoning

The runtime URLs at `web/public/audio/golden-record/<slug>.m4a` are
fixed in the slug-to-track map at
`web/src/services/audio-playback-service.ts` and do not change across
the swap. Per-track source-page citation, license confirmation, source-
file SHA-256, encoding settings, and curation reasoning follow.

- **`launch-v1` (V1 launch window, 1977-09-05)** — **"Greetings in
  English" (Nick Sagan).** NASA-hosted source asset
  <https://voyager.jpl.nasa.gov/assets/audio/golden-record/english.au>,
  fetched via the Wayback Machine snapshot
  <https://web.archive.org/web/20210319024735if_/https://voyager.jpl.nasa.gov/assets/audio/golden-record/english.au>
  (snapshot dated 2021-03-19; upstream `Last-Modified: 2017-08-09`).
  License confirmation: NASA's standard media policy
  <https://www.nasa.gov/nasa-brand-center/images-and-media/> ("NASA
  content – images, audio, video … generally are not subject to
  copyright in the United States"), accessed 2026-05-24. Source format:
  Sun/NeXT `.au`, 8 kHz mu-law, mono, 8-bit, 4.27 s. Source SHA-256:
  `43893d11b645d63258d056d5e542789055c3092038bbaac0cedcceb2d00072e7`.
  Curation reasoning: the iconic Nick Sagan greeting ("Hello from the
  children of Planet Earth") is the most-cited Voyager greeting and
  signals the spacecraft's first moment off Earth.

- **`launch-v2` (V2 launch window, 1977-08-20)** — **"Greetings in
  Arabic".** NASA-hosted source
  <https://voyager.jpl.nasa.gov/assets/audio/golden-record/arabic.au>,
  fetched via Wayback snapshot
  <https://web.archive.org/web/20210318135029if_/https://voyager.jpl.nasa.gov/assets/audio/golden-record/arabic.au>
  (snapshot dated 2021-03-18; upstream `Last-Modified: 2017-08-09`).
  License confirmation: NASA media policy as above. Source format: Sun/
  NeXT `.au`, 8 kHz mu-law, mono, 8-bit, 6.01 s. Source SHA-256:
  `0f31bf782342e412f37751ce0cf1095454184b02c1832adf3e3383a7b99350a8`.
  Curation reasoning: a distinct linguistic/cultural greeting that
  partners with English for the launch-window pair, audibly different
  in tonality and prosody so V1 and V2 launches carry distinct sonic
  signatures.

- **`pale-blue-dot` (Pale Blue Dot anchor, 1990-02-14)** — **"Wind,
  Rain, and Surf" (Sounds of Earth).** NASA-hosted source
  <https://voyager.jpl.nasa.gov/assets/audio/golden-record/wind.wav>,
  fetched via Wayback snapshot
  <https://web.archive.org/web/20210318210632if_/https://voyager.jpl.nasa.gov/assets/audio/golden-record/wind.wav>
  (snapshot dated 2021-03-18; upstream `Last-Modified: 2017-08-09`).
  License confirmation: NASA media policy as above. Source format: RIFF
  WAVE, 8 kHz 8-bit PCM, mono, 97.73 s. Source SHA-256:
  `d1c7722fe70a388c8765889baed7acb93d8cee0a88f408ffb0272b2c6ed00e1b`.
  Curation reasoning: pairing Sagan's elegy with the planetary
  environmental signature the spacecraft itself carries back outward —
  Earth's own sounds reflected at the dot. The contemplative-natural
  register matches the scene's pace; the 97 s duration sits well
  inside the PBD chapter window.

- **`v1-heliopause` (V1 heliopause crossing, 2012-08-25)** — **"Life
  Signs / Pulsar" (Sounds of Earth).** NASA-hosted source
  <https://voyager.jpl.nasa.gov/assets/audio/golden-record/life.wav>,
  fetched via Wayback snapshot
  <https://web.archive.org/web/20210320094802if_/https://voyager.jpl.nasa.gov/assets/audio/golden-record/life.wav>
  (snapshot dated 2021-03-20; upstream `Last-Modified: 2017-08-09`).
  License confirmation: NASA media policy as above. Source format: RIFF
  WAVE, 8 kHz 8-bit PCM, mono, 51.03 s. Source SHA-256:
  `42710bc73dce1caa38b21062e07cfc89e9ddd65d145231278f36ac2cef1aec27`.
  Curation reasoning: marks the threshold of interstellar space with
  the heartbeat + pulsar sonification — a literal pulse asserting human
  presence at the boundary the spacecraft just crossed. Cosmic-rhythm
  signal that bridges life-on-Earth to deep-space register.

- **`v2-heliopause` (V2 heliopause crossing, 2018-11-05)** — **"Music
  of the Spheres" (Sounds of Earth).** NASA-hosted source
  <https://voyager.jpl.nasa.gov/assets/audio/golden-record/spheres.wav>,
  fetched via Wayback snapshot
  <https://web.archive.org/web/20210320094756if_/https://voyager.jpl.nasa.gov/assets/audio/golden-record/spheres.wav>
  (snapshot dated 2021-03-20; upstream `Last-Modified: 2017-08-09`).
  License confirmation: NASA media policy as above. Source format: RIFF
  WAVE, 8 kHz 8-bit PCM, mono, 37.38 s. Source SHA-256:
  `fb208e402a40417da4b3c5f8c7e81d09ae825448ae01e5e93673162a0f080f77`.
  Curation reasoning: marks V2's later crossing with a piece that
  reaches outward into the broader cosmic register — the spheres
  sonification is the only Sounds-of-Earth track explicitly cosmological
  in framing, and pairs with V1's pulsar track to form a heliopause-
  pair distinct sonic signature.

## Checksums (SHA-256)

Per-track source SHA-256 (NASA-hosted upstream, fetched via Wayback) and
final-file SHA-256 (the committed AAC-LC `.m4a`).

| Chapter slug      | NASA source filename | Source SHA-256                                                       | Final-file SHA-256                                                  |
|-------------------|----------------------|----------------------------------------------------------------------|---------------------------------------------------------------------|
| `launch-v1`       | `english.au`         | `43893d11b645d63258d056d5e542789055c3092038bbaac0cedcceb2d00072e7`   | `64c171e549aeffc57403d020c10bbafc0871c9b4fd8f7cec9e1bc9237d5517ec`  |
| `launch-v2`       | `arabic.au`          | `0f31bf782342e412f37751ce0cf1095454184b02c1832adf3e3383a7b99350a8`   | `9600db0511ff63aa8df356d7fd760a25ceca0da9226f9b6feaa44291fb1daae3`  |
| `pale-blue-dot`   | `wind.wav`           | `d1c7722fe70a388c8765889baed7acb93d8cee0a88f408ffb0272b2c6ed00e1b`   | `51de466560dd8974bd1d296f2b6aff0bc524aae1f790963330550bea15c02924`  |
| `v1-heliopause`   | `life.wav`           | `42710bc73dce1caa38b21062e07cfc89e9ddd65d145231278f36ac2cef1aec27`   | `36f3eeac892447048a77fee27e16156c1298398b169d7903c26c503a8ecd2254`  |
| `v2-heliopause`   | `spheres.wav`        | `fb208e402a40417da4b3c5f8c7e81d09ae825448ae01e5e93673162a0f080f77`   | `97c6068dc001d5086053a28ea0eeb37791ff8281094c310aa07739708e7d26d6`  |

## Runtime persistence contract (AC4)

The audio toggle is OFF by default. The on/off state persists for the
current browser session and resets on a new tab / browser restart / new
day. Implementation:

- **localStorage key:** `voyager.audio-toggle`
- **localStorage value:** JSON-serialized object of shape
  `{ sessionId: string, on: boolean }`. The `sessionId` is a fresh
  `crypto.randomUUID()` generated once at boot and held in a module-
  scope `currentSessionId` constant. Reading from localStorage compares
  the persisted `sessionId` against `currentSessionId`; a mismatch
  resets the toggle to `off` regardless of the persisted `on` value.
  Writing to localStorage always uses the current `sessionId`, so
  same-session reloads preserve the toggle.
- **try/catch posture:** localStorage access is wrapped in try/catch
  for private-mode browsers, test environments, and storage-disabled
  contexts. On failure the service silently falls back to in-memory
  state — the toggle still works for the duration of the page; it just
  doesn't persist across reloads in that environment.
- **No URL state.** Per ADR-0015, URL is derived not authoritative; the
  audio toggle is a UI preference, not part of the canonical state
  graph. The toggle state is **not** serialized to the URL.

This is the second documented localStorage use case in the project (the
first is `voyagerErrors` per ADR-0019 — error capture). The ADR-0019
amendment block at the top of
[`docs/adr/0019-zero-analytics-localstorage-only-error-capture.md`](../adr/0019-zero-analytics-localstorage-only-error-capture.md)
records the in-place expansion.

## Cross-fade timing (AC5)

Audio cross-fades IN over 1500 ms when entering a Golden-Record chapter
window with the toggle on, and OUT over 1500 ms on exit / toggle-off /
pause. The 1500 ms value is **not** aliased to `--v-duration-base`
(which is 250 ms by default and 0 ms under `prefers-reduced-motion:
reduce`). Audio is its own sensory register per the epic spec — reduced-
motion does not shorten or zero the audio fade.

The fade is **wall-clock-gated**, not simulation-timestamp-gated: at
high time-warp (e.g., 1,000,000×), the fade still resolves over 1500 ms
of real-world time, not 1500 ms of simulation time. The activation
*trigger* is timestamp-gated (the `ChapterDirector` subscription event
fires at the simulation-timestamp boundary), but the fade itself rides
the browser's native audio timeline.

## Reduced motion (AC6)

`prefers-reduced-motion: reduce` does **not** affect the audio. The
1500 ms cross-fade fires unchanged, and the chapter-marker activation
still triggers. `prefers-reduced-transparency: reduce` is also
unaffected. The epic spec is explicit that audio is its own register;
the `prefers-reduced-data` media query (which would gate the audio
bundle's network footprint) is out of Epic 6 scope.
