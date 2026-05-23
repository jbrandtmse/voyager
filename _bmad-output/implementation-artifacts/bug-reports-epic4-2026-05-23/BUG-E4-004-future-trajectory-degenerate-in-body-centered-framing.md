---
id: BUG-E4-004
title: Future-trajectory Line2 geometry has long runs of degenerate vertices in body-centered chapter framing
severity: medium
type: rendering / chunk-loader
discovered_during: epic-4-rewalk-2026-05-23
related_stories:
  - 4-1-viewframe-service-and-translation-only-smoothstep-blend
  - 4-3-cadence-shift-trajectory-chunks-and-4k-8k-texture-upgrade
  - 1-12-both-voyager-spacecraft-with-past-solid-future-dashed-trajectory-lines
related_epic: epic-4
---

## Summary

At `/c/v1-jupiter`, the V1 future-trajectory `Line2`'s `instanceStart` interleaved buffer contains many consecutive vertices with identical coordinates after a certain index — the line collapses to a single stationary point past index ~121 out of 486. The same pattern is observed on V2's future line.

## Evidence

At `/c/v1-jupiter`, samples from the `instanceStart` interleaved attribute on each future trajectory line:

```
voyager-1-future   instanceCount=486
  idx 0    → (-481848256, 627044864, 8234339.5)
  idx 121  → (-554751808, 589986560, 11818710)
  idx 243  → (-554751808, 589986560, 11818710)   ← same
  idx 364  → (-554751808, 589986560, 11818710)   ← same
  idx 485  → (-554751808, 589986560, 11818710)   ← same

voyager-2-future   instanceCount=485
  idx 0    → (-472480128, 536837664, 16918592)
  idx 121  → (-495673696, 537809152, 15899909)
  idx 242  → (-495673696, 537809152, 15899909)   ← same
  idx 363  → (-495673696, 537809152, 15899909)   ← same
  idx 484  → (-495673696, 537809152, 15899909)   ← same
```

So roughly 1/4 of the buffer is real data and 3/4 is the last loaded point repeated. The line2 renderer happily draws zero-length segments (no visual harm at this zoom because the segments are coincident), but the buffer is doing 3-4× the work it needs.

Contrast — at cruise (`/?t=1985-01-01T00:00:00Z`, no active chapter), the same line attributes' samples were varied across the full index range (verified by visual screenshot showing a long bending curve).

## Likely cause

Two candidates:

1. **Chunk-loader LRU eviction in body-centered framing.** The body-centered scene-space coordinates require subtracting the worldGroup offset, which may invalidate the cached past-anchor extrapolation in `EphemerisService.getPosition` for far-future ETs (where the chunk isn't loaded), causing the consumer to fill remaining buffer slots with the last successfully-sampled position.

2. **Trajectory chunk producer doesn't span the full mission for body-centered builds.** Story 4.3 ("cadence-refined trajectory chunks") may emit shorter chunks during encounter windows that don't have continuation chunks loaded into the right scene-space.

The root-cause investigation should look at `chunkLoader.cache` state when navigating to `/c/v1-jupiter` and whether the V1 future chunk past anchor + ~1/4 mission duration is being requested.

## Impact

- The future trajectory in body-centered chapter framing **does not actually depict where the spacecraft is going**. A user zooming out from the encounter framing would see the future line stop at a fixed point rather than continue to the post-encounter geometry.
- This is *one of the contributing factors* to BUG-E4-003: the trajectory-bend evidence in the body-centered framing is unreliable because the future line is partially degenerate.
- Affects FR10 ("future trajectory from current ET through 2030, visually distinguished from past") under body-centered chapter framing.

## Reproduction

```js
// At http://localhost:5173/c/v1-jupiter
const dbg = __voyagerDebug;
const traj = dbg.renderEngine.worldGroup.children.find(c => c.name === 'TrajectoryLines');
const v1future = traj.children.find(l => l.name === 'voyager-1-future');
const data = v1future.geometry.attributes.instanceStart.data;
const stride = data.stride;
const sample = (i) => [data.array[i*stride], data.array[i*stride+1], data.array[i*stride+2]];
// Compare sample(121), sample(243), sample(485) — all identical at /c/v1-jupiter.
```

## Fix candidates

1. If chunk-loader: verify that the body-centered scene-space transform doesn't trip the chunk-cache key. The cache should be keyed on (bodyId, ET) — the rendering frame should be irrelevant.
2. If chunk-producer: ensure the per-chapter chunk inventory includes continuation chunks to mission end. Story 4.3's "cadence shift" should not truncate the future tail.
3. Defensive: the trajectory-line builder could detect identical consecutive vertices and emit a warning to the console in dev mode.
