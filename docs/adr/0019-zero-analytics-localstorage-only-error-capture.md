# ADR 0019 — Zero Analytics; localStorage-Only Error Capture

Status: Accepted (amended in-place 2026-05-24 per Rule 5 by Story 6.1)
Date: 2026-05-18 (original); 2026-05-24 (amendment)
Deciders: Voyager project maintainer

<!--
Rule 5 amendment (Story 6.1, 2026-05-24) — original wording preserved
verbatim below for the audit trail.

ORIGINAL (2026-05-18, lines as accepted):
  The ADR title is "Zero Analytics; localStorage-Only Error Capture". The
  ADR's Decision section reads "Error capture: localStorage-only." and
  scopes every localStorage use in the project to error-capture (the
  `voyagerErrors` key written by `window.onerror` and
  `window.onunhandledrejection`). The Status line read "Accepted." with no
  amendment annotation.

AMENDED (2026-05-24, Story 6.1):
  The "localStorage-only error capture" phrasing was authored when
  `voyagerErrors` was the only anticipated localStorage use. Story 6.1
  introduces a second, deliberately-scoped use — the
  `voyager.audio-toggle` key holding `{ sessionId, on }` for session-
  gated audio-toggle persistence (UX-DR15). Both writes are local-only
  by construction: no analytics, no PII, no third-party transmission, no
  cross-session leakage (the audio toggle's `sessionId` discipline
  ensures a fresh-tab/new-day resets the toggle to off).

  The amendment is in-place per Rule 5 (NFR tripwire response). The
  original wording is preserved verbatim above so a future contributor
  can audit the drift; the rest of the ADR (Context, Decision, Known
  Exceptions, Alternatives Considered) is updated below to describe
  the two-use posture as the new source of truth.

  RATIONALE: localStorage is the only client-side persistence surface
  available under the no-server commitment (NFR-Sc1). Per UX-DR15 the
  audio toggle MUST persist across same-tab reloads but MUST reset on a
  new tab — `sessionStorage` is wrong (it would reset on every reload),
  `IndexedDB` is overkill for a single boolean, and a fresh `sessionId`
  comparison against the localStorage value gives the exact "same-tab
  preserves, new-tab resets" semantic the UX spec demands. The
  expansion does not breach the zero-analytics / zero-PII / no-server
  commitments — those are about the content that is written, not
  about which storage surface holds it.
-->

## Status

Accepted. The artifact ships **zero analytics, zero cookies, zero third-party tracking scripts**. Error capture is local-only via `localStorage`. Verified at build time by the no-PII grep gate at `web/tests/no-pii-grep.test.ts`.

## Context

FR50 and NFR-S8 commit the project to zero PII collection and no tracking. The trade-off is real: lose user-behavior visibility, gain zero consent-banner / GDPR / CCPA / COPPA work and a clean conscience on a portfolio piece intended for educational reach.

Error capture is the harder question. Production sites usually pipe errors to Sentry / Rollbar / a custom endpoint. Doing so would create a server-side dependency and a PII surface (stack traces can contain user-typed data; user agents can be fingerprintable). The architectural commitment to no-server (NFR-Sc1) plus no-PII rules out external error capture entirely.

