// Story 6.4 AC6 — `primitives/dialog.ts`: shared focus-trap orchestration
// for Voyager's modal-ish surfaces. Per Rule 9 (ADR-0025 APG-primitive
// extraction discipline), when two or more components consume the same
// third-party primitive in the same shape, the shape moves into a
// primitive module rather than being duplicated inline.
//
// Today's consumers:
//   - `<v-help-overlay>` — modal dialog (Story 2.8) with `role="dialog"`
//     and a Close button.
//   - `<v-chapter-index>` — listbox-in-a-modal (Story 2.3) with
//     `role="listbox"` inside a `.panel` host.
//
// Both consume `focus-trap` with the same option block — only the
// `initialFocus` callback differs (a Close button vs. the currently-
// focused option). The activate / deactivate path with the defensive
// try / catch + console.warn diagnostics is the duplicated shape.
//
// Future-consumer obligation (Rule 9): any new dialog-like surface
// (e.g. a future settings overlay, a chapter-detail modal, etc.) MUST
// consume `createDialogFocusTrap` rather than re-instantiating
// `focus-trap` inline. Code review treats inline re-implementation as
// a HIGH finding.

import { createFocusTrap, type FocusTrap } from 'focus-trap';

/**
 * Options forwarded to `focus-trap`'s `createFocusTrap`. Mirrors the
 * subset both `<v-help-overlay>` and `<v-chapter-index>` use today.
 */
export interface DialogFocusTrapOptions {
  /**
   * The element to scope the trap to. For Voyager components this is
   * typically the `.dialog` or `.panel` element inside a shadow root.
   */
  host: HTMLElement;
  /**
   * Callback that returns the element to focus when the trap activates.
   * Mirrors `focus-trap`'s `initialFocus` shape.
   */
  initialFocus: () => HTMLElement | undefined | null;
  /**
   * Human-readable component name used in diagnostic console.warn
   * messages when activation / deactivation fails. Example: `'v-help-overlay'`.
   */
  componentName: string;
}

/**
 * Handle returned to consumers — opaque from their perspective, but
 * carries activate / deactivate methods. Mirrors the `focus-trap`
 * library's `FocusTrap` interface so existing consumers can drop in.
 */
export interface DialogFocusTrap {
  activate(): void;
  deactivate(): void;
  /**
   * Direct accessor for the underlying `focus-trap` instance. Exposed
   * for tests that need to introspect activation state; production
   * code should prefer `activate()` / `deactivate()`.
   */
  readonly raw: FocusTrap;
}

/**
 * Construct a Voyager-flavoured focus-trap with the project's defensive
 * activate / deactivate posture. The trap:
 *
 *   - DOES NOT trap-deactivate on Esc or click-outside — Voyager
 *     components own those interactions explicitly so they can emit
 *     their own custom events.
 *   - DOES NOT restore focus on deactivate — Voyager components own
 *     the focus-restore path so the toggle button receives focus on
 *     close even when the trap activation itself didn't fire (e.g.
 *     synchronous open/close in tests).
 *   - DOES descend into shadow roots via `tabbableOptions.getShadowRoot`.
 *   - DOES skip layout-based tabbable filtering via
 *     `tabbableOptions.displayCheck: 'none'` — required for happy-dom /
 *     jsdom tests where layout is not computed.
 */
export function createDialogFocusTrap(
  opts: DialogFocusTrapOptions,
): DialogFocusTrap {
  const raw = createFocusTrap(opts.host, {
    escapeDeactivates: false,
    clickOutsideDeactivates: false,
    returnFocusOnDeactivate: false,
    initialFocus: () => opts.initialFocus() ?? opts.host,
    tabbableOptions: {
      getShadowRoot: true,
      displayCheck: 'none',
    },
  });
  return {
    raw,
    activate(): void {
      try {
        raw.activate();
      } catch (err) {
        // Activation can fail in test environments without layout.
        // Real-browser failures are defects — surface them as a warn
        // so the next contributor sees the diagnostic in DevTools.
        console.warn(
          `[${opts.componentName}] focus-trap activation failed:`,
          err,
        );
      }
    },
    deactivate(): void {
      try {
        raw.deactivate();
      } catch (err) {
        console.warn(
          `[${opts.componentName}] focus-trap deactivation failed:`,
          err,
        );
      }
    },
  };
}
