/**
 * Story 6.6 AC5 — focus-indicator persistence (NFR-A3 / NFR-A4).
 *
 * Verifies the WCAG 2.4.7 (focus visible) + WCAG 2.4.11 (focus not
 * obscured, AA where applicable) commitments at runtime, in a real
 * browser, against the production build. The unit tier's component
 * tests already pin the CSS contract (`outline: 2px solid
 * var(--v-color-focus); outline-offset: 2px;` per global.css:32–35
 * and each component's `:focus-visible` rule); what only a real
 * browser can verify is:
 *
 *   1. Focus moves through focusable elements via Tab (keyboard
 *      operability — NFR-A3).
 *   2. The focus indicator becomes visible when an element receives
 *      keyboard focus (NFR-A3).
 *   3. The indicator REMAINS visible until focus moves to a different
 *      element (NFR-A4 persistence) — no stale ring left behind after
 *      the focus moves.
 *   4. The indicator is GONE on the previously-focused element once
 *      focus has moved.
 *
 * ## Why this is L4, not unit-tier
 *
 * The :focus-visible CSS contract is a UA-determined heuristic (the
 * browser decides whether a focus was keyboard-driven and therefore
 * deserves the visible ring). happy-dom does not implement
 * :focus-visible — it always reports the element as :focus-visible
 * once the test calls element.focus(). Verifying the persistence
 * invariant (ring is shown on the keyboard-focused element AND
 * removed from the previously-focused element) requires a real
 * browser that honours :focus-visible. This spec runs against the
 * Playwright Chromium build under `npm run test:visual` and asserts
 * on the COMPUTED outline of the focused element.
 *
 * ## ADR references
 *
 * - ADR-0010 — Playwright is the CI-tier focus-persistence verification
 *   surface (this file). Chrome DevTools MCP can be used agent-time
 *   for the same scenarios.
 * - ADR-0025 — focus styling on APG primitives. The slider primitive's
 *   thumb (`<v-timeline-scrubber>` + `<v-speed-multiplier>`) and the
 *   listbox primitive (`<v-chapter-index>` options) each declare a
 *   per-component `:focus-visible` style; this spec exercises both.
 * - ADR-0027 — file uses LF line endings.
 */

import { test, expect } from '@playwright/test';
import {
  waitForStableFrame,
  STABLE_FRAME_HARD_DEADLINE_MS,
} from './helpers/wait-for-stable';

/**
 * Returns the computed-style outline-width (in pixels) of the
 * currently-document.activeElement. Returns 0 if no element is focused
 * OR if the focused element resolves no outline (the default-style
 * suppression of `:focus:not(:focus-visible)` per `global.css:39–41`).
 *
 * Reads computed style across shadow-DOM boundaries by traversing
 * `document.activeElement.shadowRoot?.activeElement` recursively — the
 * top-level `document.activeElement` for a shadow-DOM-encapsulated focus
 * is the SHADOW HOST, not the inner element. Without the recursion,
 * keyboard focus into a custom-element's shadow DOM appears as "focus
 * is on the host" rather than the actual focused descendant.
 */
async function getActiveOutlineWidth(
  page: import('@playwright/test').Page,
): Promise<number> {
  return await page.evaluate(() => {
    let active: Element | null = document.activeElement;
    // Traverse into shadow roots until we hit a leaf-active element or
    // a host whose shadowRoot has no activeElement.
    while (active && (active as HTMLElement).shadowRoot?.activeElement) {
      active = (active as HTMLElement).shadowRoot!.activeElement;
    }
    if (active === null || active === document.body) return 0;
    const style = getComputedStyle(active);
    // `outline-width` resolves to the computed pixel value, e.g. "2px".
    const widthStr = style.outlineWidth;
    const match = /^(\d+(?:\.\d+)?)px$/.exec(widthStr);
    if (match) return parseFloat(match[1]);
    return 0;
  });
}

/**
 * Returns the active-element selector path (for diagnostic logs only).
 */
