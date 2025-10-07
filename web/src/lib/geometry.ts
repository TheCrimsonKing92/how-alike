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
