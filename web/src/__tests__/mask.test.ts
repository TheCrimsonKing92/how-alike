import { describe, it, expect } from 'vitest';
import { pointsFromMask, convexHull, simplifyRDP, maskToOutline } from '@/lib/mask';

function rectMask(w: number, h: number, x0: number, y0: number, x1: number, y1: number) {
  const m = new Uint8Array(w * h);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) m[y * w + x] = 1;
  }
  return m;
}

describe('mask utilities', () => {
  it('pointsFromMask extracts all set pixels', () => {
    const w = 10, h = 10;
    const m = rectMask(w, h, 2, 3, 4, 5);
    const pts = pointsFromMask(m, w, h);
    expect(pts.length).toBe((4 - 2 + 1) * (5 - 3 + 1));
  });

  it('convexHull returns a simple rectangle outline', () => {
    const w = 10, h = 10;
    const m = rectMask(w, h, 2, 3, 6, 7);
    const pts = pointsFromMask(m, w, h);
    const hull = convexHull(pts);
    // Hull should have at least 4 corners
    expect(hull.length).toBeGreaterThanOrEqual(4);
  });

  it('simplifyRDP reduces points while preserving endpoints', () => {
    const poly = [
      { x: 0, y: 0 },
      { x: 1, y: 0.1 },
      { x: 2, y: -0.1 },
      { x: 3, y: 0 },
    ];
    const simp = simplifyRDP(poly, 0.2);
    expect(simp.length).toBeLessThan(poly.length);
    expect(simp[0]).toEqual(poly[0]);
    expect(simp[simp.length - 1]).toEqual(poly[poly.length - 1]);
  });

  it('maskToOutline yields a simplified outline for a filled region', () => {
    const w = 32, h = 32;
    const m = rectMask(w, h, 8, 10, 24, 20);
    const outline = maskToOutline(m, w, h, 1.5);
    expect(outline.length).toBeGreaterThanOrEqual(4);
  });
});

