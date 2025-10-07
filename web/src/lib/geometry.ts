import type { Keypoint } from "@tensorflow-models/face-landmarks-detection";

export type Vec2 = { x: number; y: number };

export function centroid(points: Vec2[]): Vec2 {
  const n = points.length || 1;
  const s = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 },
  );
  return { x: s.x / n, y: s.y / n };
}

export function distance(a: Vec2, b: Vec2) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function angle(a: Vec2, b: Vec2) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function fromKeypoints(kps: Keypoint[]): Vec2[] {
  return kps.map((k) => ({ x: k.x, y: k.y }));
}

export function eyeCenterFromIndices(points: Vec2[], indices: number[]): Vec2 {
  const pts = indices.map((i) => points[i]).filter(Boolean) as Vec2[];
  return centroid(pts);
}

// Procrustes alignment (2D, similarity transform) using a closed-form 2x2 solution.
export function procrustesRMSE(a: Vec2[], b: Vec2[]) {
  const n = Math.min(a.length, b.length);
  if (n === 0) return { rmse: Infinity };
  const ax = new Array(n);
  const ay = new Array(n);
  const bx = new Array(n);
  const by = new Array(n);
  const ca = { x: 0, y: 0 };
  const cb = { x: 0, y: 0 };
  for (let i = 0; i < n; i++) {
    ca.x += a[i].x;
    ca.y += a[i].y;
    cb.x += b[i].x;
    cb.y += b[i].y;
  }
  ca.x /= n; ca.y /= n; cb.x /= n; cb.y /= n;
  for (let i = 0; i < n; i++) {
    ax[i] = a[i].x - ca.x;
    ay[i] = a[i].y - ca.y;
    bx[i] = b[i].x - cb.x;
    by[i] = b[i].y - cb.y;
  }
  // Cross-covariance H = X^T Y
  let a00 = 0, a01 = 0, a10 = 0, a11 = 0;
  let sumXX = 0, sumYY = 0;
  for (let i = 0; i < n; i++) {
    a00 += ax[i] * bx[i];
    a01 += ax[i] * by[i];
    a10 += ay[i] * bx[i];
    a11 += ay[i] * by[i];
    sumXX += ax[i] * ax[i] + ay[i] * ay[i];
    sumYY += bx[i] * bx[i] + by[i] * by[i];
  }
  // Optimal rotation angle for 2D Kabsch
  const phi = Math.atan2(a01 - a10, a00 + a11);
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  // trace(R H)
  const traceRH = c * (a00 + a11) + s * (a01 - a10);
  const denom = sumXX || 1e-12;
  const scale = traceRH / denom;
  // Error sum: ||sRX - Y||^2 = s^2*sumXX + sumYY - 2*s*trace(RH)
  const errSum = scale * scale * sumXX + sumYY - 2 * scale * traceRH;
  const rmse = Math.sqrt(Math.max(errSum, 0) / n);
  return { rmse };
}

export function regionalProcrustesSimilarity(
  a: Vec2[],
  b: Vec2[],
  indices: number[],
  alpha = 8,
) {
  const ptsA = indices.map((i) => a[i]).filter(Boolean) as Vec2[];
  const ptsB = indices.map((i) => b[i]).filter(Boolean) as Vec2[];
  if (ptsA.length < 2 || ptsB.length < 2) return 0;
  const { rmse } = procrustesRMSE(ptsA, ptsB);
  // Normalize by region scale (RMS radius of target region) to be size-invariant
  const cB = centroid(ptsB);
  let sumR2 = 0;
  for (const p of ptsB) {
    const dx = p.x - cB.x, dy = p.y - cB.y;
    sumR2 += dx * dx + dy * dy;
  }
  const regionScale = Math.sqrt(sumR2 / ptsB.length) || 1e-6;
  const normErr = rmse / regionScale;
  const sim = Math.exp(-alpha * normErr);
  return sim;
}

export function summarizeRegionsProcrustes(a: Vec2[], b: Vec2[], regions: Record<string, number[]>) {
  const scores: RegionScore[] = [];
  let totalWeight = 0;
  let weighted = 0;
  for (const [name, idxs] of Object.entries(regions)) {
    const sim = regionalProcrustesSimilarity(a, b, idxs);
    scores.push({ region: name, score: sim });
    totalWeight += idxs.length;
    weighted += sim * idxs.length;
  }
  const overall = totalWeight ? weighted / totalWeight : 0;
  return { scores: scores.sort((x, y) => y.score - x.score), overall };
}

export function normalizeByEyes(points: Vec2[], leftEye: Vec2, rightEye: Vec2) {
  const mid = { x: (leftEye.x + rightEye.x) / 2, y: (leftEye.y + rightEye.y) / 2 };
  const ipd = distance(leftEye, rightEye) || 1;
  const theta = angle(leftEye, rightEye); // rotate so eyes are horizontal left->right
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const scale = 1 / ipd;
  return points.map((p) => {
    const tx = p.x - mid.x;
    const ty = p.y - mid.y;
    const rx = tx * cos - ty * sin;
    const ry = tx * sin + ty * cos;
    return { x: rx * scale, y: ry * scale };
  });
}

export type RegionScore = { region: string; score: number };

export function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb) || 1;
  return dot / denom;
}

export function summarizeRegions(a: Vec2[], b: Vec2[], regions: Record<string, number[]>) {
  const scores: RegionScore[] = [];
  for (const [name, idxs] of Object.entries(regions)) {
    const av: number[] = [];
    const bv: number[] = [];
    for (const i of idxs) {
      av.push(a[i].x, a[i].y);
      bv.push(b[i].x, b[i].y);
    }
    const sim = (cosineSimilarity(av, bv) + 1) / 2; // 0..1
    scores.push({ region: name, score: sim });
  }
  const overall = scores.reduce((acc, s) => acc + s.score, 0) / (scores.length || 1);
  return { scores: scores.sort((x, y) => y.score - x.score), overall };
}
