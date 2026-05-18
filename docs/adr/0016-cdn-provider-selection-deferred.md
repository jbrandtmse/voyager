# ADR 0016 — CDN Provider Selection (Deferred)

Status: Proposed
Date: 2026-05-18
Deciders: Voyager project maintainer

## Status

Proposed. **Final CDN provider selection is deferred to Story 1.14**, when concrete deployment trade-offs can be measured rather than guessed. The two finalists — Cloudflare Pages and Vercel — both meet every architectural requirement.

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

**Defer final selection to Story 1.14.** Both providers are kept on the table; the build pipeline (ADR 0017) emits a static `web/dist/` directory deployable to either via a one-line CLI invocation.

**Evidence that will drive the Story 1.14 decision:**

1. **Measured asset bundle size** under NFR-P5 (≤150 MB compressed full bundle). Bandwidth tier headroom matters once the bundle size is real, not estimated.
2. **CSP header requirements from Story 7.4** (or whichever story finalizes the strict CSP). Configuration ergonomics (`_headers` file vs `vercel.json` block) decide which UX is preferred.
3. **Projected egress** based on the bundle size and expected traffic. Free-tier bandwidth caps differ substantially (Cloudflare's unlimited bandwidth on free tier vs Vercel's 100 GB/month).
4. **First operational rollback test.** Both providers offer atomic rollback; the UX during an actual incident is the deciding signal.
5. **Build-time provider lock-in audit.** Confirm `web/dist/` deploys to both without provider-specific build adapters (it should).

Until then, the project's deployment posture is "either works" and CI must not embed provider-specific knowledge beyond a thin shell step.

## Consequences

**Positive:**
- Architecture remains decoupled from hosting; build artifact is fully portable.
- Story 1.14 can pick based on measured data, not vendor brochures.
- Decoupling lets the project survive a provider's policy change (e.g., free-tier reduction) by switching with a one-line CLI change.

**Negative:**
- A concrete deploy doesn't happen until Story 1.14 lands. Mitigation: Epic 1 stories build to static `web/dist/` and CI verifies the artifact exists; the actual CDN push waits.
- Some configuration UX (custom headers, redirects, edge functions) cannot be designed until the provider is chosen.

**Obligations on downstream stories:**
- Story 1.14 makes the call, supersedes this ADR with a new one (`0028-cdn-provider-selected-X`), and updates the deploy step in CI (per ADR 0017).
- No story between now and Story 1.14 may bake in provider-specific assumptions (e.g., `_headers` syntax). All header config lives in a provider-neutral `web/dist/headers.json` (or equivalent) until the choice is made.

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

**Both meet every NFR.** The decision in Story 1.14 will be driven by measured bandwidth, real CSP-header friction, and the first operational rollback test. This ADR is deliberately Proposed (not Accepted) and will be superseded once that decision is made.

**Other options briefly considered and rejected:**

- **Netlify.** Comparable feature set to the two finalists, but the 100 GB/month free-tier bandwidth cap is identical to Vercel without an obvious differentiator; sticking with the two finalists keeps the decision tight.
- **GitHub Pages.** Rejected: no custom headers, no atomic rollback story, limited control over caching behavior — violates NFR-R2 and NFR-S2.
- **S3 + CloudFront.** Rejected: not free; requires AWS account, billing setup, and significantly more configuration for a static-site artifact; over-spec for the portfolio scale.
- **Self-hosted Caddy / Nginx on a VPS.** Rejected: violates the hands-off-maintenance commitment (NFR-M6); requires uptime monitoring, OS patching, log management.
