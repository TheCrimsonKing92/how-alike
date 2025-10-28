import type { Point2D } from '@/lib/points';

export type BrowSide = 'left' | 'right';

export type Pt = { x: number; y: number };

export interface BrowEndpoints {
  browL_head: Point2D;
  browL_tail: Point2D;
  browR_head: Point2D;
  browR_tail: Point2D;
}

export interface SegmentationSampler {
  probAt(x: number, y: number): number;
}

export interface BrowRefineBaseOptions {
  ipd: number;
  roiScaleLen?: number;
  roiScaleHt?: number;
}

export interface BrowRefineOptions extends BrowRefineBaseOptions {
  samples?: number;
  snapRadius?: number;
}

export interface RefinedBrow {
  side: BrowSide;
  curveImg: Pt[];
  headImg: Pt;
  tailImg: Pt;
  apexImg: Pt;
  outlineImg?: Pt[];
  archHeightNorm: number;
  curvature: number;
  tiltDeg: number;
  browLenNorm: number;
  confidence: number;
}

export interface RefineBothBrowsResult {
  left: RefinedBrow;
  right: RefinedBrow;
}

interface BrowROI {
  side: BrowSide;
  head: Pt;
  tail: Pt;
  mid: Pt;
  dir: Pt;
  normal: Pt;
  halfLen: number;
  halfHeight: number;
  widthPx: number;
  heightPx: number;
}

const DEFAULT_ROI_LEN = 1.3;
const DEFAULT_ROI_HEIGHT = 0.8;
export const REFINED_BROW_CONFIDENCE_THRESHOLD = 0.45;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, s: number): Pt => ({ x: a.x * s, y: a.y * s });
const norm = (v: Pt): Pt => {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
};
const rot90 = (v: Pt): Pt => ({ x: -v.y, y: v.x });

function toPt(p: Point2D | undefined): Pt | null {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
    return null;
  }
  return { x: p.x, y: p.y };
}

function buildSingleROI(side: BrowSide, head: Pt, tail: Pt, ipd: number, roiScaleLen: number, roiScaleHt: number): BrowROI {
  const baseline = sub(tail, head);
  let dir = norm(baseline);
  if (!Number.isFinite(dir.x) || !Number.isFinite(dir.y)) {
    dir = { x: side === 'left' ? 1 : -1, y: 0 };
  }
  const n = rot90(dir);
  const baseLen = Math.hypot(baseline.x, baseline.y) || ipd * 0.25 || 1;
  const len = baseLen * roiScaleLen;
  const height = Math.max(24, ipd * roiScaleHt);
  const halfLen = len / 2;
  const halfHeight = height / 2;
  const mid = mul(add(head, tail), 0.5);

  const widthPx = Math.max(192, Math.round(len));
  const heightPx = Math.max(96, Math.round(height));

  return {
    side,
    head,
    tail,
    mid,
    dir,
    normal: n,
    halfLen,
    halfHeight,
    widthPx,
    heightPx,
  };
}

export function buildBrowROIs(landmarks: BrowEndpoints, opts: BrowRefineBaseOptions): BrowROI[] {
  const { ipd, roiScaleLen = DEFAULT_ROI_LEN, roiScaleHt = DEFAULT_ROI_HEIGHT } = opts;
  const leftHead = toPt(landmarks.browL_head);
  const leftTail = toPt(landmarks.browL_tail);
  const rightHead = toPt(landmarks.browR_head);
  const rightTail = toPt(landmarks.browR_tail);
  if (!leftHead || !leftTail || !rightHead || !rightTail) {
    throw new Error('Missing brow landmarks for ROI construction');
  }
  return [
    buildSingleROI('left', leftHead, leftTail, ipd, roiScaleLen, roiScaleHt),
    buildSingleROI('right', rightHead, rightTail, ipd, roiScaleLen, roiScaleHt),
  ];
}

function localToImage(roi: BrowROI, local: Pt): Pt {
  return {
    x: roi.mid.x + roi.dir.x * local.x + roi.normal.x * local.y,
    y: roi.mid.y + roi.dir.y * local.x + roi.normal.y * local.y,
  };
}

