import { describe, it, expect } from 'vitest';
import { summarizeRegions, summarizeRegionsProcrustes } from '@/lib/geometry';

type V = { x: number; y: number };

function rotScaleTranslate(p: V, ang: number, s = 1, t: V = { x: 0, y: 0 }): V {
  const x = s * (p.x * Math.cos(ang) - p.y * Math.sin(ang)) + t.x;
  const y = s * (p.x * Math.sin(ang) + p.y * Math.cos(ang)) + t.y;
  return { x, y };
}

function anisoScaleTranslate(p: V, sx: number, sy: number, t: V = { x: 0, y: 0 }): V {
  return { x: p.x * sx + t.x, y: p.y * sy + t.y };
}

describe('summaries', () => {
  it('summarizeRegions returns perfect scores for identical points', () => {
    const a: V[] = [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];
    const b: V[] = a.map((p) => ({ ...p }));
    const regions = { eyes: [0, 1], mouth: [2, 3] };
    const { scores, overall } = summarizeRegions(a, b, regions);
    // All regions identical -> similarity 1.0
    expect(overall).toBeCloseTo(1, 6);
    for (const s of scores) {
      expect(s.score).toBeCloseTo(1, 6);
    }
  });

  it('summarizeRegionsProcrustes ranks undistorted region higher than anisotropically distorted', () => {
    // Two disjoint quads representing two regions
    const eyesIdx = [0, 1, 2, 3];
    const mouthIdx = [4, 5, 6, 7];
    const regions = { eyes: eyesIdx, mouth: mouthIdx } as const;
    const a: V[] = [
      // eyes square centered near (-2, 0)
      { x: -2 - 0.5, y: -0.5 },
      { x: -2 + 0.5, y: -0.5 },
      { x: -2 + 0.5, y: 0.5 },
      { x: -2 - 0.5, y: 0.5 },
      // mouth rectangle centered near (2, 0)
      { x: 2 - 0.6, y: -0.4 },
      { x: 2 + 0.6, y: -0.4 },
      { x: 2 + 0.6, y: 0.4 },
      { x: 2 - 0.6, y: 0.4 },
    ];
    // b: eyes undergo a proper similarity transform (rotation+scale+translation) -> near-perfect
    // mouth undergoes anisotropic scaling -> degraded similarity
    const b: V[] = a.map((p, i) => {
      if (eyesIdx.includes(i)) return rotScaleTranslate(p, 0.12, 1.15, { x: 0.3, y: -0.1 });
      return anisoScaleTranslate(p, 1.0, 1.4, { x: -0.2, y: 0.05 });
    });

    const { scores, overall } = summarizeRegionsProcrustes(a, b, regions as unknown as Record<string, number[]>);
    const eyes = scores.find((s) => s.region === 'eyes')!;
    const mouth = scores.find((s) => s.region === 'mouth')!;
    expect(eyes.score).toBeGreaterThan(mouth.score);
    expect(eyes.score).toBeGreaterThan(0.8);
    // Overall should lie between the two region scores
    expect(overall).toBeLessThanOrEqual(eyes.score + 1e-6);
    expect(overall).toBeGreaterThanOrEqual(mouth.score - 1e-6);
  });
});

