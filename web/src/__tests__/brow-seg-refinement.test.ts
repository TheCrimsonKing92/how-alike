import { buildBrowROIs, refineBothBrows, type BrowEndpoints, type SegmentationSampler } from '@/lib/brow-seg-refinement';

function createSyntheticSampler(): SegmentationSampler {
  const leftArc = {
    centerX: 40,
    baseY: 40,
    length: 60,
    amplitude: 18,
  };
  const rightArc = {
    centerX: 160,
    baseY: 40,
    length: 60,
    amplitude: 16,
  };
  const sigma = 3.5;
  const decay = (distance: number) => Math.exp(-(distance * distance) / (2 * sigma * sigma));

  const arcProb = (x: number, y: number, arc: typeof leftArc) => {
    const half = arc.length / 2;
    const t = clamp((x - arc.centerX) / half, -1.5, 1.5);
    if (Math.abs(t) > 1.2) return 0;
    const curveY = arc.baseY - arc.amplitude * (1 - t * t);
    return decay(y - curveY);
  };

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  return {
    probAt(x: number, y: number) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
      const left = arcProb(x, y, leftArc);
      const right = arcProb(x, y, rightArc);
      return Math.max(left, right);
    },
  };
}

describe('brow-seg-refinement', () => {
  const landmarks: BrowEndpoints = {
    browL_head: { x: 15, y: 42 },
    browL_tail: { x: 65, y: 38 },
    browR_head: { x: 135, y: 38 },
    browR_tail: { x: 185, y: 42 },
  };

  it('builds symmetric ROIs with expected dimensions', () => {
    const rois = buildBrowROIs(landmarks, { ipd: 60 });
    expect(rois).toHaveLength(2);
    const [left, right] = rois;
    expect(left.widthPx).toBeGreaterThan(0);
    expect(left.heightPx).toBeGreaterThan(0);
    expect(right.widthPx).toBeGreaterThan(0);
    expect(right.heightPx).toBeGreaterThan(0);
    expect(Math.abs(left.halfLen - right.halfLen)).toBeLessThan(2);
  });

  it('refines eyebrow curves with reasonable metrics', () => {
    const sampler = createSyntheticSampler();
    const result = refineBothBrows(sampler, landmarks, { ipd: 60 });

    expect(result.left.archHeightNorm).toBeGreaterThanOrEqual(0);
    expect(result.right.archHeightNorm).toBeGreaterThanOrEqual(0);
    expect(result.left.archHeightNorm + result.right.archHeightNorm).toBeGreaterThan(0.05);

    expect(result.left.browLenNorm).toBeGreaterThan(0);
    expect(result.right.browLenNorm).toBeGreaterThan(0);

    expect(Number.isFinite(result.left.confidence)).toBe(true);
    expect(Number.isFinite(result.right.confidence)).toBe(true);
    expect(result.left.confidence).toBeGreaterThanOrEqual(0);
    expect(result.right.confidence).toBeGreaterThanOrEqual(0);
    expect(result.left.confidence).toBeLessThanOrEqual(1);
    expect(result.right.confidence).toBeLessThanOrEqual(1);
    expect(Math.max(result.left.confidence, result.right.confidence)).toBeGreaterThan(0.4);

    expect(Math.abs(result.left.tiltDeg)).toBeLessThan(12);
    expect(Math.abs(result.right.tiltDeg)).toBeLessThan(12);
  });
});