function imageToLocal(roi: BrowROI, point: Pt): Pt {
  const delta = sub(point, roi.mid);
  return {
    x: delta.x * roi.dir.x + delta.y * roi.dir.y,
    y: delta.x * roi.normal.x + delta.y * roi.normal.y,
  };
}

function pixelToLocal(roi: BrowROI, x: number, y: number): Pt {
  const u = ((x + 0.5) / roi.widthPx - 0.5) * (roi.halfLen * 2);
  const v = ((y + 0.5) / roi.heightPx - 0.5) * (roi.halfHeight * 2);
  return { x: u, y: v };
}

function localToPixel(roi: BrowROI, local: Pt): Pt {
  const u = roi.halfLen ? (local.x / (roi.halfLen * 2)) + 0.5 : 0.5;
  const v = roi.halfHeight ? (local.y / (roi.halfHeight * 2)) + 0.5 : 0.5;
  return {
    x: clamp(u * roi.widthPx - 0.5, 0, roi.widthPx - 1),
    y: clamp(v * roi.heightPx - 0.5, 0, roi.heightPx - 1),
  };
}

function cleanMask(
  probs: Float32Array,
  width: number,
  height: number,
  guide: { yLo: number; yHi: number }
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const candidates: number[] = [];
  for (let i = 0; i < probs.length; i++) {
    const p = probs[i];
    if (p > 0.2) candidates.push(p);
  }
  candidates.sort((a, b) => a - b);
  const median = candidates.length ? candidates[Math.floor(candidates.length / 2)] : 0.5;
  const threshold = Math.max(0.35, 0.5 * median);

  for (let y = 0; y < height; y++) {
    const withinGuide = y >= guide.yLo && y <= guide.yHi;
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const keep = withinGuide && probs[idx] > threshold;
      mask[idx] = keep ? 1 : 0;
    }
  }

  morphOpen(mask, width, height, 1);
  morphClose(mask, width, height, 2);
  fillHoles(mask, width, height);
  return mask;
}

function morphOpen(mask: Uint8Array, width: number, height: number, radius: number) {
  morphErode(mask, width, height, radius);
  morphDilate(mask, width, height, radius);
}

function morphClose(mask: Uint8Array, width: number, height: number, radius: number) {
  morphDilate(mask, width, height, radius);
  morphErode(mask, width, height, radius);
}

function morphErode(mask: Uint8Array, width: number, height: number, radius: number) {
  const copy = mask.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let ok = 1;
      for (let dy = -radius; dy <= radius && ok; dy++) {
        for (let dx = -radius; dx <= radius && ok; dx++) {
          const xx = clamp(x + dx, 0, width - 1);
          const yy = clamp(y + dy, 0, height - 1);
          if (!copy[yy * width + xx]) ok = 0;
        }
      }
      mask[y * width + x] = ok;
    }
  }
}

function morphDilate(mask: Uint8Array, width: number, height: number, radius: number) {
  const copy = mask.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let ok = 0;
      for (let dy = -radius; dy <= radius && !ok; dy++) {
        for (let dx = -radius; dx <= radius && !ok; dx++) {
          const xx = clamp(x + dx, 0, width - 1);
          const yy = clamp(y + dy, 0, height - 1);
          if (copy[yy * width + xx]) ok = 1;
        }
      }
      mask[y * width + x] = ok;
    }
  }
}

function fillHoles(mask: Uint8Array, width: number, height: number) {
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const idx = y * width + x;
    if (!seen[idx] && !mask[idx]) {
      seen[idx] = 1;
      stack.push(idx);
    }
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  while (stack.length) {
    const idx = stack.pop()!;
    const x = idx % width;
    const y = Math.floor(idx / width);
    if (x > 0) push(x - 1, y);
    if (x + 1 < width) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y + 1 < height) push(x, y + 1);
  }
  for (let i = 0; i < mask.length; i++) {
    if (!seen[i]) {
      mask[i] = 1;
    } else if (!mask[i]) {
      mask[i] = 0;
    }
  }
}

