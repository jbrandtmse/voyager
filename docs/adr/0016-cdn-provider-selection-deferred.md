# ADR 0016 — CDN Provider Selection

Status: Accepted
Date: 2026-05-18
Deciders: Voyager project maintainer

> **Historical note on filename:** this file was originally authored in Story 1.2
> as `0016-cdn-provider-selection-deferred.md` with `Status: Proposed`, deferring
> the choice to Story 1.14. Per ADR 0020's immutability rule (existing ADR
> filenames are stable so the index regenerator stays deterministic and historical
> links don't rot), the `-deferred` suffix is retained even though selection has
> now landed. The Status, Decision, and Consequences sections below have been
> updated in Story 1.14; the original Alternatives Considered matrix is preserved
> verbatim as the audit trail.

## Status

Accepted in Story 1.14 (2026-05-19). **Chosen provider: Cloudflare Pages.**

## Context

The Voyager artifact is a static `web/dist/` directory deployable to any CDN that supports:

- Content-hashed immutable assets with `Cache-Control: public, max-age=31536000, immutable` (NFR-R2).
- Atomic rollback to a previous deployment in ≤5 minutes (NFR-R3).
- Custom HTTP headers for the strict CSP (NFR-S2).
- TLS 1.2+ on a custom or auto-provisioned domain (NFR-S1).
- Free or near-free tier for a portfolio-scale project (~$0–15/year budget per the cost analysis).

Both Cloudflare Pages and Vercel meet every one of these. Architecture (Decision 7b) is provider-agnostic: a single `wrangler pages deploy` or `vercel deploy --prod` command shipping the same `web/dist/` directory works on either. The real differentiators show up at *operational* time — egress costs, header configuration ergonomics, rollback UX during an actual incident, LFS-vs-CDN bandwidth coupling — which we cannot measure until first deploy.

