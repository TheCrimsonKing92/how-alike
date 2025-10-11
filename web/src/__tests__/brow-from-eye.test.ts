import { describe, it, expect } from 'vitest';

// Simple synthetic eye ring: circle, check brow offset goes outward
function circlePoints(n: number, r: number) {
  const pts = [] as {x:number;y:number}[];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push({ x: Math.cos(t) * r, y: Math.sin(t) * r });
  }
  return pts;
}

describe('brow-from-eye (concept)', () => {
  it('offset points move away from center', () => {
    const center = { x: 0, y: 0 };
    const ring = circlePoints(16, 1);
    // emulate worker lift logic
    const sep = ring.reduce((acc, p) => acc + Math.hypot(p.x - center.x, p.y - center.y), 0) / ring.length;
    const ipd = 2;
    const lift = Math.min(0.06 * ipd, 0.6 * sep);
    const out = ring.map(p => {
      const vx = p.x - center.x, vy = p.y - center.y; const vl = Math.hypot(vx, vy) || 1;
      return { x: p.x + (vx / vl) * lift, y: p.y + (vy / vl) * lift };
    });
    const avgDiff = out.reduce((acc, p, i) => acc + (Math.hypot(p.x, p.y) - Math.hypot(ring[i].x, ring[i].y)), 0) / ring.length;
    expect(avgDiff).toBeGreaterThan(0);
  });
});

