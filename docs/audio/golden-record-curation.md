# Golden Record audio curation (Story 6.1)

Voyager's Golden Record audio layer activates in five chapter-marker
windows: V1 launch (`launch-v1`), V2 launch (`launch-v2`), Pale Blue Dot
(`pale-blue-dot`), V1 heliopause (`v1-heliopause`), and V2 heliopause
(`v2-heliopause`). This document carries the curation reasoning,
encoding settings, source-file checksums, and runtime persistence
contract for the bundle. It pairs with the attribution + license posture
in [`THIRD_PARTY.md`](../../THIRD_PARTY.md) § "Voyager Golden Record
audio assets (Story 6.1)".

## Placeholder audio — real procurement deferred pending maintainer authorization

The five `.m4a` files currently committed at
`web/public/audio/golden-record/` are **silent AAC-LC placeholders** —
90 s of digital silence at 44.1 kHz mono, 96 kbps, ~32 KB per file
(~160 KB total). They encode every code path the runtime needs (service
activation, component toggle, chapter-window gating, cross-fade timing,
session-id persistence, integration test) without committing audible
audio content.

**Why placeholders, not real audio.** Story 6.1 dev attempted real
procurement against the JPL canonical landing page
(`https://voyager.jpl.nasa.gov/golden-record/`) and observed a 302
redirect to `webhosting-external.jpl.nasa.gov/missing.html` — the
sandbox could not pull the canonical NASA-hosted Golden Record audio
during the cycle. Per the dev directive's fallback-path branch
(network-fetch failures), the placeholder-fallback posture was selected
proactively. This is the same pattern Story 5.3 used for early PBD
plate placeholders before the canonical NASA Photojournal grids landed:
the entire codepath works end-to-end; only the audio content is
provisional.

**Real procurement is required before merge.** The maintainer's
pre-merge gate is a track-by-track procurement audit:

- Identify the canonical NASA source URL per chapter window (JPL
  Voyager Golden Record landing page when restored; Library of Congress
  National Recording Registry; or another NASA public-domain mirror).
- Confirm in writing on the source page that the specific selection is
  NASA public domain with no encumbering performance rights (the
  Greetings, Sounds of Earth, and Beethoven/Bach/Stravinsky public-
  domain orchestral recordings are the canonical NASA-public-domain
  cohort; some 20th-century commercial recordings on the Record carry
  separate performance rights that may not be public-domain even though
  the underlying composition is).
- Download the source audio. Compute SHA-256 of each source file and
  record it in this doc (replacing the placeholder checksum row).
- Encode each source via the canonical pipeline below; verify per-file
  size lands at the ~6 MB target.
- Drop the new `.m4a` files in place of the placeholders at
  `web/public/audio/golden-record/<chapter-slug>.m4a`. LFS tracking is
  already in place; the swap is a transparent in-place blob replace and
  does not require any code or runtime changes (the runtime references
  the files by URL, not by content hash).
- Update this doc's "Per-track curation reasoning" section with the
  finalized track titles + the rationale for the selection.
- Update [`THIRD_PARTY.md`](../../THIRD_PARTY.md) § "Voyager Golden
  Record audio assets (Story 6.1)" with finalized track titles + source
  URLs + per-file checksums.

## Encoding settings

Both placeholder and real-procurement audio use the same encoding chain
so the runtime contract is preserved across the swap:

- **Codec:** AAC-LC. Chosen for universal cross-browser support per
  Story 6.1 AC1. Safari, Chrome, and Firefox all decode AAC-LC natively
  in `<audio>` elements without polyfills, and the codec is
  hardware-accelerated on every target platform per the architecture
  base-tier (ADR-0008).
- **Container:** `.m4a` (ISO/IEC 14496-14 MPEG-4 audio container).
- **Sample rate:** 44.1 kHz. Standard for music-and-speech mixed
  content; matches the source recordings' sample rate when available.
- **Channel count:** mono for the placeholder posture (silent mono is
  the smallest valid AAC-LC encoding); per-track for the real-procurement
  posture (most Golden Record source recordings are mono; the orchestral
  pieces are stereo).
