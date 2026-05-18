# ADR 0022 — Browser-Unsupported Fallback Page (Not Degraded Render)

Status: Accepted
Date: 2026-05-18
Deciders: Voyager project maintainer

## Status

Accepted. Browsers that don't pass the boot-time capability probe are redirected to a static `/unsupported.html` page. The simulator does not attempt to render in a degraded mode (no fallback canvas, no still-image substitute).

## Context

FR57 and NFR-C7 require a friendly browser-unsupported fallback page rather than a degraded render. The simulator depends on WebGL2 (Three.js WebGLRenderer minimum), WebAssembly (KTX2 texture decode), and Brotli decoding (for compressed VTRJ assets). Any of those missing means the simulator simply cannot run correctly.

Two design choices:

1. **Attempt to render degraded.** Hide features that require missing capabilities; substitute lower-quality assets; risk a broken-looking experience that erodes trust.
2. **Detect at boot, redirect to a static fallback page.** Honest about the requirement; clear UX; no half-broken render.

The capability-probe must happen *before* the main bundle loads (otherwise we've already paid the bandwidth cost). That means a tiny pre-bootstrap script in the HTML shell.

[Source: _bmad-output/planning-artifacts/architecture.md#Decision-6g]
[Source: _bmad-output/planning-artifacts/prd.md#FR57]
[Source: _bmad-output/planning-artifacts/prd.md#NFR-C7]

## Decision

**Boot-time capability probe + redirect to static fallback page.**

- A 1-KB inline pre-bootstrap script in `index.html` probes for WebGL2, WebAssembly, and Brotli decoding *before* the main bundle is fetched.
- If any capability is missing: `window.location.replace('/unsupported.html')`.
- `/unsupported.html` is a static page (FR57, NFR-C7) rendered at build time from the `<v-fallback-page>` Lit template into static HTML + inline CSS. **No runtime JS execution required** for the fallback to render — it's pure HTML/CSS.
- If all capabilities present: the pre-bootstrap script dynamic-imports the main bundle and the simulator boots.

The probe heuristic and the exact capability checks are owned by Epic 1 / Story 1.10 implementation.

## Consequences

**Positive:**
- Honest UX: users with unsupported browsers see a clear message, not a broken canvas.
- The fallback page itself doesn't depend on the technologies it's reporting as missing — it's pure HTML/CSS.
- Bandwidth-friendly: unsupported browsers don't fetch the full bundle.
- Single fallback page is easier to design and review than N degraded-mode partial renders.

**Negative:**
- Edge-case browsers that *almost* support everything still see the fallback. Acceptable: the project's compatibility tiers (NFR-C1–C3) are clear; "almost supported" is reasonably treated as "not supported" for a precision-critical visualization.
- The pre-bootstrap script is duplicated across every chapter's HTML shell (Vite multi-page input). Mitigation: it's small (~1 KB) and inline by design; sharing it via a runtime fetch would defeat the pre-bootstrap purpose.

**Obligations on downstream stories:**
- Story 1.10 / Epic 1 implements the inline pre-bootstrap probe in the Vite HTML template.
- Epic 6 / Story 6.x authors the `<v-fallback-page>` Lit template and the static-rendering pipeline that produces `/unsupported.html`.
- Vite's multi-page build (per Decision 7c) emits the same inline script in every chapter shell.

## Alternatives Considered

- **Degraded render with feature flags.** Rejected: produces a broken-looking experience; users blame the site, not their browser; conflicts with NFR-P8 (zero z-fighting, zero jitter) — a fallback render would necessarily have artifacts.
- **Still-image substitute (a screenshot when WebGL is missing).** Rejected: tells users "this exists" but not "your browser is the problem"; doesn't honor FR57's "friendly fallback" spec.
- **Detect-then-warn (let the user proceed if they want).** Rejected: users will proceed, see a broken simulation, and bounce.
- **No pre-bootstrap probe; let Three.js fail and render an error in the canvas.** Rejected: the user has already paid the bandwidth; the error UX is uglier than the static fallback.
- **Server-side User-Agent sniffing.** Rejected: no server (NFR-Sc1); UA strings are unreliable; capability probe at boot is the right place.