function marchingSquares(mask: Uint8Array, width: number, height: number, roi: BrowROI): Pt[] {
  const idx = (x: number, y: number) => y * width + x;
  let startX = -1;
  let startY = -1;
  outer: for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (mask[idx(x, y)]) {
        startX = x;
        startY = y;
        break outer;
      }
    }
  }
  if (startX < 0) return [];

  const dirs = [
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
    { x: -1, y: 1 },
    { x: -1, y: 0 },
    { x: -1, y: -1 },
    { x: 0, y: -1 },
    { x: 1, y: -1 },
  ];

  const contour: Pt[] = [];
  let x = startX;
  let y = startY;
  let dirIdx = 0;
  let iterations = width * height * 4;
  do {
    const local = pixelToLocal(roi, x, y);
    contour.push(local);
    let found = false;
    for (let k = 0; k < 8; k++) {
      const dir = dirs[(dirIdx + 6 + k) % 8];
      const nx = clamp(x + dir.x, 0, width - 1);
      const ny = clamp(y + dir.y, 0, height - 1);
      if (mask[idx(nx, ny)]) {
        x = nx;
        y = ny;
        dirIdx = (dirIdx + 6 + k) % 8;
        found = true;
        break;
      }
    }
    if (!found) break;
    iterations -= 1;
  } while ((x !== startX || y !== startY) && iterations > 0);

  return contour;
}

function projectT(p: Pt, a: Pt, b: Pt): number {
  const v = sub(b, a);
  const denom = v.x * v.x + v.y * v.y || 1e-6;
  return (sub(p, a).x * v.x + sub(p, a).y * v.y) / denom;
}

function signedDistToLine(p: Pt, a: Pt, b: Pt): number {
  const v = sub(b, a);
  const w = sub(p, a);
  const perp = rot90(v);
  const len = Math.hypot(perp.x, perp.y) || 1e-6;
  return (w.x * perp.x + w.y * perp.y) / len;
}

export function upperEnvelope(contour: Pt[], head: Pt, tail: Pt): Pt[] {
  if (!contour.length) return [];
  const baseline = sub(tail, head);
  const n = rot90(norm(baseline));
  const bins = Math.max(24, Math.floor(Math.hypot(baseline.x, baseline.y) / 4));
  const accum: Array<Pt | null> = new Array(bins).fill(null);
  for (const p of contour) {
    if (p.x * n.x + p.y * n.y <= 0) continue;
    const t = clamp(projectT(p, head, tail), 0, 1);
    const bin = Math.min(bins - 1, Math.floor(t * bins));
    const current = accum[bin];
    if (!current || signedDistToLine(p, head, tail) > signedDistToLine(current, head, tail)) {
      accum[bin] = p;
    }
  }
  return accum.filter((p): p is Pt => !!p);
}

