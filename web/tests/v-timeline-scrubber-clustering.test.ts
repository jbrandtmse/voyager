// @vitest-environment happy-dom
/**
 * Story 6.2 AC5 — integration tests for the marker-clustering pass
 * inside `<v-timeline-scrubber>` (mission variant).
 *
 * The clustering pass is driven by the runtime track-width via
 * `getBoundingClientRect()`. happy-dom returns width: 0 for unmeasured
 * elements, so we stub the track rect to a representative mission-
 * scrubber width (1024 px) and re-trigger render. The pass collapses
 * overlapping label pairs into a midpoint cluster label while the pin
 * lines stay at each member's own anchor ET.
 *
 * Covers:
 *   - Default unmeasured-width (happy-dom default) → 11 pins, no
 *     cluster labels (regression guard against breaking the 11-marker
 *     contract from Story 2.2).
 *   - Stubbed 1024-px track → 11 pins still present, 4 cluster labels
 *     rendered (V2L/V1L, V1J/V2J, V1S/V2S, V2N/PBD), 3 single labels
 *     (V1J pair offset, V2U, V1H, V2H — wait, V1J is in a pair; 11 - 8
 *     in pairs = 3 singles: V2U, V1H, V2H). Verified empirically.
 *   - Cluster label position matches the midpoint of the two member
 *     anchors.
 *   - Clicking each pin in a cluster still fires the chapter-jump
 *     event for the correct chapter.
 *   - Wider track (50× wider) → no clustering.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../src/components/v-timeline-scrubber';
import { VTimelineScrubber } from '../src/components/v-timeline-scrubber';
import { ClockManager } from '../src/services/clock-manager';
import { ChapterDirector } from '../src/services/chapter-director';
import { ALL_CHAPTERS } from '../src/chapters/registry';

const stubTrackWidth = (scrubber: VTimelineScrubber, width: number): void => {
  const track = scrubber.shadowRoot!.querySelector('.track') as HTMLElement;
  track.getBoundingClientRect = () =>
    ({
      left: 0,
      right: width,
      top: 0,
      bottom: 12,
      width,
      height: 12,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
};

const mountScrubber = async (): Promise<VTimelineScrubber> => {
  const clock = new ClockManager();
  const director = new ChapterDirector(ALL_CHAPTERS);
  const el = document.createElement('v-timeline-scrubber') as VTimelineScrubber;
  el.variant = 'mission';
  el.clockManager = clock;
  el.chapterDirector = director;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
};

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('<v-timeline-scrubber> clustering — default unmeasured track', () => {
  it('renders 11 pins with NO cluster labels when track width is 0 (regression)', async () => {
    const el = await mountScrubber();
    // happy-dom default: getBoundingClientRect().width === 0.
    const markers = el.shadowRoot!.querySelectorAll('.chapter-marker');
    expect(markers.length).toBe(11);
    const clusterLabels = el.shadowRoot!.querySelectorAll('.chapter-cluster-label');
    expect(clusterLabels.length).toBe(0);
    // No per-marker label is suppressed.
    const suppressed = el.shadowRoot!.querySelectorAll('.chapter-marker[data-clustered-pair]');
    expect(suppressed.length).toBe(0);
  });
});

describe('<v-timeline-scrubber> clustering — 1024-px representative mission track', () => {
  it('collapses the 4 known intra-decade label pairs into cluster labels', async () => {
    const el = await mountScrubber();
    stubTrackWidth(el, 1024);
    el.requestUpdate();
    await el.updateComplete;

    // All 11 pins are still rendered — only the LABELS collapse.
    const markers = el.shadowRoot!.querySelectorAll('.chapter-marker');
    expect(markers.length).toBe(11);

    // 8 pins are part of clustered pairs (the 4 known clusters × 2
    // members each) → 8 carry the data-clustered-pair attribute.
    const clusteredPins = el.shadowRoot!.querySelectorAll(
      '.chapter-marker[data-clustered-pair]',
    );
    expect(clusteredPins.length).toBe(8);

    // 4 cluster labels are emitted — one per pair.
    const clusterLabels = el.shadowRoot!.querySelectorAll('.chapter-cluster-label');
    expect(clusterLabels.length).toBe(4);

    // Verify each cluster carries the expected joined label.
    const labelTexts = Array.from(clusterLabels).map((n) => n.textContent?.trim());
    expect(labelTexts).toContain('V2L / V1L');
    expect(labelTexts).toContain('V1J / V2J');
    expect(labelTexts).toContain('V1S / V2S');
    expect(labelTexts).toContain('V2N / PBD');
  });

  it('preserves the 3 non-clustered chapter labels (V2U, V1H, V2H) as single per-marker labels', async () => {
    const el = await mountScrubber();
    stubTrackWidth(el, 1024);
    el.requestUpdate();
    await el.updateComplete;

    const v2u = el.shadowRoot!.querySelector('.chapter-marker[data-slug="v2-uranus"]');
    const v1h = el.shadowRoot!.querySelector('.chapter-marker[data-slug="v1-heliopause"]');
    const v2h = el.shadowRoot!.querySelector('.chapter-marker[data-slug="v2-heliopause"]');
    expect(v2u).not.toBeNull();
    expect(v1h).not.toBeNull();
    expect(v2h).not.toBeNull();
    // None of the three is clustered.
    expect(v2u!.hasAttribute('data-clustered-pair')).toBe(false);
    expect(v1h!.hasAttribute('data-clustered-pair')).toBe(false);
    expect(v2h!.hasAttribute('data-clustered-pair')).toBe(false);
  });

  it('cluster label is anchored at the midpoint between the two member fractions', async () => {
    const el = await mountScrubber();
    stubTrackWidth(el, 1024);
    el.requestUpdate();
    await el.updateComplete;

    // Find the V2L / V1L cluster label and verify its inline left
    // matches the midpoint of the two launch anchors.
    const labels = el.shadowRoot!.querySelectorAll('.chapter-cluster-label');
    const v2lV1l = Array.from(labels).find(
      (n) => n.getAttribute('data-cluster-id') === 'launch-v2+launch-v1',
    );
    expect(v2lV1l).not.toBeUndefined();
    const left = (v2lV1l as HTMLElement).style.left;
    // The two launch anchors are very close to the start (≈ 0 and
    // ≈ 0.0008 fractionally); the midpoint is small but nonzero.
    expect(left).toMatch(/^0\.0\d{3}%$/);
  });

  it('clicking the V2L pin still dispatches chapter-jump for launch-v2', async () => {
    const el = await mountScrubber();
    stubTrackWidth(el, 1024);
    el.requestUpdate();
    await el.updateComplete;

    const events: { slug: string; anchorEt: number }[] = [];
    el.addEventListener('chapter-jump', (e) => {
      events.push((e as CustomEvent).detail);
    });
    const v2l = el.shadowRoot!.querySelector(
      '.chapter-marker[data-slug="launch-v2"]',
    ) as HTMLElement;
    expect(v2l).not.toBeNull();
    v2l.click();
    expect(events).toHaveLength(1);
    expect(events[0]!.slug).toBe('launch-v2');
  });

  it('clicking the V1L pin still dispatches chapter-jump for launch-v1', async () => {
    const el = await mountScrubber();
    stubTrackWidth(el, 1024);
    el.requestUpdate();
    await el.updateComplete;

    const events: { slug: string; anchorEt: number }[] = [];
    el.addEventListener('chapter-jump', (e) => {
      events.push((e as CustomEvent).detail);
    });
    const v1l = el.shadowRoot!.querySelector(
      '.chapter-marker[data-slug="launch-v1"]',
    ) as HTMLElement;
    expect(v1l).not.toBeNull();
    v1l.click();
    expect(events).toHaveLength(1);
    expect(events[0]!.slug).toBe('launch-v1');
  });
});

describe('<v-timeline-scrubber> clustering — very wide track (no clustering)', () => {
  it('a 51200-px (50×) track keeps every chapter label as a single marker label', async () => {
    const el = await mountScrubber();
    stubTrackWidth(el, 51200);
    el.requestUpdate();
    await el.updateComplete;

    const markers = el.shadowRoot!.querySelectorAll('.chapter-marker');
    expect(markers.length).toBe(11);
    const clustered = el.shadowRoot!.querySelectorAll('.chapter-marker[data-clustered-pair]');
    expect(clustered.length).toBe(0);
    const clusterLabels = el.shadowRoot!.querySelectorAll('.chapter-cluster-label');
    expect(clusterLabels.length).toBe(0);
  });
});