[Source: _bmad-output/planning-artifacts/architecture.md#Decision-7b]
[Source: _bmad-output/planning-artifacts/prd.md#NFR-R1]
[Source: _bmad-output/planning-artifacts/prd.md#NFR-R2]
[Source: _bmad-output/planning-artifacts/prd.md#NFR-R3]

## Decision

**Cloudflare Pages.** The CI workflow (`.github/workflows/ci.yml`, Story 1.14) builds `web/dist/` and deploys it via `cloudflare/pages-action@v1` on every push to `main`. Pull-request preview deploys are handled automatically by Cloudflare's GitHub integration and do not require a workflow step.

**Rationale:**

1. **Free-tier ceiling.** Cloudflare Pages's free tier offers 500 builds/month and *unlimited* bandwidth + requests. Vercel's Hobby tier caps bandwidth at 100 GB/month and prohibits commercial use; while neither limit binds today, the unmetered ceiling removes one risk factor for an artifact-class project whose traffic is unpredictable (anniversary spikes, link-aggregator posts, classroom adoption).
2. **Header configuration ergonomics.** Cloudflare Pages reads `web/public/_headers` — Netlify-style, one line per rule, checked into Git alongside the source. The equivalent on Vercel is a `vercel.json` JSON block with a more verbose schema. For a static site whose only header needs are the immutable-asset Cache-Control rules (NFR-R2) and the eventual strict CSP (NFR-S2, Story 7.4), the `_headers` file shape is plainly simpler.
3. **GitHub integration.** Cloudflare Pages auto-deploys on merge to `main` via the official GitHub integration. The same integration also publishes per-PR preview URLs without any workflow step, which matches the project's "every chapter and every timestamp is a shareable URL" stance (NFR-R2).
4. **No build-time lock-in.** Cloudflare Pages serves a pre-built `web/dist/` from GitHub Actions; no Cloudflare-specific build adapter, no Pages Functions used in v1. If a future migration to Vercel (or anywhere else) becomes necessary, the `_headers` file is the only Cloudflare-specific surface — it translates cleanly to a `vercel.json` block.

**Operational properties confirmed:**

- TLS 1.2+ enforced by Cloudflare default; TLS 1.3 preferred (NFR-S1).
- HTTPS-only redirects enforced by Cloudflare default (NFR-S1).
- Atomic rollback via the Cloudflare Pages dashboard or `wrangler pages deployment rollback` (NFR-R3).
- Prior deployments remain reachable at their per-deploy preview URLs indefinitely; the production URL serves the latest deploy (NFR-R2).

**Two GitHub repo secrets are required** for the CI deploy step:

- `CLOUDFLARE_API_TOKEN` — scoped to `Pages:Edit` (Cloudflare dashboard → My Profile → API Tokens → Create Custom Token).
- `CLOUDFLARE_ACCOUNT_ID` — visible in the Cloudflare dashboard URL or under Workers & Pages → Overview.

The Story 1.14 dev cannot set these secrets (no admin access to the GitHub repo settings); they are documented in `README.md`'s Deployment section and must be added by the project maintainer before the first `main` push deploys.

## Consequences

**Positive:**
- Single static-host vendor, free tier, unmetered bandwidth.
- `_headers` file is reviewable and versioned alongside source.
- Per-PR preview URLs come "for free" via the GitHub integration.
- Atomic rollback via dashboard or CLI; no rebuild required.

**Negative:**
- One vendor lock-in surface: the `_headers` file syntax. Migration cost is small (translate to `vercel.json` JSON) but non-zero.
- The `cloudflare/pages-action@v1` GitHub Action is a third-party dependency on the CI hot path; if Cloudflare deprecates it in favor of a newer action, the workflow needs an update. (Cloudflare's track record on action stability is good — `pages-action@v1` has been the canonical entry point for ~2 years as of mid-2026 — but it's worth tracking.)
- Build minutes (500/month) bind if CI fires more than ~15× per day on average. Not a concern at the current pace, but worth monitoring if multiple contributors land.

**Obligations on downstream stories:**
- ~~Story 1.14 makes the call, supersedes this ADR with a new one (`0028-cdn-provider-selected-X`), and updates the deploy step in CI (per ADR 0017).~~ *(Updated in-place per the filename-immutability compromise above; no superseding ADR was needed.)*
- ~~No story between now and Story 1.14 may bake in provider-specific assumptions (e.g., `_headers` syntax). All header config lives in a provider-neutral `web/dist/headers.json` (or equivalent) until the choice is made.~~ *(No longer applicable — Story 1.14 has landed; `web/public/_headers` is now the canonical header config.)*

## Alternatives Considered

| Dimension | Cloudflare Pages | Vercel |
| --- | --- | --- |
| Free-tier limits | Unlimited bandwidth on free tier; 500 builds/month; 100 custom domains | 100 GB/month bandwidth on Hobby tier; unlimited builds on Hobby with fair-use; commercial use prohibited on Hobby |
| Content-hashed immutable assets | Supported via `_headers` file (`/assets/*` with `Cache-Control: public, max-age=31536000, immutable`) | Supported via `vercel.json` `headers:` block with the same Cache-Control |
| Atomic rollback | One-click rollback in dashboard or via `wrangler pages deployment` CLI; previous deployment becomes active without rebuild | One-click "Promote to Production" on any previous deployment; or `vercel rollback <deployment-id>` CLI |
| Custom-headers / CSP support | `_headers` file in `web/dist/` (Netlify-style syntax); supports per-path rules; CSP fully configurable | `vercel.json` top-level `headers:` array; per-source path-glob; CSP fully configurable |
| Bandwidth pricing (beyond free) | Workers Paid plan: $5/month + low marginal per-GB; bandwidth not metered separately on Pages | Pro tier: $20/month per member; bandwidth $40/100GB after Pro limits; commercial use requires Pro |
| Build-time provider lock-in | None for static sites (`wrangler pages deploy ./dist`); Pages Functions are CF-specific but unused by our static build | None for static sites (`vercel deploy --prod ./dist`); ISR/Edge Functions are Vercel-specific but unused by our static build |
| LFS-aware checkout in build env | N/A (CI builds on GitHub Actions, not on Pages); deploy step pushes pre-built `web/dist/` | N/A (same); deploy step pushes pre-built `web/dist/` |
| WebGL / large-asset hosting suitability | First-class; CF's CDN edge cache handles GLB / brotli-compressed binaries well | First-class; serves immutable assets identically |
| TLS / custom domain | Free auto-provisioned; HTTP/3 supported | Free auto-provisioned; HTTP/3 supported |
| Project precedent / familiarity | Wrangler CLI ergonomics; the auto-acquisition mindset (everything via tool) fits a Wrangler workflow | Vercel CLI is mature; deployment UX is polished but couples to Vercel dashboard for some operations |

**Both meet every NFR.** The Story 1.14 decision selected **Cloudflare Pages** primarily on the free-tier ceiling (unmetered bandwidth removes one operational risk factor) and `_headers` file ergonomics (simpler than `vercel.json` for a static-site artifact whose only header concerns are immutable Cache-Control and the future strict CSP).

**Vercel — rejected:** the 100 GB/month free-tier bandwidth cap is the only meaningful constraint we can foresee binding, and the `vercel.json` JSON-block header config is verbose without offering anything `_headers` doesn't. Vercel's edge functions and ISR remain attractive for future scope (e.g., server-rendered OG cards) but ADR 0018 has already committed OG cards to static pre-render, so the differentiator doesn't apply.

**Other options briefly considered and rejected:**

- **Netlify.** Comparable feature set to the two finalists, but the 100 GB/month free-tier bandwidth cap is identical to Vercel without an obvious differentiator; sticking with the two finalists keeps the decision tight.
- **GitHub Pages.** Rejected: no custom headers, no atomic rollback story, limited control over caching behavior — violates NFR-R2 and NFR-S2.
- **S3 + CloudFront.** Rejected: not free; requires AWS account, billing setup, and significantly more configuration for a static-site artifact; over-spec for the portfolio scale.
- **Self-hosted Caddy / Nginx on a VPS.** Rejected: violates the hands-off-maintenance commitment (NFR-M6); requires uptime monitoring, OS patching, log management.
