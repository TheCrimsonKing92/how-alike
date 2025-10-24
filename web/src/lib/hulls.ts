import type { Pt } from './points';

// Andrew's monotone chain convex hull
export function convexHull(pts: Pt[]): Pt[] {
  const points = pts.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  if (points.length <= 1) return points;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function dist(a: Pt, b: Pt) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function angle(a: Pt, b: Pt) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function segmentsIntersect(a1: Pt, a2: Pt, b1: Pt, b2: Pt) {
  const d = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = d(a1, a2, b1);
  const o2 = d(a1, a2, b2);
  const o3 = d(b1, b2, a1);
  const o4 = d(b1, b2, a2);
  if (o1 === 0 && o2 === 0 && o3 === 0 && o4 === 0) return false; // collinear: treat as non-intersecting for our hull walk
  return o1 * o2 < 0 && o3 * o4 < 0;
}

// Concave hull via k-nearest neighbor walk (Moreira & Santos style)
// Returns a closed polygon approximating the point set boundary.
export function concaveHullKNN(points: Pt[], kInput?: number): Pt[] {
  const pts = points.slice();
  if (pts.length < 4) return convexHull(pts);
  let k = kInput ?? Math.max(3, Math.round(Math.sqrt(pts.length)));

  const kNearest = (p: Pt, pool: Pt[], kk: number) =>
    pool
      .map((q) => ({ q, d: dist(p, q) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, Math.max(3, kk))
      .map((r) => r.q);

  // start point: lowest y (then lowest x)
  const start = pts.reduce((best, p) => (p.y < best.y || (p.y === best.y && p.x < best.x) ? p : best), pts[0]);
  const hull: Pt[] = [start];
  let current = start;
  let prevAngle = 0; // initial direction along +x
  let safety = pts.length * 10;

  const remaining = pts.filter((p) => p !== start);

  while (safety-- > 0) {
    const candidates = kNearest(current, remaining, k);
    if (candidates.length === 0) break;
    // sort by smallest right-turn angle from previous direction
    const byAngle = candidates
      .map((c) => {
        const a = angle(current, c);
        let da = a - prevAngle;
        while (da <= -Math.PI) da += 2 * Math.PI;
        while (da > Math.PI) da -= 2 * Math.PI;
        return { c, da: da <= 0 ? da + 2 * Math.PI : da };
      })
      .sort((u, v) => u.da - v.da);

    let next: Pt | null = null;
    for (const { c } of byAngle) {
      // avoid self-intersection
      const a1 = hull[hull.length - 1];
      const a2 = c;
      let ok = true;
      for (let i = 1; i < hull.length; i++) {
        const b1 = hull[i - 1];
        const b2 = hull[i];
        if (segmentsIntersect(a1, a2, b1, b2)) { ok = false; break; }
      }
      if (!ok) continue;
      next = c;
      break;
    }

    if (!next) {
      // increase k and restart to allow more options
      k++;
      if (k > pts.length) return convexHull(pts);
      return concaveHullKNN(points, k);
    }

    hull.push(next);
    const idx = remaining.indexOf(next);
    if (idx >= 0) remaining.splice(idx, 1);
    prevAngle = angle(current, next);
    current = next;
    if (next === start || (dist(next, start) < 1e-6 && hull.length > 3)) break;

    if (remaining.length === 0) break;
  }

  // close if necessary
  if (hull[hull.length - 1] !== start) hull.push(start);
  // remove duplicate consecutive points
  const closed: Pt[] = [];
  for (const p of hull) {
    if (!closed.length || dist(closed[closed.length - 1], p) > 1e-9) closed.push(p);
  }
  return closed;
}

// Simple corner-offset polygon (mitered) for small buffers
export function offsetPolygon(poly: Pt[], distPx: number) {
  if (poly.length < 3) return poly.slice();
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p0 = poly[(i - 1 + poly.length) % poly.length];
    const p1 = poly[i];
    const p2 = poly[(i + 1) % poly.length];
    const e1x = p1.x - p0.x, e1y = p1.y - p0.y;
    const e2x = p2.x - p1.x, e2y = p2.y - p1.y;
    const n1x = -e1y, n1y = e1x;
    const n2x = -e2y, n2y = e2x;
    const n1l = Math.hypot(n1x, n1y) || 1;
    const n2l = Math.hypot(n2x, n2y) || 1;
    const nx = n1x / n1l + n2x / n2l;
    const ny = n1y / n1l + n2y / n2l;
    const nl = Math.hypot(nx, ny) || 1;
    out.push({ x: p1.x + (nx / nl) * distPx, y: p1.y + (ny / nl) * distPx });
  }
  return out;
}