- **Bitrate:** 96 kbps. Sweet spot for spoken word and music at the
  target dynamic range; aligns with the ~6 MB per-track budget.
- **ffmpeg invocation (placeholder):**
  `ffmpeg -f lavfi -i anullsrc=channel_layout=mono:sample_rate=44100 -t 90 -c:a aac -b:a 96k <out>.m4a`
- **ffmpeg invocation (real procurement):**
  `ffmpeg -i <input> -ac <channels> -ar 44100 -c:a aac -b:a 96k <out>.m4a`

## Per-track curation reasoning

The placeholder posture leaves the per-track reasoning provisional. The
final selections will be recorded here as part of the real-procurement
swap; the runtime URLs at `web/public/audio/golden-record/<slug>.m4a`
are fixed in the slug-to-track map at
`web/src/services/audio-playback-service.ts` and do not change between
the placeholder and the real-procurement posture.

- **`launch-v1` (V1 launch window)** — *Pending procurement.* Candidate
  selection: a Greeting from the 55-languages cohort, or a launch-
  window Sounds-of-Earth selection that evokes the September 1977
  liftoff. Curation goal: signal the spacecraft's first moment off
  Earth.

- **`launch-v2` (V2 launch window)** — *Pending procurement.* Candidate
  selection: a complementary greeting or Sounds-of-Earth selection that
  partners with `launch-v1` for the August 1977 V2 liftoff. Curation
  goal: distinguish the V2 launch musically from V1's without
  fragmenting the listener's sense of the launch-window pair.

- **`pale-blue-dot` (Pale Blue Dot anchor)** — *Pending procurement.*
  Candidate selection: Sounds of Earth or J. S. Bach, Brandenburg
  Concerto No. 2, first movement (the public-domain orchestral leg of
  the Record). Curation goal: pair Sagan's elegy with a single grave
  bass note from the spacecraft's own message back to Earth.

- **`v1-heliopause` (V1 heliopause crossing, 2012-08-25)** — *Pending
  procurement.* Candidate selection: Senegalese percussion or Navajo
  "Night Chant" (both are explicit Golden Record tracks). Curation
  goal: mark the threshold of interstellar space with a human-rhythmic
  signal that asserts continuity.

- **`v2-heliopause` (V2 heliopause crossing, 2018-11-05)** — *Pending
  procurement.* Candidate selection: Beethoven Cavatina (String Quartet
  No. 13, Op. 130, fifth movement) or Blind Willie Johnson, "Dark Was
  the Night, Cold Was the Ground". Curation goal: mark V2's later
  crossing with a piece that holds the listener for the long duration
  of interstellar arrival.

## Source-file checksums (SHA-256)

All five placeholders share the same SHA-256 because they are byte-
identical encodings of digital silence at identical settings — this is
correct for the placeholder posture and will diverge per-track once real
audio lands.

| Chapter slug      | Source file                                          | SHA-256 (placeholder)                                              |
|-------------------|------------------------------------------------------|--------------------------------------------------------------------|
| `launch-v1`       | `web/public/audio/golden-record/launch-v1.m4a`       | `99bad3d3fa29e4c9209a2da9a7506f69d127bfd0a40096fc22018b9f086ce5ae` |
| `launch-v2`       | `web/public/audio/golden-record/launch-v2.m4a`       | `99bad3d3fa29e4c9209a2da9a7506f69d127bfd0a40096fc22018b9f086ce5ae` |
| `pale-blue-dot`   | `web/public/audio/golden-record/pale-blue-dot.m4a`   | `99bad3d3fa29e4c9209a2da9a7506f69d127bfd0a40096fc22018b9f086ce5ae` |
| `v1-heliopause`   | `web/public/audio/golden-record/v1-heliopause.m4a`   | `99bad3d3fa29e4c9209a2da9a7506f69d127bfd0a40096fc22018b9f086ce5ae` |
| `v2-heliopause`   | `web/public/audio/golden-record/v2-heliopause.m4a`   | `99bad3d3fa29e4c9209a2da9a7506f69d127bfd0a40096fc22018b9f086ce5ae` |

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