[Source: _bmad-output/planning-artifacts/architecture.md#Decision-8a]
[Source: _bmad-output/planning-artifacts/architecture.md#Decision-8b]
[Source: _bmad-output/planning-artifacts/prd.md#FR50]
[Source: _bmad-output/planning-artifacts/prd.md#NFR-S8]

## Decision

**Analytics: zero.** No Google Analytics, no Plausible, no Fathom, no Cloudflare Web Analytics, no pixel tracking, no third-party scripts of any kind.

**Error capture: localStorage-only.**

- `window.onerror` and `window.onunhandledrejection` handlers write to `localStorage.voyagerErrors`.
- Capped at last 10 errors (FIFO); each entry is `{ timestamp, message, stack, url, userAgent }`.
- A `/debug` route renders the log as readable text and provides a "copy to clipboard" button.
- Bug reports: user pastes their localStorage error log into a GitHub issue.
- Zero external dependencies; zero PII surface; ~50 lines of code; survives the no-server commitment.

**Second localStorage use case (Story 6.1, 2026-05-24 amendment): audio-toggle session-scoped preference.**

- `AudioPlaybackService` writes `localStorage.voyager.audio-toggle` with JSON `{ sessionId: string, on: boolean }`.
- The `sessionId` is a fresh `crypto.randomUUID()` generated once at boot; reading from localStorage compares the persisted `sessionId` against the boot-time value and ignores the persisted `on` value if they differ (resetting the toggle to off on a new tab / new day / browser restart).
- Wrapped in try/catch; falls back to in-memory state on storage failure (private mode, test envs, etc.).
- Per UX-DR15 / FR43 — local-only by construction; no analytics, no PII, no third-party transmission.
- Documented end-to-end at [`docs/audio/golden-record-curation.md`](../audio/golden-record-curation.md) § "Runtime persistence contract".

**Verification at build time:**

- `web/tests/no-pii-grep.test.ts` is the codification mechanism. It scans every file under the repo for known PII / tracking patterns (`gtag`, `analytics.google`, `mixpanel`, `segment`, `posthog`, `telemetry`, etc.).
- The test is paired with a *no-stale-exceptions* check that fails if a documented exception no longer matches any line in the repo, ensuring the exception list does not accumulate dead entries.

## Consequences

**Positive:**
- Zero PII surface; no consent banner; no privacy policy beyond a short statement; no GDPR / CCPA / COPPA work.
- No third-party JavaScript on the page; CSP can be strict (`script-src 'self'` only; see NFR-S2).
- No cross-origin runtime fetches (NFR-S9); the artifact is fully self-contained at runtime.
- Bug reports are higher-trust by construction: users explicitly opt-in by copying their log.

**Negative:**
- No quantitative "how many people loaded the page today" signal. Acceptable: this is a portfolio piece; success is qualitative.
- Bug reproduction requires user effort (paste their `/debug` log). Mitigated by the explicit clipboard helper.
- Cannot use a server-side error capture later without superseding this ADR.

**Obligations on downstream stories:**
- The no-PII grep test (Story 1.1) is the *codification mechanism*. Any future story that introduces a documented exception must also extend the test's exception list AND the paired no-stale-exceptions check.
- The `/debug` route and error-handler wiring land in Epic 7 / Story 7.x.
- The strict CSP work (Story 7.4 or equivalent) enforces `script-src 'self'` at the header level; CDN provider choice (ADR 0016) factors in this header configurability.

## Known Exceptions

The no-PII grep gate codifies two documented exceptions from Story 1.1:

1. **`web/package-lock.json` SHA-512 hash containing `GtAg`** — the npm integrity hash for `@types/esrecurse@4.3.1` happens to contain the case-insensitive substring `GtAg`, which matches the `gtag` pattern. This is a cryptographic integrity check on a TypeScript type-definition package, not a reference to Google Analytics `gtag.js`. No telemetry implication.

2. **`@opentelemetry/api` as an optional `peerDependency` of vitest** — vitest declares `@opentelemetry/api` as an optional `peerDependency`. The package is **not installed** (`web/node_modules/@opentelemetry/` does not exist), vitest is a `devDependency`, and the production browser artifact ships **zero OpenTelemetry bytes**. The no-PII grep gate's structural assertion verifies the dep remains optional and is not actually installed; if either premise changes (the package becomes installed transitively, OR the peer declaration loses its `optional: true` flag), the test fails and forces re-authoring this section. Captured here per Story 1.2's fold-in of the Story 1.1 deferred-work item.

Verbatim from Story 1.1 Completion Notes: *"unrealized peer; zero OTEL bytes in the production artifact; the no-PII grep gate at `web/tests/no-pii-grep.test.ts` codifies the exception with a paired no-stale-exceptions check."*

## Alternatives Considered

- **Self-hosted analytics (Plausible self-hosted, Umami).** Rejected: requires a server (violates NFR-Sc1); operational burden; even self-hosted, IPs are still PII under GDPR.
- **Cookieless first-party analytics (Cloudflare Web Analytics, Vercel Analytics).** Rejected: still a third-party script load (violates strict CSP and zero-third-party-script commitment); the "cookieless" framing doesn't change the PII surface materially.
- **Sentry for error capture.** Rejected: third-party SaaS; PII concerns; CSP would need to allow Sentry's domain; runtime dependency.
- **In-page logger that POSTs to a serverless function we own.** Rejected: requires a server (NFR-Sc1 violation); even our own endpoint creates a PII surface.
- **No error capture at all.** Rejected: bug reports become irreproducible. The localStorage-only approach gives 80% of the value at zero infrastructure cost.
