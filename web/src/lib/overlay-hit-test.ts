import type { RegionPoly, MaskOverlay } from '@/workers/types';
import type { Pt } from './points';

const REGION_CLASS_MAP: Record<string, number[]> = {
  brows: [6, 7],
  eyes: [4, 5],
  nose: [2],
  mouth: [10, 11, 12],
};

const CLASS_TO_REGION: Record<number, string> = (() => {
  const table: Record<number, string> = {};
  for (const [region, classes] of Object.entries(REGION_CLASS_MAP)) {
    for (const cls of classes) {
      table[cls] = region;
    }
  }
  return table;
})();

const DEFAULT_HOVER_ORDER = ['brows', 'eyes', 'mouth', 'nose', 'jaw'];

function maskClassAtPoint(p: Pt, mask: MaskOverlay): number | null {
  const { width, height, crop, labels } = mask;
  const { sx, sy, sw, sh } = crop;
  const withinX = p.x >= sx && p.x < sx + sw;
  const withinY = p.y >= sy && p.y < sy + sh;
  if (!withinX || !withinY) return null;

  const relX = ((p.x - sx) / Math.max(sw, 1)) * width;
  const relY = ((p.y - sy) / Math.max(sh, 1)) * height;

  const ix = Math.floor(relX);
  const iy = Math.floor(relY);
  if (ix < 0 || ix >= width || iy < 0 || iy >= height) return null;

  const idx = iy * width + ix;
  if (idx < 0 || idx >= labels.length) return null;
  return labels[idx];
}

function pointInPoly(pt: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = p.x - a.x;
  const wy = p.y - a.y;
  const c1 = vx * wx + vy * wy;
  const c2 = vx * vx + vy * vy || 1e-9;
  const t = Math.max(0, Math.min(1, c1 / c2));
  const cx = a.x + t * vx;
  const cy = a.y + t * vy;
  return Math.hypot(p.x - cx, p.y - cy);
}

function sortRegions(regions: RegionPoly[], hoverOrder: string[]): RegionPoly[] {
  const orderIndex = (region: string) => {
    const idx = hoverOrder.indexOf(region);
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
  };
  return [...regions].sort((a, b) => orderIndex(a.region) - orderIndex(b.region));
}

export interface HitTestParams {
  x: number;
  y: number;
  regions: RegionPoly[];
  mask?: MaskOverlay;
  hoverOrder?: string[];
  openDistance?: number;
}

/**
 * Resolve the feature region under the given point, preferring segmentation
 * classes when available and falling back to geometric outlines.
 */
export function hitTestRegion({
  x,
  y,
  regions,
  mask,
  hoverOrder = DEFAULT_HOVER_ORDER,
  openDistance = 6,
}: HitTestParams): string | null {
  if (!regions.length) return null;

  const pt = { x, y };
  const regionNames = new Set(regions.map((r) => r.region));

  if (mask) {
    const cls = maskClassAtPoint(pt, mask);
    if (cls != null) {
      const region = CLASS_TO_REGION[cls];
      if (region && regionNames.has(region)) {
        return region;
      }
    }
  }

  const sorted = sortRegions(regions, hoverOrder);
  for (const r of sorted) {
    const pts = r.points;
    if (pts.length < 2) continue;
    const closed = !(r.open === true);
    if (closed && pts.length >= 3) {
      if (pointInPoly(pt, pts)) return r.region;
    } else {
      for (let i = 1; i < pts.length; i++) {
        if (distanceToSegment(pt, pts[i - 1], pts[i]) <= openDistance) {
          return r.region;
        }
      }
    }
  }

  return null;
}

// Expose helpers for unit testing
export const __testUtils = {
  maskClassAtPoint,
  pointInPoly,
  distanceToSegment,
};
