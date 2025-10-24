import type { Pt } from '@/lib/points';
import type { ParsingLogits } from '@/models/detector-types';

export interface SyntheticJawResult {
  polyline: Pt[];
  confidence: number;
  coverage: number;
}

interface JawSample {
  x: number;
  y: number;
  inside: number;
  outside: number;
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const LEFT_GONION = 234;
const RIGHT_GONION = 454;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function computeBounds(points: Pt[]): Bounds | null {
  if (!points.length) return null;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return null;
  }
  return { minX, maxX, minY, maxY };
}

function toGridPoint(pt: Pt | undefined, crop: ParsingLogits['crop'], scaleX: number, scaleY: number, w: number, h: number): Pt | null {
  if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return null;
  const x = (pt.x - crop.sx) * scaleX;
  const y = (pt.y - crop.sy) * scaleY;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: clamp(x, 0, Math.max(0, w - 1)), y: clamp(y, 0, Math.max(0, h - 1)) };
}

function fromGridPoint(pt: Pt, crop: ParsingLogits['crop'], invScaleX: number, invScaleY: number): Pt {
  return { x: crop.sx + pt.x * invScaleX, y: crop.sy + pt.y * invScaleY };
}

function rasterizeJaw(width: number, jaw: Pt[]): Float32Array {
  const line = new Float32Array(width);
  line.fill(Number.NaN);
  if (jaw.length < 2) return line;

  for (let i = 1; i < jaw.length; i++) {
    const prev = jaw[i - 1];
    const curr = jaw[i];
    const x0 = Math.round(prev.x);
    const x1 = Math.round(curr.x);
    const steps = Math.max(1, Math.abs(x1 - x0));
    for (let s = 0; s <= steps; s++) {
      const t = steps === 0 ? 0 : s / steps;
      const x = clamp(Math.round(prev.x + (curr.x - prev.x) * t), 0, Math.max(0, width - 1));
      const y = prev.y + (curr.y - prev.y) * t;
      const current = line[x];
      if (Number.isNaN(current) || y > current) {
        line[x] = y;
      }
    }
  }

  let last = Number.NaN;
  for (let x = 0; x < width; x++) {
    const val = line[x];
    if (Number.isNaN(val)) {
      if (!Number.isNaN(last)) {
        line[x] = last;
      }
    } else {
      last = val;
    }
  }

  last = Number.NaN;
  for (let x = width - 1; x >= 0; x--) {
    const val = line[x];
    if (Number.isNaN(val)) {
      if (!Number.isNaN(last)) {
        line[x] = last;
      }
    } else {
      last = val;
    }
  }

  let fallback = 0;
  for (let x = 0; x < width; x++) {
    const val = line[x];
    if (!Number.isNaN(val)) fallback = Math.max(fallback, val);
  }
  for (let x = 0; x < width; x++) {
    if (Number.isNaN(line[x])) line[x] = fallback;
  }

  return line;
}

function chaikinSmooth(points: Pt[], iterations = 2): Pt[] {
  let result = points.slice();
  for (let iter = 0; iter < iterations; iter++) {
    if (result.length < 3) break;
    const smoothed: Pt[] = [result[0]];
    for (let i = 0; i < result.length - 1; i++) {
      const p0 = result[i];
      const p1 = result[i + 1];
      const q: Pt = { x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y };
      const r: Pt = { x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y };
      smoothed.push(q, r);
    }
    smoothed.push(result[result.length - 1]);
    result = smoothed;
  }
  return result;
}

