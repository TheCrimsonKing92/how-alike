import { describe, it, expect } from 'vitest';
import { eyeCenterFromIndices } from '@/lib/geometry';

describe('eyeCenterFromIndices', () => {
  it('computes centroid of selected indices', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
      { x: 10, y: 10 },
    ];
    const idx = [0, 1, 2, 3];
    const c = eyeCenterFromIndices(pts, idx);
    expect(c.x).toBeCloseTo(1);
    expect(c.y).toBeCloseTo(1);
  });

  it('ignores invalid indices and returns origin if none valid', () => {
    const pts: { x: number; y: number }[] = [];
    const c = eyeCenterFromIndices(pts, [99, 100]);
    expect(c.x).toBe(0);
    expect(c.y).toBe(0);
  });

  it('uses only valid indices when mixed with invalid ones', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 4 },
    ];
    const idx = [0, 1, 42, -1, 2];
    const c = eyeCenterFromIndices(pts, idx);
    // Centroid of (0,0), (4,0), (0,4) is (4/3, 4/3)
    expect(c.x).toBeCloseTo(4 / 3, 6);
    expect(c.y).toBeCloseTo(4 / 3, 6);
  });
});
