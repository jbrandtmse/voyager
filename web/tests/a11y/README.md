## Story 6.4 — axe-core CI Expansion

This directory contains the axe-core test suite that gates NFR-A1 (WCAG 2.2 AA) on
every PR. Story 6.4 extends Story 1.7's baseline (single default-state check per
component) to the full component-state matrix plus the route matrix.

### Layout

- `helpers/` — shared utilities (`runAxe`, the impact filter, the canonical
  pattern).
- `components/` — one file per component, exercising each documented
  interactive state per AC1.
- `routes.spec.ts` — Playwright-driven route suite (every static route) per
  AC2. Gated behind `dist/` presence per Story 3.7's slow-tier discipline.

### Canonical pattern

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { runAxe, NO_VIOLATIONS } from '../helpers/run-axe';

describe('<v-foo> a11y matrix', () => {
  afterEach(() => {
    document.querySelectorAll('v-foo').forEach((el) => el.remove());
  });

  it('default state has no critical or serious violations', async () => {
    const el = document.createElement('v-foo');
    document.body.appendChild(el);
    await (el as any).updateComplete;
    const result = await runAxe(el);
    expect(result).toMatchObject(NO_VIOLATIONS);
  });
});
```

### Impact-tier gate (AC1, AC2)

- `critical` and `serious` violations FAIL the build.
- `moderate` and `minor` violations are reported in stdout as warnings and
  collected in the test output, but do NOT block the build.

### Discovering the gate in CI

The component-state tests under `tests/a11y/components/**.test.ts` are picked
up by the default vitest sweep (no opt-out marker). The route suite at
`routes.spec.ts` gates itself on `web/dist/index.html` presence so vitest can
parse the file without forcing a build; the full route checks run only after
`npm run build` populates `dist/`.

See [story-6.4](../../../_bmad-output/implementation-artifacts/6-4-axe-core-ci-expansion-and-manual-accessibility-test-layer.md).
