# ADR 0015 — Service Graph + Lit Reactive Controllers (No Global Store)

Status: Accepted
Date: 2026-05-18
Deciders: Voyager project maintainer

## Status

Accepted. State and behavior are organized as a service graph with constructor-injected dependencies and a tiny observable seam. No Redux, MobX, Zustand, Jotai, RxJS, signals library, event bus, or DI container.

## Context

The simulator is a per-frame data pipeline more like a game engine than a CRUD UI:

- `ClockManager.simTimeEt` is the per-frame heartbeat.
- Every consumer (`EphemerisService`, `AttitudeService`, `ViewFrame`, `MissionPhaseFSM`, `HUDPresenter`, `URLSync`, `AudioLayer`, `ChapterDirector`, `ChunkLoader`) reads it once per frame.
- State ownership is unambiguous per-service: every piece of state has exactly one owner.

A global-store architecture (Redux et al.) imposes a single mutable state tree and pub/sub indirection. At our scale (~16 services + presenters), this would be all overhead and no gain — the dependency graph is small enough that explicit injection beats indirection.

[Source: _bmad-output/planning-artifacts/architecture.md#Category-2-Runtime-Service-Decomposition]
[Source: _bmad-output/planning-artifacts/architecture.md#Decision-5]

## Decision

**Service graph with constructor-injected dependencies.** Services are regular TypeScript classes; constructors accept the dependencies they need; the boot-time wiring lives in `web/src/main.ts`.

**Communication patterns:**

- **Direct method calls** with constructor-injected dependencies. No service locator. No DI container.
- **Observable subscriptions** via a tiny per-service `subscribe(callback)` API. The implementation is ~20 lines of event-emitter; no library.
- **Lit Reactive Controllers** (`ServiceController<T>`) standardize the subscribe/unsubscribe wire-up between services and Lit components — components subscribe in `connectedCallback`, unsubscribe in `disconnectedCallback`.
- **For 60-FPS HUD updates** (date counter, distance readout): bypass Lit reactivity entirely. Register a per-frame callback with `RenderEngine.onFrame((et) => { this.dateEl.textContent = formatDate(et) })` and mutate DOM directly.

**State ownership doctrine:** every piece of state has exactly one owner. URL is *derived* from `ClockManager` + `ChapterDirector` (via `URLSync`); never authoritative. `ChunkLoader`'s `loading` flag is the sole input to `ClockManager`'s auto speed-cap behavior (FR7).

**Forbidden:** no global store (Redux, Zustand, Jotai); no reactive framework (RxJS, MobX); no event bus; no signals library; no DI container.

## Consequences

**Positive:**
- Service dependencies are explicit at construction time — the graph is greppable.
- No "mystery action / mystery reducer" indirection: a service method call is the call.
- Tiny runtime cost — the entire reactivity layer is `subscribe()` + `notify()` plus Lit's built-in `@property` decorator.
- Test setup is trivial: services are constructable with mock dependencies.
- AI agents reading the codebase see the dependency graph in service constructors, not buried in a `combineReducers` tree.

**Negative:**
- "Reactive at scale" patterns (computed derivations, dependency tracking across multiple stores) are unavailable. Acceptable: our state graph doesn't have that complexity.
- Cross-cutting state (e.g., embed-mode boolean from `?embed=true`) is constructor-injected into every consumer rather than read from a global. Mitigated by two boot-immutable globals (`EmbedModeState`, `AccessibilityState`) that are read-flat (no subscription), per architecture Category 2.
- Refactoring a service signature touches every constructor call site. Acceptable at this scale (~16 wirings in one file).

**Obligations on downstream stories:**
- Service classes live under `web/src/services/<name>.ts` with naming per architecture (`*Manager` for state owners, `*Service` for stateless queries, `*Renderer` for rendering).
- The `ServiceController<T>` Lit Reactive Controller pattern is implemented in Epic 6 / Epic 7 and reused across all UI components.
- The `forbidden-frameworks` test gate extends to forbid Redux, MobX, Zustand, Jotai, RxJS, and signals libraries appearing in the lockfile.

## Alternatives Considered

- **Redux / Redux Toolkit.** Rejected: ~10 KB runtime, single-store mental model misaligned with per-service ownership, action/reducer indirection is high cost for our scale.
- **MobX.** Rejected: ~20 KB runtime, observable-everywhere encourages implicit dependencies and obscures the data-flow graph that game-engine-style code thrives on.
- **Zustand or Jotai.** Rejected: smaller than Redux but still impose a store mental model; the indirection wins nothing at our component count.
- **`@preact/signals-core`.** Initially considered (per architecture Category 2's draft text); rejected once Lit Reactive Controllers proved sufficient. Lit's `@property` decorator inside components plus per-service `subscribe()` is the whole reactivity story.
- **RxJS.** Rejected: observables-as-first-class is overkill for a system whose `subscribe()` calls are sub-ten in count; the operator chain DSL adds complexity without payoff.
- **DI container (InversifyJS, tsyringe).** Rejected: constructor injection in `main.ts` is 20 lines of explicit wiring — a DI container would obscure rather than help.
- **Event bus (custom or `mitt`).** Rejected: event-bus-style decoupling allows messages to fan out unpredictably; service-graph constructor injection makes every dependency visible.
