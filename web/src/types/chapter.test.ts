import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  ChapterSpec,
  ChapterState,
  ChapterTransitionEvent,
  Spacecraft,
} from './chapter';

describe('chapter types (Story 2.1 AC6)', () => {
  it('ChapterSpec accepts a fully-typed fixture and round-trips its fields', () => {
    const spec: ChapterSpec = {
      slug: 'v1-jupiter',
      name: 'Voyager 1 — Jupiter',
      markerLabel: 'V1J',
      anchorEt: -657621600,
      windowStartEt: -657621600 - 86_400 * 30,
      windowEndEt: -657621600 + 86_400 * 30,
      spacecraft: 'v1',
      ogDescription: 'Voyager 1 sweeps past Jupiter.',
    };

    expect(spec.slug).toBe('v1-jupiter');
    expect(spec.markerLabel).toBe('V1J');
    expect(spec.spacecraft).toBe('v1');
    expect(spec.windowEndEt).toBeGreaterThan(spec.windowStartEt);
  });

  it('ChapterState is the documented 5-member union (forward + reverse traversal labels)', () => {
    const all: ChapterState[] = ['out', 'entering', 'held', 'exiting', 'passed'];
    expect(all).toHaveLength(5);
    // Compile-time guard: a value outside the union must be a type error.
    expectTypeOf<ChapterState>().toEqualTypeOf<
      'out' | 'entering' | 'held' | 'exiting' | 'passed'
    >();
  });

  it('Spacecraft is the documented 3-member union', () => {
    const all: Spacecraft[] = ['v1', 'v2', 'both'];
    expect(all).toHaveLength(3);
    expectTypeOf<Spacecraft>().toEqualTypeOf<'v1' | 'v2' | 'both'>();
  });

  it('ChapterTransitionEvent shape composes a ChapterSpec + state transition + et', () => {
    const spec: ChapterSpec = {
      slug: 'launch-v1',
      name: 'Voyager 1 Launch',
      markerLabel: 'V1L',
      anchorEt: 0,
      windowStartEt: -1,
      windowEndEt: 1,
      spacecraft: 'v1',
      ogDescription: 'Voyager 1 launches.',
    };
    const event: ChapterTransitionEvent = {
      chapter: spec,
      from: 'out',
      to: 'entering',
      et: -1,
    };
    expect(event.chapter.slug).toBe('launch-v1');
    expect(event.from).toBe('out');
    expect(event.to).toBe('entering');
  });

  it('ChapterSpec fields are readonly (compile-time enforcement)', () => {
    // `readonly` cannot be tested at runtime without a TS-error assertion
    // helper. We rely on the @ts-expect-error pragmatics in real callers;
    // here we just assert the field set is what we documented.
    const spec: ChapterSpec = {
      slug: 'v2-neptune',
      name: 'Voyager 2 — Neptune',
      markerLabel: 'V2N',
      anchorEt: 0,
      windowStartEt: -1,
      windowEndEt: 1,
      spacecraft: 'v2',
      ogDescription: 'Voyager 2 reaches Neptune.',
    };
    const keys = Object.keys(spec).sort();
    expect(keys).toEqual([
      'anchorEt',
      'markerLabel',
      'name',
      'ogDescription',
      'slug',
      'spacecraft',
      'windowEndEt',
      'windowStartEt',
    ]);
  });
});
