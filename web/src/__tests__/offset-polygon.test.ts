import { describe, it, expect } from 'vitest';
import { offsetPolygon } from '@/lib/hulls';

type P = { x: number; y: number };

function polygonArea(poly: P[]) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  }
  return Math.abs(a) / 2;
}

function centroid(poly: P[]) {
  const n = poly.length || 1;
  const s = poly.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: s.x / n, y: s.y / n };
}

describe('offsetPolygon', () => {
  it('returns a valid polygon with same vertex count and finite coordinates', () => {
    const square: P[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const off = offsetPolygon(square, 0.5);
    expect(off.length).toBe(square.length);
    for (const p of off) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
    // Area should remain positive (non-degenerate)
    expect(polygonArea(off)).toBeGreaterThan(0);
  });

  it('produces non-zero displacement for non-zero offset', () => {
    const poly: P[] = [
      { x: -1, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 1 },
      { x: -1, y: 1 },
    ];
    const off = offsetPolygon(poly, 0.5);
    // Average per-vertex displacement should be > 0
    const avgDisp = poly.reduce((acc, p, i) => acc + Math.hypot(off[i].x - p.x, off[i].y - p.y), 0) / poly.length;
    expect(avgDisp).toBeGreaterThan(0);
  });
});
