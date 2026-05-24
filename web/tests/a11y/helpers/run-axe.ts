// @vitest-environment happy-dom
//
// Story 6.4 — canonical axe-core wrapper for component-state checks.
//
// Wraps `axe.run(container)` with the project's impact-tier gate:
//   - `critical` and `serious` violations are returned in `failures`
//     (callers assert `failures.length === 0`).
//   - `moderate` and `minor` violations are returned in `warnings` and
//     logged to stdout (one line per violation) so CI output surfaces
//     them without failing the build.
//
// The wrapper is colocated under `web/tests/a11y/helpers/` so component
// tests can import it via a stable relative path. It is intentionally
// dependency-free beyond `axe-core` itself so the import graph stays
// shallow for vitest startup time.

import axe, { type AxeResults, type Result, type ImpactValue } from 'axe-core';

/**
 * Canonical axe-core result envelope. The two failure tiers are split so
 * vitest assertions stay readable:
 *
 *     expect(result).toMatchObject(NO_VIOLATIONS);
 *
 * which asserts both `failures: []` and `warnings: []` would be too strict
 * (moderate/minor are advisory). Instead callers assert on `failures`:
 *
 *     expect(result.failures).toEqual([]);
 *
 * or the convenience matcher:
 *
 *     expect(result).toMatchObject(NO_VIOLATIONS);
 *
 * which expands to `{ failures: [] }` only.
 */
export interface AxeRunResult {
  /** critical + serious — block CI. */
  failures: Result[];
  /** moderate + minor — advisory; logged but not blocking. */
  warnings: Result[];
  /** Raw axe-core results for downstream introspection. */
  raw: AxeResults;
}

/** Convenience matcher for the happy path. */
export const NO_VIOLATIONS = { failures: [] as Result[] };

/**
 * axe-core is a singleton — at most one `axe.run()` can be in flight at a
 * time per process (the library throws "Axe is already running" otherwise).
 * vitest's default test parallelism within a file (concurrent describes
 * across files share the same worker module instance) means we MUST queue
 * runs through a single Promise chain. Serialisation cost is minimal:
 * happy-dom axe runs are ~10-50 ms each.
 */
let axeQueue: Promise<unknown> = Promise.resolve();

/**
 * Run axe-core against a DOM container. Returns the impact-tiered envelope.
 *
 * The runner uses axe's default ruleset (WCAG 2.0 + 2.1 + 2.2 AA + best-
 * practices). Story 6.4 deliberately does NOT customise the ruleset so the
 * CI gate stays aligned with axe-core's own conformance updates.
 *
 * Runs are serialised on the module-local `axeQueue` so multiple in-flight
 * tests don't trip axe-core's "already running" guard.
 *
 * @param container DOM element (e.g. the host component) to scope the run.
 */
export async function runAxe(container: Element): Promise<AxeRunResult> {
  const next = axeQueue.then(() => doRunAxe(container));
  // Keep the queue alive even on errors so subsequent runs don't deadlock.
  axeQueue = next.catch(() => undefined);
  return next;
}

async function doRunAxe(container: Element): Promise<AxeRunResult> {
  const raw = await axe.run(container, {
    // Story 6.4 AC1 — happy-dom doesn't compute layout, so a number of
    // axe checks that depend on bounding-box geometry produce false
    // positives. Disable the small handful of layout-sensitive rules
    // here; the route-level Playwright suite (AC2) catches them in
    // a real browser where layout is available.
    rules: {
      'color-contrast': { enabled: false },
      'target-size': { enabled: false },
      // Landmarks expect a real page wrapper; component-isolated tests
      // legitimately mount the component without `<main>` or `<body>`
      // landmark structure. The route suite re-enables this check.
      region: { enabled: false },
    },
  });
  const failures: Result[] = [];
  const warnings: Result[] = [];
  for (const v of raw.violations) {
    const impact = v.impact as ImpactValue | null | undefined;
    if (impact === 'critical' || impact === 'serious') {
      failures.push(v);
    } else {
      warnings.push(v);
    }
  }
  if (warnings.length > 0) {
    for (const w of warnings) {
      // Surface moderate/minor as CI-visible warnings without failing.
      console.warn(
        `[axe ${w.impact ?? 'unknown'}] ${w.id}: ${w.description} (${w.nodes.length} node${w.nodes.length === 1 ? '' : 's'})`,
      );
    }
  }
  return { failures, warnings, raw };
}

/**
 * Mount a component into `document.body`, return it after `updateComplete`.
 *
 * Shared boilerplate so component-state tests don't repeat the same setup.
 * Caller is responsible for removing the element in `afterEach`.
 */
export async function mountAndUpdate<T extends HTMLElement>(
  tagName: string,
  configure?: (el: T) => void,
): Promise<T> {
  const el = document.createElement(tagName) as T;
  if (configure) configure(el);
  document.body.appendChild(el);
  // Lit reactive properties settle after updateComplete.
  const maybeLit = el as unknown as { updateComplete?: Promise<unknown> };
  if (maybeLit.updateComplete) {
    await maybeLit.updateComplete;
  }
  return el;
}

/**
 * Remove all instances of a tag from `document.body`. Convenience for
 * `afterEach`.
 */
export function cleanupTag(tagName: string): void {
  document.querySelectorAll(tagName).forEach((el) => el.remove());
}
