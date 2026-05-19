// @vitest-environment happy-dom
//
// Story 1.12 AC6 defense — spy on `BufferGeometry.prototype.dispose` and
// assert it is NEVER called during 100 sequential per-frame ticks. This is
// the load-bearing NFR-P2 perf constraint: incremental geometry updates
// must reuse the existing buffer attributes; allocating + disposing a new
// BufferGeometry every frame would blow the 16.7 ms/frame budget at ≥165
// AU cruise distances where per-frame state is already heavy.
//
// This test is intentionally living in `web/tests/` (the integration tier)
// rather than co-located with `trajectory-lines.test.ts` because the
// constraint applies to the *integration* between TrajectoryLines and the
// Three.js BufferGeometry contract, not just to TrajectoryLines' own
// internals. The co-located test also has an analogous in-suite spy; this
// file is the cross-cutting tripwire.

import { describe, it, expect, vi } from 'vitest';
import { BufferGeometry } from 'three';

import { TrajectoryLines, type PositionProvider } from '../src/render/trajectory-lines';
import { worldVec3 } from '../src/types/branded';
import { V1_LAUNCH_ET, MISSION_END_ET } from '../src/constants/mission';

const linearProvider: PositionProvider = (et, naifId) => {
  if (naifId === -31) return worldVec3(et - V1_LAUNCH_ET, 0, 0);
  if (naifId === -32) return worldVec3(0, et - V1_LAUNCH_ET, 0);
  return null;
};

describe('Story 1.12 AC6 — `BufferGeometry.dispose()` defense', () => {
  it('TrajectoryLines.tick() never calls BufferGeometry.dispose over 100 forward frames', () => {
    const lines = new TrajectoryLines(linearProvider);
    const disposeSpy = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const baseline = disposeSpy.mock.calls.length;
    for (let i = 0; i < 100; i++) {
      const t = i / 99;
      const et = V1_LAUNCH_ET + t * (MISSION_END_ET - V1_LAUNCH_ET);
      lines.tick(et);
    }
    const perFrameDisposes = disposeSpy.mock.calls.length - baseline;
    expect(
      perFrameDisposes,
      'TrajectoryLines.tick must not dispose BufferGeometry per frame ' +
        '(NFR-P2 ≤16.7ms/frame at cruise distances). Suspected regression: ' +
        'a code path now calls `geometry.dispose()` instead of mutating the ' +
        'existing position attribute in-place.',
    ).toBe(0);
    disposeSpy.mockRestore();
  });

  it('TrajectoryLines.tick() never calls BufferGeometry.dispose under non-monotonic scrub (backward jumps)', () => {
    const lines = new TrajectoryLines(linearProvider);
    const disposeSpy = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const baseline = disposeSpy.mock.calls.length;
    // Alternate forward/backward jumps to exercise the backward-scrub code
    // path in addition to monotonic playback.
    const ets = [
      V1_LAUNCH_ET,
      V1_LAUNCH_ET + 0.5 * (MISSION_END_ET - V1_LAUNCH_ET),
      V1_LAUNCH_ET + 0.2 * (MISSION_END_ET - V1_LAUNCH_ET),
      MISSION_END_ET,
      V1_LAUNCH_ET + 0.7 * (MISSION_END_ET - V1_LAUNCH_ET),
      V1_LAUNCH_ET + 0.1 * (MISSION_END_ET - V1_LAUNCH_ET),
    ];
    for (const et of ets) {
      lines.tick(et);
    }
    expect(disposeSpy.mock.calls.length - baseline).toBe(0);
    disposeSpy.mockRestore();
  });
});