export function fitCatmullRom(points: Pt[], samples = 80, alpha = 0.5): Pt[] {
  if (points.length <= 2) return points.slice();
  const extended = [points[0], ...points, points[points.length - 1]];
  const out: Pt[] = [];
  const tj = (pi: Pt, pj: Pt, ti: number) => ti + Math.pow(Math.hypot(pj.x - pi.x, pj.y - pi.y), alpha);
  const segments = extended.length - 3;
  for (let i = 0; i < segments; i++) {
    const p0 = extended[i];
    const p1 = extended[i + 1];
    const p2 = extended[i + 2];
    const p3 = extended[i + 3];
    let t0 = 0;
    const t1 = tj(p0, p1, t0);
    const t2 = tj(p1, p2, t1);
    const t3 = tj(p2, p3, t2);
    const segmentSamples = Math.max(2, Math.round(samples / segments));
    for (let s = 0; s < segmentSamples; s++) {
      const t = t1 + ((t2 - t1) * s) / segmentSamples;
      const A1 = lerpPt(p0, p1, (t - t0) / (t1 - t0 || 1));
      const A2 = lerpPt(p1, p2, (t - t1) / (t2 - t1 || 1));
      const A3 = lerpPt(p2, p3, (t - t2) / (t3 - t2 || 1));
      const B1 = lerpPt(A1, A2, (t - t1) / (t2 - t1 || 1));
      const B2 = lerpPt(A2, A3, (t - t2) / (t3 - t2 || 1));
      const C = lerpPt(B1, B2, (t - t1) / (t2 - t1 || 1));
      out.push(C);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function sobelMagnitude(grid: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(grid.length);
  const sample = (x: number, y: number) => {
    const xx = clamp(x, 0, width - 1);
    const yy = clamp(y, 0, height - 1);
    return grid[yy * width + xx];
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx =
        -sample(x - 1, y - 1) - 2 * sample(x - 1, y) - sample(x - 1, y + 1) +
        sample(x + 1, y - 1) + 2 * sample(x + 1, y) + sample(x + 1, y + 1);
      const gy =
        -sample(x - 1, y - 1) - 2 * sample(x, y - 1) - sample(x + 1, y - 1) +
        sample(x - 1, y + 1) + 2 * sample(x, y + 1) + sample(x + 1, y + 1);
      out[y * width + x] = Math.hypot(gx, gy);
    }
  }
  let max = 1e-6;
  for (let i = 0; i < out.length; i++) max = Math.max(max, out[i]);
  for (let i = 0; i < out.length; i++) out[i] /= max;
  return out;
}

function snapAlongNormal(
  point: Pt,
  tangent: Pt,
  prob: (x: number, y: number) => number,
  grad: (x: number, y: number) => number,
  radius: number,
  lambda = 0.6
): Pt {
  const normal = rot90(norm(tangent));
  let best = point;
  let bestScore = -Infinity;
  for (let s = -radius; s <= radius; s++) {
    const candidate = { x: point.x + normal.x * s, y: point.y + normal.y * s };
    const score = lambda * grad(candidate.x, candidate.y) + (1 - lambda) * prob(candidate.x, candidate.y);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

function avgDistance(a: Pt[], b: Pt[]): number {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
  }
  return sum / n;
}

function averageProb(curve: Pt[], sampler: (x: number, y: number) => number): number {
  if (!curve.length) return 0;
  let sum = 0;
  for (const p of curve) sum += sampler(p.x, p.y);
  return sum / curve.length;
}

function curvatureFrom3(head: Pt, apex: Pt, tail: Pt): number {
  const A = Math.hypot(apex.x - head.x, apex.y - head.y);
  const B = Math.hypot(tail.x - apex.x, tail.y - apex.y);
  const C = Math.hypot(tail.x - head.x, tail.y - head.y);
  const s = 0.5 * (A + B + C);
  const areaSq = Math.max(0, s * (s - A) * (s - B) * (s - C));
  const area = Math.sqrt(areaSq) || 1e-6;
  const radius = (A * B * C) / (4 * area);
  const sign = Math.sign(signedDistToLine(apex, head, tail));
  return sign / (radius || 1e-6);
}

function findApex(curve: Pt[], head: Pt, tail: Pt): { point: Pt; height: number } {
  let best = curve[0] ?? head;
  let bestHeight = -Infinity;
  for (const p of curve) {
    const d = signedDistToLine(p, head, tail);
    if (d > bestHeight) {
      best = p;
      bestHeight = d;
    }
  }
  return { point: best, height: bestHeight };
}

function ensureCurve(points: Pt[], head: Pt, tail: Pt): Pt[] {
  if (points.length >= 2) return points;
  return [head, tail];
}

export function refineBrowFromSeg(
  roi: BrowROI,
  sampler: SegmentationSampler,
  opts: BrowRefineOptions
): RefinedBrow {
  const { samples = 80, snapRadius = 8, ipd } = opts;
  const probs = new Float32Array(roi.widthPx * roi.heightPx);
  for (let y = 0; y < roi.heightPx; y++) {
    for (let x = 0; x < roi.widthPx; x++) {
      const local = pixelToLocal(roi, x, y);
      const img = localToImage(roi, local);
      probs[y * roi.widthPx + x] = sampler.probAt(img.x, img.y);
    }
  }

  const headLocal = imageToLocal(roi, roi.head);
  const tailLocal = imageToLocal(roi, roi.tail);
  const headPix = localToPixel(roi, headLocal);
  const tailPix = localToPixel(roi, tailLocal);
  const guide = {
    yLo: clamp(Math.floor(Math.min(headPix.y, tailPix.y) - roi.heightPx * 0.25), 0, roi.heightPx - 1),
    yHi: clamp(Math.ceil(Math.max(headPix.y, tailPix.y) + roi.heightPx * 0.25), 0, roi.heightPx - 1),
  };

  const mask = cleanMask(probs, roi.widthPx, roi.heightPx, guide);
  const contour = marchingSquares(mask, roi.widthPx, roi.heightPx, roi);
  const baseHead = { x: -roi.halfLen, y: 0 };
  const baseTail = { x: roi.halfLen, y: 0 };
  const envelope = upperEnvelope(contour, baseHead, baseTail);
  const curve = ensureCurve(fitCatmullRom(envelope, samples), baseHead, baseTail);

  const gradGrid = sobelMagnitude(probs, roi.widthPx, roi.heightPx);
  const tangentAt = (i: number): Pt => {
    const a = curve[Math.max(0, i - 1)];
    const b = curve[Math.min(curve.length - 1, i + 1)];
    return norm(sub(b, a));
  };

  const sampleProb = (local: Pt): number => {
    const pix = localToPixel(roi, local);
    const x = Math.round(pix.x);
    const y = Math.round(pix.y);
    return probs[y * roi.widthPx + x];
  };
  const sampleGrad = (local: Pt): number => {
    const pix = localToPixel(roi, local);
    const x = Math.round(pix.x);
    const y = Math.round(pix.y);
    return gradGrid[y * roi.widthPx + x];
  };

  const snapped = curve.map((pt, idx) => snapAlongNormal(pt, tangentAt(idx), sampleProb, sampleGrad, snapRadius));
  const headRoi = baseHead;
  const tailRoi = baseTail;
  const apex = findApex(snapped, headRoi, tailRoi);

  const toImg = (p: Pt) => localToImage(roi, p);
  const outlineImg = contour.map(toImg);
  const curveImg = snapped.map(toImg);
  const headImg = toImg(headRoi);
  const tailImg = toImg(tailRoi);
  const apexImg = toImg(apex.point);

  const len = Math.hypot(tailImg.x - headImg.x, tailImg.y - headImg.y) || 1;
  const archHeightNorm = apex.height / len;
  const curvature = curvatureFrom3(headRoi, apex.point, tailRoi);
  const tiltDeg = Math.atan2(tailImg.y - headImg.y, tailImg.x - headImg.x) * (180 / Math.PI);
  const browLenNorm = len / Math.max(ipd, 1e-6);

  const displacementRaw = avgDistance(curve, snapped);
  const meanProbRaw = averageProb(snapped, sampleProb);
  const displacement = Number.isFinite(displacementRaw) ? displacementRaw : 0;
  const meanProb = Number.isFinite(meanProbRaw) ? meanProbRaw : 0;
  const confidence = clamp(0.5 * (1 - Math.min(1, displacement / 6)) + 0.5 * meanProb, 0, 1);

  return {
    side: roi.side,
    curveImg,
    headImg,
    tailImg,
    apexImg,
    outlineImg,
    archHeightNorm,
    curvature,
    tiltDeg,
    browLenNorm,
    confidence,
  };
}

export function refineBothBrows(
  sampler: SegmentationSampler,
  landmarks: BrowEndpoints,
  opts: BrowRefineOptions
): RefineBothBrowsResult {
  const rois = buildBrowROIs(landmarks, opts);
  const leftROI = rois.find((r) => r.side === 'left');
  const rightROI = rois.find((r) => r.side === 'right');
  if (!leftROI || !rightROI) {
    throw new Error('Unable to build brow ROIs');
  }
  const left = refineBrowFromSeg(leftROI, sampler, opts);
  const right = refineBrowFromSeg(rightROI, sampler, opts);
  return { left, right };
}

export const __test__helpers = {
  cleanMask,
  marchingSquares,
  sobelMagnitude,
};
