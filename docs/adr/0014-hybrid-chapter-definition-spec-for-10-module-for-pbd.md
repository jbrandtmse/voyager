# ADR 0014 — Hybrid Chapter Definition (Spec for 10, Module for PBD)

Status: Accepted
Date: 2026-05-18
Deciders: Voyager project maintainer

## Status

Accepted. Ten ordinary chapters share a single declarative `ChapterSpec` shape. The Pale Blue Dot chapter is a dedicated `ChapterModule` class. Both register through the same `ChapterDirector.register(spec | module)` interface.

## Context

The simulator has 11 chapters (FR21–FR30). Ten of them are structurally similar: an anchor ET, a time window, copy text, a view-frame target, optional audio cue, OG card key. The eleventh, the Pale Blue Dot (PBD), is fundamentally different: a scripted ~7-day choreographed turn-and-sweep with photo-plate compositing at scripted instants (Venus → Earth → Jupiter → Saturn → Uranus → Neptune).

A pure-declarative approach can't model PBD's choreography without becoming bloated. A pure-module approach makes the 10 ordinary chapters needlessly verbose. The friction point is that consumers (chapter index UI, scrubber markers, OG card pipeline) want to treat all 11 uniformly.

[Source: _bmad-output/planning-artifacts/architecture.md#Decision-4a]

## Decision

**Hybrid: declarative spec for the 10, dedicated module for PBD; unified registration interface.**

- **10 chapters** export a typed `ChapterSpec` from `web/src/chapters/<chapter-id>.ts`:
  ```typescript
  interface ChapterSpec {
    id: string;             // frozen per ADR 0001
    anchorEt: number;
    windowEt: [number, number];
    copy: string;           // TS template literal (per ADR 0021)
    viewFrameTarget: ViewFrameTarget;
    audioCue?: AudioCueRef;
    ogCardKey: string;
  }
  ```
- **PBD** lives at `web/src/scenes/pale-blue-dot/PaleBlueDotScene.ts` as a class implementing a shared `ChapterModule` interface. It owns the turn-and-sweep keyframes, per-target photo-plate compositing timing, and its own chapter copy.
- **Both register through the same `ChapterDirector.register(spec | module)`**, so chapter index, scrubber markers, OG card pipeline, and URL routing treat them uniformly.

## Consequences

**Positive:**
- The 10 ordinary chapters stay short, declarative, and reviewable as plain data.
- PBD gets the imperative latitude its choreography requires without forcing every chapter to expose imperative hooks.
- Consumers see one API surface (`ChapterDirector.register`), not two.
- Adding chapter #12 in v1.1 (a future encounter, say) is a one-file `ChapterSpec` addition.

**Negative:**
- The `ChapterModule` interface needs to be a superset of `ChapterSpec`'s observable surface — registration unification has a cost in shared type definition.
- Two patterns to learn instead of one. Mitigated by the volume asymmetry (10 spec-driven vs 1 module-driven).

**Obligations on downstream stories:**
- Epic 5 / Epic 6 chapter stories author `ChapterSpec` files per the shape above.
- Epic 6 / Story 6.x PBD-specific work implements `PaleBlueDotScene` against the `ChapterModule` interface.
- Scene lifecycle (`out` → `entering` → `held` → `exiting` → `passed`) is owned by `ChapterDirector.update(et)` and applies uniformly; PBD extends with internal substates (`turning`, `sweeping_<body>`, `composite_active`, `composite_decay`) without breaking the outer FSM.

## Alternatives Considered

- **Pure declarative spec for all 11.** Rejected: PBD's choreography would force `ChapterSpec` to include imperative escape hatches (e.g., `customScene: SceneClass`), which would either be unused on 10 chapters or pollute their shape.
- **Pure module class for all 11.** Rejected: 10 chapters become 10 boilerplate classes implementing nearly-identical lifecycle methods. The data-vs-code asymmetry of "10 short specs and 1 substantial module" matches reality.
- **PBD as a special-case branch inside `ChapterDirector`.** Rejected: pollutes the director with PBD-specific knowledge that doesn't generalize; breaks the symmetry of registration.
- **Mini-DSL for choreography (JSON or YAML keyframes for PBD).** Rejected: the photo-plate compositing logic is inherently imperative (which target to composite when, with what fade timing); a DSL would either be Turing-complete (i.e., a programming language) or too restrictive.

## Story 5.1 amendment — Path A integration topology (2026-05-23)

Story 5.1 landed the PBD module class (`web/src/chapters/pale-blue-dot/`) and chose **Path A** integration: `ChapterDirector` itself is unchanged (no `register(spec | module)` overload). Instead the PBD module's `update(currentEt)` is wired from `web/src/main.ts` via a dedicated subscriber that activates on `held` enter / deactivates on `from === 'held'` exit; the per-frame block calls `paleBlueDot.update(et)` only while activated.

Rationale: Path A satisfies the architectural commitment ("Both register through the same `ChapterDirector.register(spec | module)`") via the PBD module's re-exported `ChapterSpec` — `ALL_CHAPTERS` consumes the spec view uniformly with the other 10 chapters; the module class is the imperative escape hatch consumed by the main.ts subscriber. Path B (extending `ChapterDirector` with a `register(spec | module)` overload that dispatches `update(et)` to registered modules) is acceptable per the story spec but would have added a director-side imperative-dispatch surface that no other chapter uses. Path A keeps the director pure (no PBD-specific knowledge) and limits the special-case wiring to a single block in `main.ts`.

The `ChapterModule` interface (a superset of `ChapterSpec`) is declared in `web/src/types/chapter.ts` per Story 5.1 AC3 as the registration-unification surface. The PBD module class implements it; future chapters that warrant imperative behaviour (none in the current epic plan) would follow the same pattern.
