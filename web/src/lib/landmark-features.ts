// Landmark-based feature extraction for high-frequency facial features
// Uses MediaPipe's 468 landmarks to extract precise, anatomically-aware curves

import type { Pt } from './points';
import { LEFT_EYE_RING, RIGHT_EYE_RING, FEATURE_OUTLINES } from './regions';

/**
 * Compute centroid of a point set
 */
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
 * Fit a smooth curve through points using moving average
 */
function smoothCurve(pts: Pt[], windowSize = 3): Pt[] {
  if (pts.length < windowSize) return pts.slice();
  const half = Math.floor(windowSize / 2);
  const result: Pt[] = [];

  for (let i = 0; i < pts.length; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(pts.length, i + half + 1);
    const window = pts.slice(start, end);
    result.push(centroid(window));
  }

  return result;
}

/**
 * Extract upper eyelid arc (above eye center) from eye ring landmarks
 */
function extractUpperLidArc(
  points: Pt[],
  ringIndices: number[],
  eyeCenter: Pt,
  ipd: number
): Pt[] {
  const tolerance = 0.03 * ipd;

  // Find longest contiguous sequence of points above eye center
  const flags = ringIndices.map(i => {
    const pt = points[i];
    return pt ? pt.y < eyeCenter.y + tolerance : false;
  });

  let bestStart = 0;
  let bestLen = 0;
  let i = 0;

  while (i < flags.length) {
    while (i < flags.length && !flags[i]) i++;
    const start = i;
    while (i < flags.length && flags[i]) i++;
    const len = i - start;
    if (len > bestLen) {
      bestLen = len;
      bestStart = start;
    }
  }

  // Pad if needed to ensure minimum 6 points
  const seq: number[] = [];
  for (let k = 0; k < bestLen; k++) {
    seq.push(ringIndices[bestStart + k]);
  }

  while (seq.length < 6 && seq.length < ringIndices.length) {
    const leftIdx = (bestStart - 1 + ringIndices.length) % ringIndices.length;
    const rightIdx = (bestStart + bestLen) % ringIndices.length;
    if (!seq.includes(ringIndices[leftIdx])) {
      seq.unshift(ringIndices[leftIdx]);
      bestStart = leftIdx;
    }
    if (seq.length < 6 && !seq.includes(ringIndices[rightIdx])) {
      seq.push(ringIndices[rightIdx]);
      bestLen++;
    }
  }

  return seq.map(i => points[i]).filter(Boolean) as Pt[];
}

/**
 * Derive eyebrow curve by offsetting upper lid arc UPWARD (toward forehead)
 * Uses vertical offset, not radial
 */
function deriveBrowFromLid(
  upperLid: Pt[],
  eyeCenter: Pt,
  ipd: number
): Pt[] {
  if (upperLid.length < 3) return [];

  // Offset UPWARD (negative Y direction) by a fixed amount
  // Typical brow is 15-20% of IPD above the upper eyelid
  const verticalLift = ipd * 0.18;

  const browPts: Pt[] = upperLid.map(pt => {
    // Simply move each point upward (reduce Y coordinate)
    // Y increases downward in screen coordinates, so subtract to go up
    return {
      x: pt.x,
      y: pt.y - verticalLift
    };
  });

  return smoothCurve(browPts, 3);
}

/**
 * Extract eyebrow curves from MediaPipe's dedicated eyebrow landmarks
 * Returns [leftBrow, rightBrow] as smooth arcs
 */
export function extractLandmarkBrows(
  points: Pt[],
  leftEyeCenter: Pt,
  rightEyeCenter: Pt,
  ipd: number
): Pt[][] {
  // Use MediaPipe's actual eyebrow landmarks from FEATURE_OUTLINES
  // Left brow: [70, 63, 105, 66, 107, 55, 193, 35, 124]
  // Right brow: [300, 293, 334, 296, 336, 285, 417, 265, 353]

  const leftBrowIndices = FEATURE_OUTLINES.brows?.[0] || [];
  const rightBrowIndices = FEATURE_OUTLINES.brows?.[1] || [];

  // Extract points and sort by angle from eye center to follow natural arc
  let leftBrowPts = leftBrowIndices.map(i => points[i]).filter(Boolean) as Pt[];
  let rightBrowPts = rightBrowIndices.map(i => points[i]).filter(Boolean) as Pt[];

  // Sort left brow by angle from eye center (inner to outer)
  // atan2 gives angle from eye center to each point
  // Sorting by angle ensures we follow the natural curve
  leftBrowPts.sort((a, b) => {
    const angleA = Math.atan2(a.y - leftEyeCenter.y, a.x - leftEyeCenter.x);
    const angleB = Math.atan2(b.y - leftEyeCenter.y, b.x - leftEyeCenter.x);
    return angleB - angleA; // Reverse order: inner (right) to outer (left)
  });

  // Sort right brow by angle from eye center (inner to outer)
  rightBrowPts.sort((a, b) => {
    const angleA = Math.atan2(a.y - rightEyeCenter.y, a.x - rightEyeCenter.x);
    const angleB = Math.atan2(b.y - rightEyeCenter.y, b.x - rightEyeCenter.x);
    return angleA - angleB; // Normal order: inner (left) to outer (right)
  });

  // Apply light smoothing to reduce jitter
  return [
    leftBrowPts.length >= 3 ? smoothCurve(leftBrowPts, 3) : leftBrowPts,
    rightBrowPts.length >= 3 ? smoothCurve(rightBrowPts, 3) : rightBrowPts
  ];
}

