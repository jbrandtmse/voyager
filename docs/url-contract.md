# Voyager URL Contract

**Status:** Public API (per [ADR-0001](adr/0001-url-contract-as-public-api.md))
**First-shipped:** Story 2.4 (Epic 2)
**Stability:** Chapter slugs and the shape of `?t=` will not change in any non-major release.

This document is the canonical reference for Voyager's URL surface. The URL is a versioned public API — links shared on social media, embedded in blog posts, copied into talks, or hardcoded into linked-back third-party pages must remain valid across every Voyager release that does not include an explicit URL major-version bump and CDN redirect map.

## Route Shapes

Voyager recognizes exactly three route shapes at boot:

| Shape | Example | Meaning |
| --- | --- | --- |
| `/` | `https://voyager.app/` | Homepage. Simulation initializes at `MISSION_START_ET` unless `?t=` overrides. |
| `/c/<chapter-slug>` | `https://voyager.app/c/v2-neptune` | Chapter route. Simulation initializes at the chapter's `anchorEt` unless `?t=` overrides. |
| `/about` | `https://voyager.app/about` | About / methodology page. Mounts `<v-about-page>` only; the simulation surface (canvas, HUD, scrubber, chapter index) is NOT mounted. The Attribution section anchors at `#attribution` for deep-linking. |

Any other shape (`/anything-else`, `/c/<unknown-slug>`) silently redirects to `/` via `history.replaceState` and emits a single `console.warn`. No user-facing error UI is surfaced (per NFR-S7).

Popstate navigations that cross between the `/about` surface and the simulation surface (`/`, `/c/<slug>`) trigger a full page reload, matching the cold-load mount contract for each surface. Within-surface popstate (e.g. `/c/v1-jupiter` ↔ `/c/v2-saturn`) is handled by the URLRouter without reload, per Story 2.4 AC8c.

## Canonical Chapter Slugs (frozen as of v1)

These eleven slugs are committed by [ADR-0001](adr/0001-url-contract-as-public-api.md) and are immutable. Renaming any of them requires a major URL-version bump and a CDN-level redirect map.

| Slug | Editorial Name |
| --- | --- |
| `launch-v1` | Voyager 1 — Launch |
| `launch-v2` | Voyager 2 — Launch |
| `v1-jupiter` | Voyager 1 — Jupiter |
| `v2-jupiter` | Voyager 2 — Jupiter |
| `v1-saturn` | Voyager 1 — Saturn |
| `v2-saturn` | Voyager 2 — Saturn |
| `v2-uranus` | Voyager 2 — Uranus |
| `v2-neptune` | Voyager 2 — Neptune |
| `pale-blue-dot` | Pale Blue Dot |
| `v1-heliopause` | Voyager 1 — Heliopause |
| `v2-heliopause` | Voyager 2 — Heliopause |

New chapter slugs introduced in v1.1+ are additive — existing slugs are never renamed.

## Query Parameters

### `t` — ISO-8601 UTC timestamp

The `t` parameter pins the simulation to a specific instant. Format: ISO-8601 UTC string (`YYYY-MM-DDTHH:MM:SSZ` or any form accepted by `Date.parse`). Examples:

- `?t=1989-08-25T09:23:00Z` — Voyager 2 closest approach to Neptune
- `?t=1990-02-14T00:00:00Z` — Pale Blue Dot photograph
- `?t=1977-09-05T12%3A56%3A00Z` — URL-encoded forms work; `URLSearchParams` decodes automatically

**Behavior matrix:**

| Route | `?t=` value | Result |
| --- | --- | --- |
| `/` | absent | `simTimeEt = MISSION_START_ET` |
| `/` | valid ISO in range | `simTimeEt = parsed ET` |
| `/` | malformed or out-of-range | silent reject → `MISSION_START_ET` |
| `/c/<slug>` | absent | `simTimeEt = chapter.anchorEt` |
| `/c/<slug>` | valid ISO (any range) | `simTimeEt = parsed ET`; ChapterDirector recomputes activeChapter on the next frame |
| `/c/<slug>` | malformed | silent reject → `chapter.anchorEt` |

The "ISO outside the chapter window is STILL accepted on chapter routes" rule lets a user share a deep-link with a precise timestamp that may have drifted just past the chapter's visual window — the user's intent (that timestamp) wins; ChapterDirector decides activeChapter on the next render frame.

### `embed` — strict-boolean (Story 2.5)

Enables chrome-less embed mode for kiosk / iframe deployments. **Strict-boolean parse (NFR-S7):** only the literal lowercase `?embed=true` enables embed mode. Every other value — `?embed=1`, `?embed=yes`, `?embed=TRUE`, `?embed=on`, `?embed=`, or no `embed` param at all — silently resolves to "embed disabled." No error UI is surfaced for rejected variants.

**Session-immutable.** The flag is captured once at boot from the URL. Mutating `?embed` in the address bar after page load does not change the embed state — kiosk-host shells decide at navigation time, not mid-session.

**Behavior — chrome elements NOT mounted (not merely hidden).** When embed mode is enabled, the following chrome elements are not appended to the DOM at all. CSS `display: none` is not used; the elements simply do not exist in the document tree.

| Element | Story | Behavior in embed mode |
| --- | --- | --- |
| `<v-chapter-index>` toggle button | 2.3 | not mounted; `M` and `1`–`9` global shortcuts become NO-OPS because no listener is attached |
| About-page link | 2.7 (planned) | not mounted; `A` shortcut becomes a NO-OP |
| Methodology link | 2.7 (planned) | not mounted |
| `<v-help-overlay>` toggle icon | 2.8 (planned) | not mounted; `?` shortcut becomes a NO-OP |

