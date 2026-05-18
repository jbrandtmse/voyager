# ADR 0001 — URL Contract as Public API

Status: Accepted
Date: 2026-05-18
Deciders: Voyager project maintainer

## Status

Accepted. The URL contract is treated as a versioned public API; any breaking change requires a major URL-version bump and a CDN-level redirect map.

## Context

The Voyager simulator has no server, no database, no session state. The URL plus client memory is the entire state surface — deep-links into a per-chapter, per-timestamp simulation state are first-class product features (FR37–FR42). Once those links are shared on social media, copied into talks, embedded in blog posts, or hardcoded into linked-back third-party pages, they outlive every release of the artifact.

Treating the URL scheme as ad-hoc would break those external references on any rename or parameter shape change. Treating it as a public API forces ADR-level discipline around chapter IDs, parameter names, and parsing semantics.

[Source: _bmad-output/planning-artifacts/architecture.md#Decision-6e]
[Source: _bmad-output/planning-artifacts/prd.md#FR41]

## Decision

The URL contract is a versioned public API:

- **Chapter IDs are frozen as of v1:** `launch-v1`, `launch-v2`, `v1-jupiter`, `v2-jupiter`, `v1-saturn`, `v2-saturn`, `v2-uranus`, `v2-neptune`, `pale-blue-dot`, `v1-heliopause`, `v2-heliopause`.
- **New chapter IDs in v1.1+ are additive.** Existing IDs are immutable.
- **Parameter names (`t`, `embed`) and their semantics are immutable** across releases. `t` is ISO-8601 UTC (per ADR 0006e companion decision); `embed=true` is a strict-boolean (per NFR-S7 strict-typed URL parameter parsing).
- **Any breaking change requires a major URL-version bump and a CDN-level redirect map** mapping every previously-shipped chapter ID to its successor.

## Consequences

**Positive:**
- Shareable, embeddable links remain valid across the artifact's multi-year maintenance horizon (NFR-M6).
- A single source of truth for what counts as a "v1" URL — no ambiguity for OG card generation or for the URL-sync test harness.
- Backward-compatibility discipline matches the hands-off-maintenance project commitment.

**Negative:**
- Cannot rename a chapter or restructure parameters without an explicit migration plan.
- Each new chapter must pick its ID carefully — typos and English-only assumptions are now permanent.

**Obligations on downstream stories:**
- The URL-sync work in Epic 7 must implement parameter parsing that matches this contract exactly, including strict-boolean parsing for `embed`.
- The OG card generation pipeline (ADR 0018) uses these chapter IDs as filename keys.
- Any future story proposing a URL-shape change must author a new ADR superseding this one and include a redirect map.

## Alternatives Considered

- **Treat URL as an implementation detail.** Rejected: deep-link sharing is an explicit product requirement (FR37); silently breaking shared links would erode trust and contradict the hands-off-maintainability commitment (NFR-M6).
- **Hash-based routing (`#/v1-jupiter?t=...`).** Rejected: produces ugly URLs, doesn't play well with OG card scraping (crawlers don't execute JS to read the hash), and offers no benefit since the static-CDN deploy can serve per-chapter HTML shells directly.
- **Auto-generate chapter IDs from a title slug.** Rejected: title changes during copy iteration would silently change URLs — exactly the breakage this ADR exists to prevent.
- **URL-version embedded in the path (`/v1/v1-jupiter`).** Rejected as default but reserved for a future major bump. v1 lives at the bare URL; if a v2 contract is ever needed, it lives at `/v2/...` and v1 URLs continue to resolve via the redirect map.
