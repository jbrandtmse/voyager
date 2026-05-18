# ADR 0010 — Chrome-DevTools MCP for Agent-Time + Playwright for CI-Time

Status: Accepted
Date: 2026-05-18
Deciders: Voyager project maintainer

## Status

Accepted. Chrome-DevTools MCP and Playwright are both committed; neither replaces the other.

## Context

Two distinct testing/inspection contexts exist:

1. **CI-time:** unattended, deterministic, gated. Runs in GitHub Actions on every commit. Must be reproducible, headless, and produce machine-readable pass/fail.
2. **Agent-time:** interactive, AI-assisted (Claude Code session). Needs visual inspection, performance profiling, console error spot-checks, and WebGL state inspection during precision debugging. Must be available inside an active IDE/agent session.

A single tool covering both contexts well does not exist. Picking one would either cripple the agent-time experience (Playwright is overkill for interactive dev) or break CI determinism (Chrome-DevTools MCP cannot run in GitHub Actions).

[Source: _bmad-output/planning-artifacts/architecture.md#Decision-8e]
[Source: _bmad-output/planning-artifacts/architecture.md#Decision-6d]

## Decision

Use **Chrome-DevTools MCP for agent-time work and Playwright for CI-time work.**

| Context | Tool | Use cases |
| --- | --- | --- |
| **CI-time (unattended, deterministic)** | Playwright | OG card generation (ADR 0018); L4 visual regression at 6 encounter scenes + launch + PBD; L5 E2E mission-timeline assertion |
| **Agent-time (Claude Code, interactive)** | Chrome-DevTools MCP | Phase 0 reverse-Z precision spike; PBD scene visual iteration; performance profiling (NFR-P2 P95/P99); Lighthouse TTI audits (NFR-P3); WebGL state inspection during precision debugging; chunk-prefetch network inspection (NFR-P6); console error spot-checks |

Both tools are committed as first-class. CI never invokes Chrome-DevTools MCP. Agent-time sessions can invoke Playwright if a CI-equivalent run is needed locally.

## Consequences

**Positive:**
- Right tool for each context; neither is forced into a workflow it's not built for.
- The Playwright harness is reused for *both* OG card generation and visual regression (single source of truth — see ADR 0018).
- Agent-time iteration is fast: Chrome-DevTools MCP gives AI agents direct access to DevTools without bouncing through a Playwright spec round-trip.

**Negative:**
- Two test surfaces to maintain. Mitigated: they cover non-overlapping use cases; there's no duplicate-spec problem.
- New contributors must learn both tools' roles. Documented in the README and the Epic 6 / Epic 7 stories that wire each tool in.

**Obligations on downstream stories:**
- Playwright is added as a devDependency under `web/` (Epic 7 / Story 7.x).
- Chrome-DevTools MCP is invoked via the Claude Code session's `mcp__chrome-devtools-mcp__*` tool surface — no project-side install or config.
- CI pipeline (ADR 0017) never references Chrome-DevTools MCP.

## Alternatives Considered

- **Playwright only.** Rejected for agent-time: the round-trip of writing a spec file, running headless Chromium, and parsing output is too slow for interactive precision spikes and visual iteration. Also, agent-time uses Lighthouse audits and live DevTools panes that Playwright doesn't expose cleanly.
- **Chrome-DevTools MCP only.** Rejected for CI-time: the MCP cannot run in GitHub Actions (no agent process); it's an interactive-session protocol, not a headless CI tool.
- **Cypress.** Rejected: Playwright is more mature for cross-browser headless work in 2026 and ships native screenshot/video; the project's testing pyramid already commits to Playwright in the architecture (L4/L5 layers).
- **Storybook / Chromatic for visual regression only.** Rejected: the visual regression target is full-canvas Three.js scenes, not isolated components. Playwright snapshotting the live page at canonical frames is a better fit (see ADR 0018).
