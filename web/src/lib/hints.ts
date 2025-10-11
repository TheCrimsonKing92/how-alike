import { FEATURE_OUTLINES, LEFT_EYE_CENTER_INDICES, RIGHT_EYE_CENTER_INDICES } from '@/lib/regions';
import { extractLandmarkBrows, extractLandmarkNose } from '@/lib/landmark-features';

export type Pt = { x: number; y: number };
export type RegionHint = { region: string; points: Pt[]; open?: boolean };

function mapPts(points: Pt[], idxs: number[]): Pt[] {
  return idxs.map((i) => points[i]).filter(Boolean) as Pt[];
}

function keepCentral(pts: Pt[], fraction = 0.85): Pt[] {
  if (pts.length < 4) return pts;
  const lens: number[] = [0];
  for (let i = 1; i < pts.length; i++)
    lens[i] = lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  const total = lens[lens.length - 1] || 1;
  const pad = ((1 - fraction) / 2) * total;
  const startL = pad;
  const endL = total - pad;
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const L = lens[i];
    if (L < startL || L > endL) continue;
    out.push(pts[i]);
  }
  return out.length >= 2 ? out : pts;
}

function centroid(pts: Pt[]): Pt {
  if (pts.length === 0) return { x: 0, y: 0 };
  let sx = 0, sy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / pts.length, y: sy / pts.length };
}

/**
 * Derive region hints using landmark-based feature extraction (high precision)
 * Fallback to static contours if landmark extraction fails
 */
export function deriveRegionHints(points: Pt[]): RegionHint[] {
  const hints: RegionHint[] = [];

  // Compute eye centers for IPD scale
  const leftEyePts = mapPts(points, LEFT_EYE_CENTER_INDICES);
  const rightEyePts = mapPts(points, RIGHT_EYE_CENTER_INDICES);
  const leftEyeCenter = centroid(leftEyePts);
  const rightEyeCenter = centroid(rightEyePts);
  const ipd = Math.hypot(rightEyeCenter.x - leftEyeCenter.x, rightEyeCenter.y - leftEyeCenter.y) || 1;

  // Brows: use landmark-based extraction with upper lid offset
  try {
    const [leftBrow, rightBrow] = extractLandmarkBrows(points, leftEyeCenter, rightEyeCenter, ipd);
    if (leftBrow.length >= 3) {
      hints.push({ region: 'brows', points: leftBrow, open: true });
    }
    if (rightBrow.length >= 3) {
      hints.push({ region: 'brows', points: rightBrow, open: true });
    }
  } catch (err) {
    // Fallback to static contours
    const browDefs = FEATURE_OUTLINES.brows ?? [];
    for (const seq of browDefs) {
      const pts = keepCentral(mapPts(points, seq), 0.85);
      if (pts.length >= 2) hints.push({ region: 'brows', points: pts, open: true });
    }
  }

  // Nose: use landmark-based extraction with bridge and alar points
  try {
    const noseOutline = extractLandmarkNose(points, ipd);
    if (noseOutline.length >= 5) {
      hints.push({ region: 'nose', points: noseOutline, open: false });
    } else {
      throw new Error('Insufficient nose landmarks');
    }
  } catch (err) {
    // Fallback to static contours
    const noseDefs = FEATURE_OUTLINES.nose ?? [];
    if (noseDefs[0]) {
      const alar = mapPts(points, noseDefs[0]);
      if (alar.length >= 5) {
        const cut = Math.max(0, Math.floor(alar.length * 0.08));
        const trimmed = alar.slice(cut, alar.length - cut);
        hints.push({ region: 'nose', points: trimmed, open: true });
      }
    }
    if (noseDefs[1]) {
      const bridge = mapPts(points, noseDefs[1]);
      if (bridge.length >= 2) hints.push({ region: 'nose', points: bridge, open: true });
    }
  }

  return hints;
}