This list is **part of the URL contract**: kiosk hosts may rely on the stability of which elements disappear in embed mode. Adding new elements to the strip list requires a major URL-version bump per [ADR-0001](adr/0001-url-contract-as-public-api.md). Removing elements from the strip list (i.e. starting to mount something that was previously stripped) similarly counts as a breaking change.

**Simulation surface — STILL mounts in embed mode.** The following are the embed view's actual content, not chrome, and continue to render normally: canvas, `<v-hud>` and its sub-components, `<v-timeline-scrubber>` with chapter markers, `<v-play-button>`, `<v-speed-multiplier>`, `<v-audio-toggle>` (future).

**Keyboard contract preserved.** All keyboard shortcuts that target the simulation surface continue to work in embed mode: `Space` (play/pause — Story 1.10), `←/→` (scrub — Story 1.9), `Home/End` (jump to mission start/end), `+/-` (speed — Story 1.10), `H` (HUD compaction — Story 6.2 planned). Only the chrome-targeted shortcuts (`M`, `A`, `?`) become NO-OPS.

**URL preservation across writebacks.** When embed mode is enabled at boot, every URL writeback — chapter `pushState`, chapter `replaceState`, free-scrub `?t=` replaceState, home revert, unknown-slug redirect — appends `&embed=true` so the kiosk's deep-link survives the full back-then-forward navigation cycle and any director-driven boundary crossing.

**Example URLs:**

```text
# Kiosk deep-link with embed mode
https://voyager.app/c/pale-blue-dot?t=1990-02-14T00:00:00Z&embed=true

# After a user activation that pushes to V2 Neptune — embed=true preserved
https://voyager.app/c/v2-neptune?t=1989-08-25T09:23:00Z&embed=true

# Director-driven exit to cruise period — embed=true survives the home revert
https://voyager.app/?t=1986-01-25T00:00:00Z&embed=true
```

## State → URL Writeback Rules

Voyager keeps the URL in sync with the simulation via three writeback paths. The trigger source determines which `history` API is used.

### `pushState` — user-driven activations

| Trigger | URL Update |
| --- | --- |
| Click on a chapter-marker in the scrubber | `history.pushState('/c/<slug>?t=<anchorEt>')` |
| Enter on a focused chapter-index listbox option | `history.pushState('/c/<slug>?t=<anchorEt>')` |
| Global `1`–`9` digit shortcut | `history.pushState('/c/<slug>?t=<anchorEt>')` |

Each user-driven activation creates a new browser history entry. Pressing the browser back button restores the previous route.

### `replaceState` — director-driven and continuous writes

| Trigger | URL Update |
| --- | --- |
| Free scrub within a chapter | `history.replaceState('/c/<slug>?t=<currentEt>')`, throttled to 250ms |
| Free scrub crosses a chapter window boundary | `history.replaceState('/c/<new-slug>?t=<currentEt>')` |
| Free scrub leaves all chapter windows (cruise period) | `history.replaceState('/?t=<currentEt>')` |
| Browser back/forward navigation | (no write — the URL is already correct after the user navigation) |

Replace-state writes do NOT pollute browser history; the back button continues to return to whatever the user explicitly navigated to last.

### `popstate` — browser back/forward

Voyager subscribes to `window.popstate` and re-parses the URL on every back/forward press. The parsed ET is applied via `ClockManager.scrubTo(et)`, which pauses the simulation as a side effect. ChapterDirector observes the new ET on its next render frame and emits any matching `held` transitions through the FSM (per Story 2.1).

## Stability Commitment

By [ADR-0001](adr/0001-url-contract-as-public-api.md):

- **Chapter slugs are immutable.** Once shipped, a slug remains valid for the lifetime of the URL major version. Adding new chapters is additive only.
- **Parameter names and semantics are immutable.** `t` is ISO-8601 UTC; `embed` is strict-boolean. No silent semantic shifts in minor releases.
- **Breaking changes require a major URL-version bump** with a `/v2/...` prefix and a CDN-level redirect map mapping every previously-shipped slug to its successor. v1 URLs continue to resolve at the bare path.

This contract is multi-year. NFR-M6 ("multi-year URL stability") and FR41 ("deep-link sharing") both depend on it.

## Examples

```text
# Homepage at mission start
https://voyager.app/

# Homepage at a specific instant
https://voyager.app/?t=1990-02-14T00:00:00Z

# Chapter route at the chapter's canonical instant
https://voyager.app/c/v2-neptune

# Chapter route at a specific instant within the chapter window
https://voyager.app/c/v2-neptune?t=1989-08-25T09:23:00Z

# Chapter route at an instant that drifted just past the window —
# still accepted; ChapterDirector resolves activeChapter on the next frame
https://voyager.app/c/v2-neptune?t=1989-09-15T00:00:00Z
```

## See Also

- [ADR-0001 — URL Contract as Public API](adr/0001-url-contract-as-public-api.md)
- `web/src/services/url-sync.ts` — runtime URL ↔ ClockManager bridge
- `web/src/services/url-router.ts` — chapter-jump, ChapterDirector, popstate routing
- `web/src/chapters/registry.ts` — `ALL_CHAPTERS` (the 11 canonical specs) and `findChapterBySlug`
