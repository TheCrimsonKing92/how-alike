import { REFINED_BROW_CONFIDENCE_THRESHOLD, type RefineBothBrowsResult } from '@/lib/brow-seg-refinement';
import type { RegionPoly } from '@/workers/types';

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerpPoint(a: { x: number; y: number }, b: { x: number; y: number }, t: number) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

const MIN_BASELINE_SEGMENTS = 6;

function buildClosedBrowPolygon(entry: RefineBothBrowsResult['left'] | RefineBothBrowsResult['right']) {
  if (!entry || !entry.curveImg?.length || entry.curveImg.length < 2) return null;
  const { curveImg, headImg, tailImg } = entry;
  if (!headImg || !tailImg) return null;

  const first = curveImg[0];
  const last = curveImg[curveImg.length - 1];
  const headToFirst = distance(headImg, first);
  const headToLast = distance(headImg, last);
  const orientedCurve = headToFirst <= headToLast ? curveImg.slice() : curveImg.slice().reverse();

  const baseSegments = Math.max(MIN_BASELINE_SEGMENTS, Math.min(24, Math.round(orientedCurve.length / 3)));
  const baseline: { x: number; y: number }[] = [];
  for (let i = baseSegments; i >= 0; i--) {
    const t = i / baseSegments;
    const pt = lerpPoint(tailImg, headImg, t);
    baseline.push(pt);
  }

  // Remove duplicate point if curve already ends near tail
  const combined = [...orientedCurve];
  const lastCurvePoint = orientedCurve[orientedCurve.length - 1];
  if (distance(lastCurvePoint, tailImg) > 1e-3) {
    combined.push(tailImg);
  }
  // Skip first baseline point if it duplicates tail
  combined.push(...baseline.slice(1));

  return combined;
}

const MIN_ARCH_FOR_POLY = 0.04;

function toRefinedPoly(entry: RefineBothBrowsResult['left'] | RefineBothBrowsResult['right']): RegionPoly | null {
  if (
    !entry ||
    !Number.isFinite(entry.archHeightNorm) ||
    entry.archHeightNorm < MIN_ARCH_FOR_POLY ||
    entry.confidence < REFINED_BROW_CONFIDENCE_THRESHOLD
  ) {
    return null;
  }
  const confidence = Number.isFinite(entry.confidence) ? entry.confidence : 0;
  const polygon =
    (entry.outlineImg && entry.outlineImg.length >= 3 ? entry.outlineImg : null) ||
    buildClosedBrowPolygon(entry);
  if (!polygon || polygon.length < 3) return null;
  const points = polygon.map((pt) => ({ x: pt.x, y: pt.y }));
  return {
    region: 'brows',
    points,
    open: false,
    source: 'refined',
    confidence,
  };
}

export function mergeRefinedBrowsIntoPolys(polys: RegionPoly[], refined?: RefineBothBrowsResult): RegionPoly[] {
  if (!refined) return polys;

  const refinedPolys: RegionPoly[] = [];
  const leftPoly = toRefinedPoly(refined.left);
  if (leftPoly) refinedPolys.push(leftPoly);
  const rightPoly = toRefinedPoly(refined.right);
  if (rightPoly) refinedPolys.push(rightPoly);

  if (!refinedPolys.length) return polys;

  const originalBrows = polys
    .filter((p) => p.region === 'brows')
    .map((poly) => ({
      ...poly,
      source: poly.source ?? 'segmentation',
    }));
  const nonBrows = polys.filter((p) => p.region !== 'brows');

  const fallbackNeeded = Math.max(0, Math.min(originalBrows.length, 2 - refinedPolys.length));
  const fallbackBrows = originalBrows.slice(0, fallbackNeeded);

  return [...nonBrows, ...refinedPolys, ...fallbackBrows];
}

export const __test__ = {
  toRefinedPoly,
  buildClosedBrowPolygon,
};