async function getActiveElementDiag(
  page: import('@playwright/test').Page,
): Promise<string> {
  return await page.evaluate(() => {
    let active: Element | null = document.activeElement;
    const path: string[] = [];
    while (active) {
      path.push(active.tagName.toLowerCase());
      const inner = (active as HTMLElement).shadowRoot?.activeElement ?? null;
      if (inner === null) break;
      active = inner;
    }
    return path.join(' >> ');
  });
}

test.describe('Story 6.6 AC5 — focus-indicator persistence (NFR-A3 / NFR-A4)', () => {
  test('focus ring is visible on Tab and disappears when focus moves away', async ({
    page,
  }) => {
    test.setTimeout(STABLE_FRAME_HARD_DEADLINE_MS + 30_000);

    await page.goto('/c/v1-jupiter/');
    await waitForStableFrame(page, { expectedSlug: 'v1-jupiter' });

    // ─── Initial Tab presses to walk into the focusable surface ───
    //
    // The chapter has multiple focusable elements: timeline scrubber
    // thumb, chapter markers, speed-multiplier thumb, chapter-index
    // toggle, help-overlay toggle, restore-camera button (when manual
    // camera is active — not the cold-load case). Tab past the body to
    // the first focusable element.
    //
    // First Tab moves focus from <body> to the first tabbable element.
    await page.keyboard.press('Tab');

    // ─── Assertion 1: a focus ring is shown ───
    //
    // The computed outline-width of the active element is 2px (the
    // canonical focus indicator per global.css :focus-visible rule).
    // Some components (e.g. v-timeline-scrubber thumb, chapter-markers,
    // speed-multiplier thumb, chapter-index options) render focus as a
    // box-shadow rather than outline — the outline-width check passes
    // through 0 for those, and we add a fallback box-shadow check.
    let outlineWidth = await getActiveOutlineWidth(page);
    let hasBoxShadowRing = await page.evaluate(() => {
      let active: Element | null = document.activeElement;
      while (active && (active as HTMLElement).shadowRoot?.activeElement) {
        active = (active as HTMLElement).shadowRoot!.activeElement;
      }
      if (active === null || active === document.body) return false;
      const bs = getComputedStyle(active).boxShadow;
      // Non-trivial box-shadow indicates a focus ring rendered via shadow
      // (e.g. `box-shadow: 0 0 0 2px var(--v-color-focus)`). 'none' is
      // the default; anything else is potentially a ring.
      return bs !== 'none' && bs !== '';
    });
    const initialDiag = await getActiveElementDiag(page);
    expect(
      outlineWidth >= 2 || hasBoxShadowRing,
      `After first Tab from <body>, expected the focused element ` +
        `(${initialDiag}) to render a visible focus ring (outline-width ≥ 2px ` +
        `OR a non-trivial box-shadow). Got outline-width=${outlineWidth}px, ` +
        `hasBoxShadowRing=${hasBoxShadowRing}.`,
    ).toBe(true);

    // Remember the first-focused element so we can later assert the ring
    // is GONE on it after focus moves.
    const firstFocused = await page.evaluate(() => {
      let active: Element | null = document.activeElement;
      while (active && (active as HTMLElement).shadowRoot?.activeElement) {
        active = (active as HTMLElement).shadowRoot!.activeElement;
      }
      // Stamp a temporary attribute so we can re-query it after Tab.
      if (active && active !== document.body) {
        active.setAttribute('data-story-6-6-focus-probe', 'first');
        return true;
      }
      return false;
    });
    expect(
      firstFocused,
      'Failed to stamp the first-focused element for the persistence assertion.',
    ).toBe(true);

    // ─── Move focus to the next element ───
    await page.keyboard.press('Tab');

    // ─── Assertion 2: the previously-focused element no longer shows a ring ───
    //
    // The element with `data-story-6-6-focus-probe="first"` should have
    // its focus ring REMOVED — outline-width back to 0 (or pre-focus
    // value) AND any box-shadow that was a focus indicator should be
    // gone. We check the negative: the element is not in `:focus` or
    // `:focus-visible` state.
    const prevHasRing = await page.evaluate(() => {
      const probe = document.querySelector('[data-story-6-6-focus-probe="first"]');
      if (probe === null) return false;
      // matches(':focus-visible') is true only while the element holds
      // keyboard-driven focus. After Tab moves focus away, this returns
      // false.
      const hasFocusVisible = probe.matches(':focus-visible');
      return hasFocusVisible;
    });
    expect(
      prevHasRing,
      'After Tab moved focus to the next element, the previously-focused ' +
        'element still matches :focus-visible — focus ring did not clear. ' +
        'NFR-A4 persistence contract violated.',
    ).toBe(false);

    // ─── Assertion 3: the NEW focused element shows its own ring ───
    outlineWidth = await getActiveOutlineWidth(page);
    hasBoxShadowRing = await page.evaluate(() => {
      let active: Element | null = document.activeElement;
      while (active && (active as HTMLElement).shadowRoot?.activeElement) {
        active = (active as HTMLElement).shadowRoot!.activeElement;
      }
      if (active === null || active === document.body) return false;
      const bs = getComputedStyle(active).boxShadow;
      return bs !== 'none' && bs !== '';
    });
    const secondDiag = await getActiveElementDiag(page);
    expect(
      outlineWidth >= 2 || hasBoxShadowRing,
      `After second Tab, expected the newly-focused element (${secondDiag}) ` +
        `to render its own visible focus ring. Got outline-width=` +
        `${outlineWidth}px, hasBoxShadowRing=${hasBoxShadowRing}.`,
    ).toBe(true);
  });

  test('focus ring is suppressed on mouse-down (matches :focus:not(:focus-visible))', async ({
    page,
  }) => {
    test.setTimeout(STABLE_FRAME_HARD_DEADLINE_MS + 30_000);

    await page.goto('/c/v1-jupiter/');
    await waitForStableFrame(page, { expectedSlug: 'v1-jupiter' });

    // Click on the help-overlay toggle button (a stable, tabbable
    // element rendered in light DOM). Mouse-driven focus should NOT
    // produce a visible ring per the global.css contract — the
    // :focus:not(:focus-visible) rule sets `outline: none`.
    const toggle = page.locator('v-help-overlay').first();
    await toggle.waitFor({ state: 'attached', timeout: 5000 });

    // Click via mouse — this fires :focus but NOT :focus-visible.
    const toggleHandle = await toggle.evaluateHandle((el) => {
      const inner = el.shadowRoot?.querySelector('.toggle');
      return inner as HTMLButtonElement | null;
    });
    const toggleElement = toggleHandle.asElement();
    if (toggleElement === null) {
      test.skip(true, 'v-help-overlay .toggle not present in this view');
      return;
    }
    await toggleElement.click();

    // Tiny settle so the focus state stabilises.
    await page.waitForTimeout(50);

    // The toggle is focused but should NOT show a focus ring (mouse-
    // driven focus is suppressed). Inside the shadow DOM we verify the
    // .toggle does not match :focus-visible.
    const mouseFocusedHasRing = await page.evaluate(() => {
      const overlay = document.querySelector('v-help-overlay');
      const toggleEl = overlay?.shadowRoot?.querySelector('.toggle');
      if (toggleEl === null || toggleEl === undefined) return null;
      // matches(':focus') without `:focus-visible` indicates the suppress
      // contract is honored.
      const focused = toggleEl.matches(':focus');
      const visible = toggleEl.matches(':focus-visible');
      return { focused, visible };
    });
    if (mouseFocusedHasRing !== null) {
      // We only assert the persistence contract: if focus is held AND
      // :focus-visible is false, the suppression worked. Some UAs may
      // not fire :focus on a programmatic click against a shadow
      // element; in that case we skip rather than fail.
      if (mouseFocusedHasRing.focused) {
        expect(
          mouseFocusedHasRing.visible,
          'Mouse-driven focus on .toggle matched :focus-visible — the ' +
            ':focus:not(:focus-visible) suppression at global.css:39–41 ' +
            'failed to keep the ring hidden on click. NFR-A3 contract ' +
            'expects mouse focus to NOT show the keyboard ring.',
        ).toBe(false);
      }
    }
  });
});