/**
 * Extract nose outline as a smooth teardrop shape
 * Uses key landmarks (bridge, alar, tip) to create a simplified, visually clean outline
 */
export function extractLandmarkNose(
  points: Pt[],
  ipd: number
): Pt[] {
  // Key landmarks for teardrop shape:
  // - Bridge: landmark 168 (mid-bridge between eyes)
  // - Alar (widest points): landmarks 94 (left) and 331 (right)
  // - Tip: landmark 2 (nose tip apex)

  const bridgeMid = points[168];
  const leftAlar = points[94];
  const rightAlar = points[331];
  const noseTip = points[2];

  if (!bridgeMid || !leftAlar || !rightAlar || !noseTip) return [];

  // Calculate center line (vertical axis through nose)
  const centerX = (leftAlar.x + rightAlar.x) / 2;

  // Key vertical positions
  const topY = bridgeMid.y;
  const alarY = (leftAlar.y + rightAlar.y) / 2;
  const tipY = noseTip.y;

  // Width at different levels
  const alarWidth = Math.abs(rightAlar.x - leftAlar.x);
  const bridgeWidth = alarWidth * 0.25; // Narrow at top (25% of alar width)
  const tipWidth = alarWidth * 0.15;    // Very narrow at tip (15% of alar width)

  // Build smooth teardrop with interpolated points
  const outline: Pt[] = [];

  // Define key vertical levels with their widths
  const levels = [
    { y: topY, width: bridgeWidth },           // Bridge (narrow top)
    { y: topY + (alarY - topY) * 0.4, width: alarWidth * 0.6 },  // Upper widening
    { y: alarY, width: alarWidth },            // Widest point (alar level)
    { y: alarY + (tipY - alarY) * 0.6, width: alarWidth * 0.7 }, // Narrowing
    { y: tipY, width: tipWidth }               // Tip (narrow point)
  ];

  // Build left side (top to bottom)
  for (const level of levels) {
    outline.push({
      x: centerX - level.width / 2,
      y: level.y
    });
  }

  // Build right side (bottom to top)
  for (let i = levels.length - 1; i >= 0; i--) {
    outline.push({
      x: centerX + levels[i].width / 2,
      y: levels[i].y
    });
  }

  // Close the outline
  outline.push(outline[0]);

  return smoothCurve(outline, 3);
}

/**
 * Compute principal curvature direction using local PCA
 * Useful for extracting ridge lines from dense landmark neighborhoods
 */
export function computeLocalCurvature(
  points: Pt[],
  indices: number[],
  radius: number
): { center: Pt; direction: Pt } | null {
  const pts = indices.map(i => points[i]).filter(Boolean);
  if (pts.length < 3) return null;

  const c = centroid(pts);

  // Center points
  const centered = pts.map(p => ({ x: p.x - c.x, y: p.y - c.y }));

  // Compute covariance matrix
  let cxx = 0, cxy = 0, cyy = 0;
  for (const p of centered) {
    cxx += p.x * p.x;
    cxy += p.x * p.y;
    cyy += p.y * p.y;
  }
  cxx /= pts.length;
  cxy /= pts.length;
  cyy /= pts.length;

  // Eigenvalue decomposition (2x2 symmetric)
  const trace = cxx + cyy;
  const det = cxx * cyy - cxy * cxy;
  const lambda1 = trace / 2 + Math.sqrt(Math.max(0, trace * trace / 4 - det));

  // Principal eigenvector (direction of maximum variance)
  let vx = cxy;
  let vy = lambda1 - cxx;
  const vlen = Math.hypot(vx, vy) || 1;
  vx /= vlen;
  vy /= vlen;

  return {
    center: c,
    direction: { x: vx, y: vy }
  };
}
