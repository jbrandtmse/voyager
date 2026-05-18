<!-- AUTO-GENERATED FILE — do not hand-edit.
     Regenerate with: python scripts/adr-index.py
     Source: docs/adr/[0-9][0-9][0-9][0-9]-*.md
     See ADR 0020 for the catalogue policy. -->

# Architectural Decision Records

This directory contains the Voyager project's Architectural Decision Records (ADRs).
Format: MADR minimal 5-section variant ([ADR 0020](0020-madr-format-for-adrs-docs-adr-location.md)).
New ADRs use the template at [`0000-template.md`](0000-template.md).

| # | Title | Status | Path |
| --- | --- | --- | --- |
| 0000 | [ADR NNNN — <Title>](0000-template.md) | Proposed | `docs/adr/0000-template.md` |
| 0001 | [ADR 0001 — URL Contract as Public API](0001-url-contract-as-public-api.md) | Accepted | `docs/adr/0001-url-contract-as-public-api.md` |
| 0002 | [ADR 0002 — Floating-Origin + Reverse-Z over Logarithmic Depth](0002-floating-origin-reverse-z-over-logarithmic-depth.md) | Accepted | `docs/adr/0002-floating-origin-reverse-z-over-logarithmic-depth.md` |
| 0003 | [ADR 0003 — Cubic Hermite over Catmull-Rom for Trajectories](0003-cubic-hermite-over-catmull-rom-for-trajectories.md) | Accepted | `docs/adr/0003-cubic-hermite-over-catmull-rom-for-trajectories.md` |
| 0004 | [ADR 0004 — Custom VTRJ Binary over JSON / Protobuf / Arrow / Parquet](0004-custom-vtrj-binary-over-json-protobuf-arrow-parquet.md) | Accepted | `docs/adr/0004-custom-vtrj-binary-over-json-protobuf-arrow-parquet.md` |
| 0005 | [ADR 0005 — Build-Time SpiceyPy Bake over jsSpice-in-WebAssembly](0005-build-time-spiceypy-bake-over-jsspice-wasm.md) | Accepted | `docs/adr/0005-build-time-spiceypy-bake-over-jsspice-wasm.md` |
| 0006 | [ADR 0006 — EXT_meshopt_compression over Draco](0006-ext-meshopt-compression-over-draco.md) | Accepted | `docs/adr/0006-ext-meshopt-compression-over-draco.md` |
| 0007 | [ADR 0007 — SpiceyPy over astroquery.jplhorizons](0007-spiceypy-over-astroquery-jplhorizons.md) | Accepted | `docs/adr/0007-spiceypy-over-astroquery-jplhorizons.md` |
| 0008 | [ADR 0008 — Three.js WebGLRenderer over WebGPURenderer for v1](0008-threejs-webglrenderer-over-webgpurenderer-v1.md) | Accepted | `docs/adr/0008-threejs-webglrenderer-over-webgpurenderer-v1.md` |
| 0009 | [ADR 0009 — No Web Workers for Trajectory Interpolation](0009-no-web-workers-for-trajectory-interpolation.md) | Accepted | `docs/adr/0009-no-web-workers-for-trajectory-interpolation.md` |
| 0010 | [ADR 0010 — Chrome-DevTools MCP for Agent-Time + Playwright for CI-Time](0010-chrome-devtools-mcp-agent-time-playwright-ci-time.md) | Accepted | `docs/adr/0010-chrome-devtools-mcp-agent-time-playwright-ci-time.md` |
| 0011 | [ADR 0011 — Git LFS for Kernel Storage + Auto-Acquisition Tool for Population](0011-git-lfs-kernel-storage-auto-acquisition-tool.md) | Accepted | `docs/adr/0011-git-lfs-kernel-storage-auto-acquisition-tool.md` |
| 0012 | [ADR 0012 — SCALE=1 km in Render-Space with Branded Vector Types](0012-scale-1km-render-space-branded-vector-types.md) | Accepted | `docs/adr/0012-scale-1km-render-space-branded-vector-types.md` |
| 0013 | [ADR 0013 — Lit 3+ Web Components over React / Preact / Svelte](0013-lit3-web-components-over-react-preact-svelte.md) | Accepted | `docs/adr/0013-lit3-web-components-over-react-preact-svelte.md` |
| 0014 | [ADR 0014 — Hybrid Chapter Definition (Spec for 10, Module for PBD)](0014-hybrid-chapter-definition-spec-for-10-module-for-pbd.md) | Accepted | `docs/adr/0014-hybrid-chapter-definition-spec-for-10-module-for-pbd.md` |
| 0015 | [ADR 0015 — Service Graph + Lit Reactive Controllers (No Global Store)](0015-service-graph-lit-reactive-controllers-no-global-store.md) | Accepted | `docs/adr/0015-service-graph-lit-reactive-controllers-no-global-store.md` |
| 0016 | [ADR 0016 — CDN Provider Selection (Deferred)](0016-cdn-provider-selection-deferred.md) | Proposed | `docs/adr/0016-cdn-provider-selection-deferred.md` |
| 0017 | [ADR 0017 — GitHub Actions for Build + CDN for Hosting](0017-github-actions-for-build-cdn-for-hosting.md) | Accepted | `docs/adr/0017-github-actions-for-build-cdn-for-hosting.md` |
| 0018 | [ADR 0018 — OG Card Generation via Playwright Against Built Site](0018-og-card-generation-via-playwright-against-built-site.md) | Accepted | `docs/adr/0018-og-card-generation-via-playwright-against-built-site.md` |
| 0019 | [ADR 0019 — Zero Analytics; localStorage-Only Error Capture](0019-zero-analytics-localstorage-only-error-capture.md) | Accepted | `docs/adr/0019-zero-analytics-localstorage-only-error-capture.md` |
| 0020 | [ADR 0020 — MADR Format for ADRs; `docs/adr/` Location](0020-madr-format-for-adrs-docs-adr-location.md) | Accepted | `docs/adr/0020-madr-format-for-adrs-docs-adr-location.md` |
| 0021 | [ADR 0021 — Chapter Copy in TS Template Literals (Not External MD Files)](0021-chapter-copy-in-ts-template-literals-not-external-md.md) | Accepted | `docs/adr/0021-chapter-copy-in-ts-template-literals-not-external-md.md` |
| 0022 | [ADR 0022 — Browser-Unsupported Fallback Page (Not Degraded Render)](0022-browser-unsupported-fallback-page-not-degraded-render.md) | Accepted | `docs/adr/0022-browser-unsupported-fallback-page-not-degraded-render.md` |
| 0023 | [ADR 0023 — Translation-Only View-Frame Blend (No Rotation Blend in v1)](0023-translation-only-view-frame-blend-no-rotation-blend-v1.md) | Accepted | `docs/adr/0023-translation-only-view-frame-blend-no-rotation-blend-v1.md` |
| 0024 | [ADR 0024 — Pre-Bake Quaternion Sign-Flip Walk](0024-pre-bake-quaternion-sign-flip-walk.md) | Accepted | `docs/adr/0024-pre-bake-quaternion-sign-flip-walk.md` |
| 0025 | [ADR 0025 — First-Party WAI-ARIA APG Patterns over Radix / Headless UI](0025-first-party-wai-aria-apg-patterns-over-radix-headless-ui.md) | Accepted | `docs/adr/0025-first-party-wai-aria-apg-patterns-over-radix-headless-ui.md` |
| 0026 | [ADR 0026 — TypeScript 6.x Ratification over 5.x](0026-typescript-6-ratification-over-5x.md) | Accepted | `docs/adr/0026-typescript-6-ratification-over-5x.md` |
| 0027 | [ADR 0027 — Line-Ending Normalization Policy](0027-line-ending-normalization-policy.md) | Accepted | `docs/adr/0027-line-ending-normalization-policy.md` |
