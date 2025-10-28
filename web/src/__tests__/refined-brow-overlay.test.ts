import { describe, it, expect } from 'vitest';
import type { RegionPoly } from '@/workers/types';
import type { RefinedBrow } from '@/lib/brow-seg-refinement';
import { mergeRefinedBrowsIntoPolys } from '@/lib/refined-brow-overlay';

const makeRefined = (overrides: Partial<RefinedBrow>): RefinedBrow => ({
  side: 'left',
  curveImg: [
    { x: 10, y: 20 },
    { x: 30, y: 18 },
    { x: 50, y: 22 },
  ],
  headImg: { x: 10, y: 20 },
  tailImg: { x: 50, y: 22 },
  apexImg: { x: 30, y: 15 },
  outlineImg: [
    { x: 10, y: 21 },
    { x: 20, y: 14 },
    { x: 35, y: 12 },
    { x: 52, y: 19 },
    { x: 40, y: 26 },
    { x: 18, y: 27 },
  ],
  archHeightNorm: 0.25,
  curvature: 0.1,
  tiltDeg: 2,
  browLenNorm: 1,
  confidence: 0.8,
  ...overrides,
});

describe('mergeRefinedBrowsIntoPolys', () => {
  const basePolys: RegionPoly[] = [
    { region: 'eyes', points: [{ x: 10, y: 40 }, { x: 30, y: 40 }] },
    {
      region: 'brows',
      points: [{ x: 12, y: 18 }, { x: 28, y: 16 }, { x: 44, y: 18 }],
      open: true,
      source: 'landmark',
    },
    {
      region: 'brows',
      points: [{ x: 60, y: 18 }, { x: 76, y: 16 }, { x: 92, y: 18 }],
      open: true,
      source: 'landmark',
    },
  ];

  it('replaces both brow outlines when high-confidence refined curves exist', () => {
    const refined = {
      left: makeRefined({ side: 'left' }),
      right: makeRefined({
        side: 'right',
        curveImg: [
          { x: 60, y: 19 },
          { x: 80, y: 15 },
          { x: 98, y: 20 },
        ],
        outlineImg: [
          { x: 60, y: 20 },
          { x: 74, y: 12 },
          { x: 95, y: 20 },
          { x: 82, y: 27 },
          { x: 63, y: 26 },
        ],
      }),
    };
    const result = mergeRefinedBrowsIntoPolys(basePolys, refined);
    const brows = result.filter((p) => p.region === 'brows');
    expect(brows).toHaveLength(2);
    expect(brows.every((p) => p.source === 'refined')).toBe(true);
    expect(brows.every((p) => p.open === false)).toBe(true);
    expect(brows[0].points).toEqual(refined.left!.outlineImg);
    expect(result.find((p) => p.region === 'eyes')).toBeTruthy();
  });

  it('uses fallback outline when refined brow lacks polygon data', () => {
    const refined = {
      left: makeRefined({ side: 'left', curveImg: [], outlineImg: [], confidence: 0.3 }),
      right: makeRefined({
        side: 'right',
        curveImg: [
          { x: 60, y: 19 },
          { x: 80, y: 15 },
          { x: 98, y: 20 },
        ],
      }),
    };
    const result = mergeRefinedBrowsIntoPolys(basePolys, refined);
    const brows = result.filter((p) => p.region === 'brows');
    expect(brows).toHaveLength(2);
    expect(brows.some((p) => p.source === 'refined')).toBe(true);
    expect(brows.some((p) => p.source !== 'refined')).toBe(true);
  });
});
