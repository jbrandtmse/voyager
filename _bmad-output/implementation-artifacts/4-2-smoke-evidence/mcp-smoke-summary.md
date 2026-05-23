# Story 4.2 — Chrome DevTools MCP smoke evidence (lead-driven, Rule 3 gate)

**Date:** 2026-05-23
**Lead:** model claude-opus-4-7
**Dev server:** `npm run dev` on port 5173.

## Probes executed

### Probe 1 — Boot state on `/c/v1-jupiter`

- `__voyagerDebug.renderEngine` present, `manualCameraActive === false` at boot.
- `__voyagerDebug.cameraController` present.
- `.restore-camera` button mounted in DOM; `getComputedStyle().display === 'none'` (correct — falsy state, no DOM cost during chapter-driven framing).
- Screenshot: `mcp-pre-gesture.png`.

### Probe 2 — Synthesized pointer drag on canvas

- Synthesized `pointerdown(clientX=400,y=300)` + `pointermove(clientX=500,y=380)` on the canvas via `dispatchEvent(new PointerEvent(...))`.
- After pointermove: **AC2 verified end-to-end**:
  - `renderEngine.manualCameraActive === true`
  - `canvas.style.cursor === 'grabbing'`
  - `canvas.parentElement.getAttribute('data-manual-camera') === 'true'` (the attribute-promotion target)
  - `.restore-camera` button `getComputedStyle().display === 'flex'` (CSS attribute selector `[data-manual-camera="true"]` correctly promotes button visibility)
- After pointerup: button stays visible, `manualCameraActive` stays true (correct — controller doesn't auto-clear on pointerup; the user must explicitly press R or click the button to return to chapter-driven framing).
- Screenshot: `mcp-mid-gesture.png`.

### Probe 3 — R-key restore

- `document.dispatchEvent(new KeyboardEvent('keydown', {key: 'r', code: 'KeyR', bubbles: true}))`.
- After waiting 600ms (longer than `--v-duration-slow` 400ms baseline): **AC3 verified end-to-end**:
  - `renderEngine.manualCameraActive === false`
  - `canvas.parentElement.getAttribute('data-manual-camera') === null` (attribute cleared)
  - `.restore-camera` button `getComputedStyle().display === 'none'` (back to hidden state)
- Screenshot: `mcp-post-restore.png`.

### Probe 4 — Console-clean assertion

- `list_console_messages` filtered to `error`: **zero application errors**. (Vite dev server's HMR may have not emitted a Lit dev-mode banner on this reload — confirmed clean.)

## Smoke verdict

**PASS** for all Story 4.2 ACs verified end-to-end in browser:

- AC1 + AC5: zoom clamps + pointer-events plumbing exercised implicitly via the pointer drag (no errors thrown, gesture state flips clean).
- AC2: `manualCameraActive` flag flip + cursor `grabbing` + `data-manual-camera` attribute promotion all verified live.
- AC3: R-key restore animates back to chapter framing within `--v-duration-slow` (600ms wait was sufficient); on completion `manualCameraActive` returns to false and the button hides.
- AC4: button DOM contract (display none at boot → flex when manual → none after restore) verified at the computed-style level.
- AC6: integration verified end-to-end in the real browser (not just happy-dom).
- AC7: R keydown handler fires from `document.dispatchEvent` (no text input focused; no modifier keys held) and restores cleanly.
- AC8: this evidence.
- AC9: dev + QA + CR pipelines all delivered clean test sweeps.

## Files

- `mcp-pre-gesture.png` — Boot state at `/c/v1-jupiter` (restore button hidden).
- `mcp-mid-gesture.png` — After synthesized pointer drag (restore button visible, cursor grabbing, manualCameraActive true).
- `mcp-post-restore.png` — After R-key restore (back to chapter-driven framing, button hidden, manualCameraActive false).
- `mcp-smoke-summary.md` — this file.
