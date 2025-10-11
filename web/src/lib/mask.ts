export type Pt = { x: number; y: number };

// Extract point cloud from a binary mask (Uint8Array or number[])
export function pointsFromMask(mask: ArrayLike<number>, width: number, height: number): Pt[] {
  const pts: Pt[] = [];
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const v = mask[row + x] | 0;
      if (v) pts.push({ x: x + 0.5, y: y + 0.5 });
    }
  }
  return pts;
}

// Douglas-Peucker polyline simplification (2D)
export function simplifyRDP(points: Pt[], epsilon: number): Pt[] {
  if (points.length <= 2) return points.slice();
  const sq = (x: number) => x * x;
  const distSq = (p: Pt, a: Pt, b: Pt) => {
    const vx = b.x - a.x, vy = b.y - a.y;
    const wx = p.x - a.x, wy = p.y - a.y;
    const c1 = vx * wx + vy * wy;
    const c2 = vx * vx + vy * vy || 1e-12;
    const t = Math.max(0, Math.min(1, c1 / c2));
    const cx = a.x + t * vx, cy = a.y + t * vy;
    return sq(p.x - cx) + sq(p.y - cy);
  };
  const eps2 = epsilon * epsilon;
  const out: Pt[] = [];
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  const keep: boolean[] = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let maxD = -1;
    let idx = -1;
    const a = points[i], b = points[j];
    for (let k = i + 1; k < j; k++) {
      const d = distSq(points[k], a, b);
      if (d > maxD) { maxD = d; idx = k; }
    }
    if (maxD > eps2 && idx > i && idx < j) {
      keep[idx] = true;
      stack.push([i, idx], [idx, j]);
    }
  }
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

// Simple convex hull (monotone chain) for mask outline approximation
export function convexHull(pts: Pt[]): Pt[] {
  const p = pts.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  if (p.length <= 1) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

// Find largest connected component in a binary mask using flood fill
export function largestConnectedComponent(mask: ArrayLike<number>, width: number, height: number): Uint8Array {
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  const visited = new Uint8Array(w * h);
  const result = new Uint8Array(w * h);

  let largestSize = 0;
  let largestComponent: number[] = [];

  const floodFill = (startIdx: number): number[] => {
    const component: number[] = [];
    const queue: number[] = [startIdx];
    visited[startIdx] = 1;

    while (queue.length > 0) {
      const idx = queue.shift()!;
      component.push(idx);

      const x = idx % w;
      const y = Math.floor(idx / w);

      // Check 4-connected neighbors
      const neighbors = [
        [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]
      ];

      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          const nidx = ny * w + nx;
          if (!visited[nidx] && mask[nidx]) {
            visited[nidx] = 1;
            queue.push(nidx);
          }
        }
      }
    }

    return component;
  };

  // Find all connected components
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] && !visited[i]) {
      const component = floodFill(i);
      if (component.length > largestSize) {
        largestSize = component.length;
        largestComponent = component;
      }
    }
  }

  // Mark only the largest component in the result
  for (const idx of largestComponent) {
    result[idx] = 1;
  }

  return result;
}

// High-level conversion: mask -> outline polyline (convex approximation), simplified
// Uses largest connected component to avoid merging disconnected regions
export function maskToOutline(mask: ArrayLike<number>, width: number, height: number, epsilon = 1.5): Pt[] {
  // Extract only the largest connected component to avoid merging separate regions
  const component = largestConnectedComponent(mask, width, height);
  const pts = pointsFromMask(component, width, height);
  if (pts.length === 0) return [];
  const hull = convexHull(pts);
  return simplifyRDP(hull, epsilon);
}

