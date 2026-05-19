// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BufferGeometry, Group } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';

import {
  TrajectoryLines,
  VERTICES_PER_SPACECRAFT_TRAJECTORY,
  type PositionProvider,
} from './trajectory-lines';
import { worldVec3 } from '../types/branded';
import {
  V1_LAUNCH_ET,
  V2_LAUNCH_ET,
  MISSION_END_ET,
} from '../constants/mission';

/**
 * Linear position provider: each spacecraft moves along a fixed axis at
 * unit km/sec from launch. Trivial to reason about for split-point tests.
 *  - V1 (-31) starts at (0,0,0) at V1_LAUNCH_ET, moves along +x.
 *  - V2 (-32) starts at (0,0,0) at V2_LAUNCH_ET, moves along +y.
 */
const linearProvider: PositionProvider = (et, naifId) => {
  if (naifId === -31) {
    return worldVec3(et - V1_LAUNCH_ET, 0, 0);
  }
  if (naifId === -32) {
    return worldVec3(0, et - V2_LAUNCH_ET, 0);
  }
  return null;
};

describe('Story 1.12 — TrajectoryLines', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('constructs a Group named TrajectoryLines with 4 Line2 children', () => {
    const lines = new TrajectoryLines(linearProvider);
    expect(lines.root).toBeInstanceOf(Group);
    expect(lines.root.name).toBe('TrajectoryLines');
    const line2Children = lines.root.children.filter((c) => c instanceof Line2);
    expect(line2Children.length).toBe(4);
  });

  it('past line uses solid material; future line uses dashed material', () => {
    const lines = new TrajectoryLines(linearProvider);
    const v1 = lines._peekSet('voyager-1');
    expect(v1.pastMaterial.dashed).toBe(false);
    expect(v1.futureMaterial.dashed).toBe(true);
  });

  it('past line is wider than future line (FR49 non-color-only encoding)', () => {
    const lines = new TrajectoryLines(linearProvider);
    const v1 = lines._peekSet('voyager-1');
    expect(v1.pastMaterial.linewidth).toBeGreaterThan(v1.futureMaterial.linewidth);
  });

  it('past and future line colors are distinct (visual + style encoding)', () => {
    const lines = new TrajectoryLines(linearProvider, {
      pastColorOverride: '#ffffff',
      futureColorOverride: '#333333',
    });
    const v1 = lines._peekSet('voyager-1');
    expect(v1.pastMaterial.color.getHex()).not.toBe(v1.futureMaterial.color.getHex());
  });

  it('samples VERTICES_PER_SPACECRAFT_TRAJECTORY vertices for each spacecraft', () => {
    const lines = new TrajectoryLines(linearProvider);
    const v1 = lines._peekSet('voyager-1');
    const v2 = lines._peekSet('voyager-2');
    expect(v1.sampledEts.length).toBe(VERTICES_PER_SPACECRAFT_TRAJECTORY);
    expect(v2.sampledEts.length).toBe(VERTICES_PER_SPACECRAFT_TRAJECTORY);
    expect(v1.sampledPositions.length).toBe(VERTICES_PER_SPACECRAFT_TRAJECTORY * 3);
  });

  it('first sampled ET is at launch; last sampled ET is at MISSION_END_ET', () => {
    const lines = new TrajectoryLines(linearProvider);
    const v1 = lines._peekSet('voyager-1');
    expect(v1.sampledEts[0]).toBeCloseTo(V1_LAUNCH_ET, 6);
    expect(v1.sampledEts[v1.sampledEts.length - 1]).toBeCloseTo(MISSION_END_ET, 6);
  });

  it('tick(et=launchEt): past line is degenerate; future line spans full polyline (AC8)', () => {
    const lines = new TrajectoryLines(linearProvider);
    lines.tick(V1_LAUNCH_ET);
    const v1 = lines._peekSet('voyager-1');
    const pastStart = v1.pastLine.geometry.attributes.instanceStart;
    const futureStart = v1.futureLine.geometry.attributes.instanceStart;
    // Degenerate past = 1 segment (start == end), which is `instanceCount === 1`.
    expect(pastStart.count).toBe(1);
    // Future = (VERTICES_PER_SPACECRAFT_TRAJECTORY - 1) segments.
    expect(futureStart.count).toBe(VERTICES_PER_SPACECRAFT_TRAJECTORY - 1);
  });

  it('tick(et=midMission): past+future segment counts sum to ~full polyline', () => {
    const lines = new TrajectoryLines(linearProvider);
    const midEt = (V1_LAUNCH_ET + MISSION_END_ET) / 2;
    lines.tick(midEt);
    const v1 = lines._peekSet('voyager-1');
    const pastSegs = v1.pastLine.geometry.attributes.instanceStart.count;
    const futureSegs = v1.futureLine.geometry.attributes.instanceStart.count;
    // Past has k+2 vertices = k+1 segments (where k is the split index, plus
    // the split vertex itself). Future has (n-k) vertices = (n-k-1) segments.
    // Sum = (k+1) + (n-k-1) = n segments total. The split vertex appears
    // in both polylines so the original (n-1) underlying segments + the
    // 2 split-edge segments - 1 shared = n. This is the expected midpoint
    // segment count for any non-degenerate split.
    expect(pastSegs + futureSegs).toBe(VERTICES_PER_SPACECRAFT_TRAJECTORY);
  });

  it('tick(et=MISSION_END_ET): past line spans full polyline; future line is degenerate', () => {
    const lines = new TrajectoryLines(linearProvider);
    lines.tick(MISSION_END_ET);
    const v1 = lines._peekSet('voyager-1');
    expect(v1.pastLine.geometry.attributes.instanceStart.count).toBe(
      VERTICES_PER_SPACECRAFT_TRAJECTORY - 1,
    );
    expect(v1.futureLine.geometry.attributes.instanceStart.count).toBe(1);
  });

  it('tick(et) is idempotent: calling twice at same ET yields same vertex counts', () => {
    const lines = new TrajectoryLines(linearProvider);
    const mid = (V1_LAUNCH_ET + MISSION_END_ET) / 2;
    lines.tick(mid);
    const v1 = lines._peekSet('voyager-1');
    const past1 = v1.pastLine.geometry.attributes.instanceStart.count;
    const future1 = v1.futureLine.geometry.attributes.instanceStart.count;

    lines.tick(mid);
    expect(v1.pastLine.geometry.attributes.instanceStart.count).toBe(past1);
    expect(v1.futureLine.geometry.attributes.instanceStart.count).toBe(future1);
  });

  it('tick(et) handles backward scrubbing: past shrinks, future grows', () => {
    const lines = new TrajectoryLines(linearProvider);
    const forwardEt = V1_LAUNCH_ET + 0.8 * (MISSION_END_ET - V1_LAUNCH_ET);
    const backwardEt = V1_LAUNCH_ET + 0.2 * (MISSION_END_ET - V1_LAUNCH_ET);

    lines.tick(forwardEt);
    const v1 = lines._peekSet('voyager-1');
    const pastForward = v1.pastLine.geometry.attributes.instanceStart.count;
    const futureForward = v1.futureLine.geometry.attributes.instanceStart.count;

    lines.tick(backwardEt);
    const pastBackward = v1.pastLine.geometry.attributes.instanceStart.count;
    const futureBackward = v1.futureLine.geometry.attributes.instanceStart.count;

    expect(pastBackward).toBeLessThan(pastForward);
    expect(futureBackward).toBeGreaterThan(futureForward);
  });

  it('setResolution updates LineMaterial.resolution on all 4 lines', () => {
    const lines = new TrajectoryLines(linearProvider, { width: 1, height: 1 });
    lines.setResolution(1920, 1080);
    const v1 = lines._peekSet('voyager-1');
    const v2 = lines._peekSet('voyager-2');
    for (const mat of [v1.pastMaterial, v1.futureMaterial, v2.pastMaterial, v2.futureMaterial]) {
      expect(mat.resolution.x).toBe(1920);
      expect(mat.resolution.y).toBe(1080);
    }
  });

  it('AC6 — BufferGeometry.dispose() is NEVER called during 100 sequential tick()s', () => {
    const disposeSpy = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const lines = new TrajectoryLines(linearProvider);
    // Record the dispose count BEFORE the per-frame loop so construction
    // disposes (if any are added later) don't pollute the metric.
    const baseline = disposeSpy.mock.calls.length;
    for (let i = 0; i < 100; i++) {
      const et = V1_LAUNCH_ET + (i / 99) * (MISSION_END_ET - V1_LAUNCH_ET);
      lines.tick(et);
    }
    const perFrameDisposes = disposeSpy.mock.calls.length - baseline;
    expect(perFrameDisposes).toBe(0);
    disposeSpy.mockRestore();
  });

  it('null-position-provider builds zero-filled polyline without throwing', () => {
    const nullProvider: PositionProvider = () => null;
    expect(() => new TrajectoryLines(nullProvider)).not.toThrow();
  });
});