function downsample(points: Pt[], maxPoints = 120): Pt[] {
  if (points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  const res: Pt[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = step * i;
    const base = Math.floor(idx);
    const t = idx - base;
    const p0 = points[base];
    const p1 = points[base + 1] ?? p0;
    res.push({ x: lerp(p0.x, p1.x, t), y: lerp(p0.y, p1.y, t) });
  }
  return res;
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function buildDifferenceSampler(logits: ParsingLogits) {
  const { skin, neck, hair, background } = logits;
  if (!skin) throw new Error('Skin logits required for jaw extraction');
  const competitors = [neck, hair, background].filter((plane): plane is Float32Array => !!plane);
  return (x: number, y: number) => {
    const idx = y * logits.width + x;
    const skinVal = skin[idx];
    let other = -Infinity;
    for (const plane of competitors) {
      const val = plane[idx];
      if (val > other) other = val;
    }
    if (competitors.length === 0) other = 0;
    return skinVal - other;
  };
}

function computeSearchBand(
  jawBounds: Bounds,
  faceBounds: Bounds,
  width: number,
  height: number
): { xStart: number; xEnd: number; yUpper: number; yLower: number; bandAbove: number; bandBelow: number } | null {
  const faceHeight = Math.max(1, faceBounds.maxY - faceBounds.minY);
  const bandBelow = Math.max(6, faceHeight * 0.22);
  const bandAbove = Math.max(2, faceHeight * 0.06);
  const xStart = clamp(Math.floor(jawBounds.minX), 0, width - 1);
  const xEnd = clamp(Math.ceil(jawBounds.maxX), 0, width - 1);
  const yUpper = clamp(Math.floor(jawBounds.minY - bandAbove), 0, height - 1);
  const yLower = clamp(Math.ceil(jawBounds.maxY + bandBelow), 0, height - 1);
  if (xEnd - xStart < 6 || yLower <= yUpper) return null;
  return { xStart, xEnd, yUpper, yLower, bandAbove, bandBelow };
}

function extractIsoContour(
  sample: (x: number, y: number) => number,
  raster: Float32Array,
  band: { xStart: number; xEnd: number; yUpper: number; yLower: number; bandAbove: number; bandBelow: number }
): JawSample[] {
  const samples: JawSample[] = [];
  for (let x = band.xStart; x <= band.xEnd; x++) {
    const jawY = raster[x];
    if (!Number.isFinite(jawY)) continue;
    const startY = clamp(Math.floor(jawY - band.bandAbove), band.yUpper, band.yLower);
    const endY = clamp(Math.ceil(jawY + band.bandBelow), band.yUpper, band.yLower);
    if (endY - startY < 2) continue;

    let prevVal = sample(x, startY);
    let prevY = startY;

    if (prevVal < -1e-3) {
      for (let y = startY - 1; y >= band.yUpper && y >= startY - 3; y--) {
        const val = sample(x, y);
        if (val >= 0) {
          prevVal = val;
          prevY = y;
          break;
        }
      }
    }

    for (let y = prevY + 1; y <= endY; y++) {
      const currVal = sample(x, y);
      if (prevVal >= 0 && currVal < 0) {
        const t = prevVal / (prevVal - currVal);
        const isoY = prevY + t;
        samples.push({ x: x + 0.5, y: isoY, inside: prevVal, outside: currVal });
        break;
      }
      prevVal = currVal;
      prevY = y;
    }
  }
  return samples;
}

export function computeJawFromMasks(
  landmarks: Pt[],
  logits: ParsingLogits
): SyntheticJawResult | null {
  if (!logits?.skin || logits.width <= 0 || logits.height <= 0) return null;

  const leftEar = landmarks[LEFT_GONION];
  const rightEar = landmarks[RIGHT_GONION];
  if (!leftEar || !rightEar) return null;

  const landmarksInGrid = landmarks.map((pt) =>
    toGridPoint(pt, logits.crop, logits.width / (logits.crop.sw || 1), logits.height / (logits.crop.sh || 1), logits.width, logits.height)
  ).filter((p): p is Pt => !!p);
  const faceBounds = computeBounds(landmarksInGrid);
  if (!faceBounds) return null;

  const jawOutline = [127, 234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 365, 397, 288];
  const jawPoints = jawOutline
    .map((idx) =>
      toGridPoint(landmarks[idx], logits.crop, logits.width / (logits.crop.sw || 1), logits.height / (logits.crop.sh || 1), logits.width, logits.height)
    )
    .filter((p): p is Pt => !!p);
  if (jawPoints.length < 4) return null;

  const jawBounds = computeBounds(jawPoints);
  if (!jawBounds) return null;

  const band = computeSearchBand(jawBounds, faceBounds, logits.width, logits.height);
  if (!band) return null;

  const raster = rasterizeJaw(logits.width, jawPoints);
  const sampleDiff = buildDifferenceSampler(logits);
  const contour = extractIsoContour(sampleDiff, raster, band);
  if (contour.length < 6) return null;

  const rawPoints: Pt[] = contour.map((pt) => ({ x: pt.x, y: pt.y }));
  const smoothed = chaikinSmooth(rawPoints, 2);
  const limited = downsample(smoothed, 120);
  const sorted = limited.slice().sort((a, b) => a.x - b.x);

  const monotonic: Pt[] = [];
  let lastX = -Infinity;
  for (const pt of sorted) {
    if (pt.x <= lastX) continue;
    monotonic.push(pt);
    lastX = pt.x;
  }
  if (monotonic.length < 6) return null;

  const invScaleX = (logits.crop.sw || 1) / logits.width;
  const invScaleY = (logits.crop.sh || 1) / logits.height;
  const polyline = monotonic.map((pt) => fromGridPoint(pt, logits.crop, invScaleX, invScaleY));

  const snapT = 0.25;
  polyline[0] = {
    x: lerp(polyline[0].x, leftEar.x, snapT),
    y: lerp(polyline[0].y, leftEar.y, snapT),
  };
  polyline[polyline.length - 1] = {
    x: lerp(polyline[polyline.length - 1].x, rightEar.x, snapT),
    y: lerp(polyline[polyline.length - 1].y, rightEar.y, snapT),
  };

  const coverage = contour.length / Math.max(1, band.xEnd - band.xStart + 1);
  const marginSum = contour.reduce((sum, pt) => sum + (pt.inside - pt.outside), 0);
  const meanMargin = marginSum / contour.length;
  const confidence = clamp01((meanMargin / 4) * coverage);

  return { polyline, confidence, coverage };
}
