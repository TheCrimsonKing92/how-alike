/**
 * Feature Axes - Landmark-based facial feature measurements
 *
 * Extracts detailed geometric measurements from MediaPipe FaceMesh landmarks
 * for axis-based feature analysis and comparison.
 */

import type { Point } from '@/lib/points';

export const SYNTHETIC_JAW_CONFIDENCE_THRESHOLD = 0.12;

export interface SyntheticJawInput {
  polyline: Point[];
  confidence: number;
  leftGonion: Point;
  rightGonion: Point;
  chin: Point;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// MediaPipe FaceMesh landmark indices (468 landmarks)
const LANDMARKS = {
  // Eyes
  leftEyeInner: 133,
  leftEyeOuter: 33,
  rightEyeInner: 362,
  rightEyeOuter: 263,
  leftEyeTop: 159,
  leftEyeBottom: 145,
  rightEyeTop: 386,
  rightEyeBottom: 374,

  // Nose
  noseTip: 1,
  noseBridge: 6,
  noseBridgeMid: 168,
  noseBridgeLower: 197,
  leftAlar: 94,
  rightAlar: 331,

  // Mouth
  upperLipTop: 0,
  upperLipBottom: 13,
  lowerLipTop: 14,
  lowerLipBottom: 17,
  cupidsBowLeft: 37,
  cupidsBowCenter: 0,
  cupidsBowRight: 267,
  mouthLeft: 61,
  mouthRight: 291,

  // Jaw
  chinCenter: 152,
  leftGonion: 234,
  rightGonion: 454,

  // Forehead
  foreheadTop: 10,
  foreheadLeft: 109,
  foreheadRight: 338,

  // Brows (MediaPipe eyebrow landmarks - primary points)
  leftBrowInner: 70,
  leftBrowMid: 107,
  leftBrowOuter: 66,
  rightBrowInner: 300,
  rightBrowMid: 336,
  rightBrowOuter: 296,

  // Cheeks
  leftCheekbone: 234,
  rightCheekbone: 454,
  leftNasolabialFold: 36,
  rightNasolabialFold: 266,
};

/**
 * Compute Euclidean distance between two points
 */
function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Compute angle in degrees between two points relative to horizontal
 */
function angleDegrees(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/**
 * Compute interocular distance (distance between eye centers)
 */
function interocularDistance(leftEye: Point, rightEye: Point): number {
  return distance(leftEye, rightEye);
}

/**
 * Compute face width at jaw level
 */
function faceWidth(landmarks: Point[]): number {
  const leftJaw = landmarks[LANDMARKS.leftGonion];
  const rightJaw = landmarks[LANDMARKS.rightGonion];
  return distance(leftJaw, rightJaw);
}

// Extended landmark sets for robust canthal tilt (8-10 points per corner)
const LEFT_EYE_OUTER_CORNER_INDICES = [33, 7, 163, 144, 145, 246, 161, 160, 159, 158];
const LEFT_EYE_INNER_CORNER_INDICES = [133, 173, 157, 158, 159, 160, 161, 246];
const RIGHT_EYE_OUTER_CORNER_INDICES = [263, 249, 390, 373, 374, 466, 388, 387, 386, 385];
const RIGHT_EYE_INNER_CORNER_INDICES = [362, 398, 384, 385, 386, 387, 388, 466];

const LEFT_EYE_UPPER_INDICES = [159, 158, 160, 161, 246];
const LEFT_EYE_LOWER_INDICES = [145, 144, 153, 154, 155];
const RIGHT_EYE_UPPER_INDICES = [386, 385, 384, 387, 388];
const RIGHT_EYE_LOWER_INDICES = [374, 380, 381, 382, 383];

// Iris center landmarks (available with refineLandmarks: true)
const LEFT_IRIS_CENTER = 468;
const RIGHT_IRIS_CENTER = 473;

// Complete eyebrow landmark sets (10 points each for robust measurements)
// Left eyebrow: inner to outer progression
const LEFT_EYEBROW_INDICES = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
// Right eyebrow: inner to outer progression
const RIGHT_EYEBROW_INDICES = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];

function averageLandmarks(landmarks: Point[], indices: number[]): Point {
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  const count = indices.length || 1;
  for (const idx of indices) {
    const lm = landmarks[idx];
    sumX += lm.x;
    sumY += lm.y;
    sumZ += lm.z ?? 0;
  }
  return {
    x: sumX / count,
    y: sumY / count,
    z: sumZ / count,
  };
}

const RAD_TO_DEG = 180 / Math.PI;

/**
 * Fit a line through points using PCA and return the slope angle in degrees.
 * This is more robust than simple linear regression for noisy landmark data.
 */
function pcaLineAngle(points: Point[]): number {
  const n = points.length;
  if (n === 0) return 0;

  // Compute centroid
  let meanX = 0;
  let meanY = 0;
  for (const p of points) {
    meanX += p.x;
    meanY += p.y;
  }
  meanX /= n;
  meanY /= n;

  // Compute covariance matrix elements
  let cov_xx = 0;
  let cov_xy = 0;
  let cov_yy = 0;
  for (const p of points) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    cov_xx += dx * dx;
    cov_xy += dx * dy;
    cov_yy += dy * dy;
  }

  // Find the principal eigenvector (direction of maximum variance)
  // For 2x2 matrix, eigenvalues are: λ = (trace ± sqrt(trace² - 4*det)) / 2
  const trace = cov_xx + cov_yy;
  const det = cov_xx * cov_yy - cov_xy * cov_xy;
  const discriminant = trace * trace - 4 * det;

  if (discriminant < 0 || trace === 0) {
    return 0; // Degenerate case
  }

  const lambda1 = (trace + Math.sqrt(discriminant)) / 2;

  // Eigenvector corresponding to lambda1: [cov_xy, lambda1 - cov_xx]
  // (unless cov_xy ≈ 0, then use [1, 0] or [0, 1])
  let vx: number, vy: number;
  if (Math.abs(cov_xy) > 1e-10) {
    vx = cov_xy;
    vy = lambda1 - cov_xx;
  } else if (cov_xx >= cov_yy) {
    vx = 1;
    vy = 0;
  } else {
    vx = 0;
    vy = 1;
  }

  // Normalize eigenvector
  const norm = Math.sqrt(vx * vx + vy * vy);
  if (norm < 1e-10) return 0;
  vx /= norm;
  vy /= norm;

  // Return angle in degrees
  return Math.atan2(vy, vx) * RAD_TO_DEG;
}

function slopeAngle(points: Point[]): number {
  const n = points.length || 1;
  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let cov = 0;
  let varX = 0;
  for (const p of points) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    cov += dx * dy;
    varX += dx * dx;
  }
  if (varX === 0) {
    return 0;
  }
  const slope = cov / varX;
  return Math.atan(slope) * RAD_TO_DEG;
}

function rotatePointAround(
  point: Point,
  center: Point,
  angleRad: number
): Point {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos,
    z: point.z,
  };
}

// ============================================================================
// Eyes
// ============================================================================

export interface EyeMeasurements {
  canthalTilt: number;           // degrees (positive = upward slant)
  eyeSize: number;               // normalized height
  interocularDistance: number;   // ratio to face width
  leftCanthalTilt?: number;      // individual eye tilts (for debugging)
  rightCanthalTilt?: number;
  irisTracking?: {               // iris centers for eyeball pose
    leftIris: Point;
    rightIris: Point;
  };
}

/**
 * Extract eye measurements from landmarks with improved stability
 */
export function extractEyeMeasurements(
  landmarks: Point[],
  leftEye: Point,
  rightEye: Point
): EyeMeasurements {
  // Setup rotation to normalize for face roll
  const eyeMid = {
    x: (leftEye.x + rightEye.x) / 2,
    y: (leftEye.y + rightEye.y) / 2,
  };
  const rollRad = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
  const rotate = (pt: Point) => rotatePointAround(pt, eyeMid, -rollRad);

  // Gather all corner landmarks (8-10 points per corner) and rotate them
  const leftOuterPoints = LEFT_EYE_OUTER_CORNER_INDICES.map(idx => landmarks[idx]).filter(Boolean).map(rotate);
  const leftInnerPoints = LEFT_EYE_INNER_CORNER_INDICES.map(idx => landmarks[idx]).filter(Boolean).map(rotate);
  const rightOuterPoints = RIGHT_EYE_OUTER_CORNER_INDICES.map(idx => landmarks[idx]).filter(Boolean).map(rotate);
  const rightInnerPoints = RIGHT_EYE_INNER_CORNER_INDICES.map(idx => landmarks[idx]).filter(Boolean).map(rotate);

  // Compute average positions for each corner region
  const leftOuterAvg = averageLandmarks(landmarks, LEFT_EYE_OUTER_CORNER_INDICES);
  const leftInnerAvg = averageLandmarks(landmarks, LEFT_EYE_INNER_CORNER_INDICES);
  const rightOuterAvg = averageLandmarks(landmarks, RIGHT_EYE_OUTER_CORNER_INDICES);
  const rightInnerAvg = averageLandmarks(landmarks, RIGHT_EYE_INNER_CORNER_INDICES);

  // Rotate averages
  const leftOuterAvgRot = rotate(leftOuterAvg);
  const leftInnerAvgRot = rotate(leftInnerAvg);
  const rightOuterAvgRot = rotate(rightOuterAvg);
  const rightInnerAvgRot = rotate(rightInnerAvg);

  // Canthal tilt: angle from inner to outer corner
  // Positive = outer corner higher (upward slant), Negative = outer corner lower (downward slant)
  // Note: Y increases downward in screen coordinates, so we negate dy
  const leftCanthalTilt = Math.atan2(
    -(leftOuterAvgRot.y - leftInnerAvgRot.y),  // negate for screen coords
    leftOuterAvgRot.x - leftInnerAvgRot.x
  ) * RAD_TO_DEG;

  const rightCanthalTilt = Math.atan2(
    -(rightOuterAvgRot.y - rightInnerAvgRot.y),  // negate for screen coords
    rightOuterAvgRot.x - rightInnerAvgRot.x
  ) * RAD_TO_DEG;

  // Bilateral smoothing: average left and right tilts for symmetry
  const canthalTilt = (leftCanthalTilt + rightCanthalTilt) / 2;

  // Eye size: vertical aperture height averaged across multiple lid points
  const leftTop = rotate(averageLandmarks(landmarks, LEFT_EYE_UPPER_INDICES));
  const leftBottom = rotate(averageLandmarks(landmarks, LEFT_EYE_LOWER_INDICES));
  const rightTop = rotate(averageLandmarks(landmarks, RIGHT_EYE_UPPER_INDICES));
  const rightBottom = rotate(averageLandmarks(landmarks, RIGHT_EYE_LOWER_INDICES));

  const leftHeight = distance(leftTop, leftBottom);
  const rightHeight = distance(rightTop, rightBottom);

  // Bilateral smoothing for eye size
  const avgEyeHeight = (leftHeight + rightHeight) / 2;

  // Normalize by interocular distance
  const ipd = interocularDistance(leftEye, rightEye);
  const eyeSize = avgEyeHeight / ipd;

  // Interocular distance: ratio to face width
  const fw = faceWidth(landmarks);
  const ipdRatio = ipd / (fw || 1);

  // Track iris centers if available (requires refineLandmarks: true)
  let irisTracking: { leftIris: Point; rightIris: Point } | undefined;
  if (landmarks[LEFT_IRIS_CENTER] && landmarks[RIGHT_IRIS_CENTER]) {
    irisTracking = {
      leftIris: landmarks[LEFT_IRIS_CENTER],
      rightIris: landmarks[RIGHT_IRIS_CENTER],
    };
  }

  return {
    canthalTilt,
    eyeSize,
    interocularDistance: ipdRatio,
    leftCanthalTilt,
    rightCanthalTilt,
    irisTracking,
  };
}

// ============================================================================
// Nose
// ============================================================================

export interface NoseMeasurements {
  width: number;              // normalized alar width
  bridgeContour: number;      // curvature (-1=concave, 0=straight, 1=convex)
  tipProjection: number;      // z-depth projection
}

/**
 * Extract nose measurements from landmarks
 */
export function extractNoseMeasurements(
  landmarks: Point[],
  leftEye: Point,
  rightEye: Point
): NoseMeasurements {
  const leftAlar = landmarks[LANDMARKS.leftAlar];
  const rightAlar = landmarks[LANDMARKS.rightAlar];
  const noseTip = landmarks[LANDMARKS.noseTip];
  const bridgeTop = landmarks[LANDMARKS.noseBridge];
  const bridgeMid = landmarks[LANDMARKS.noseBridgeMid];
  const bridgeLower = landmarks[LANDMARKS.noseBridgeLower];

  // Nose width: alar width normalized by face width
  const alarWidth = distance(leftAlar, rightAlar);
  const fw = faceWidth(landmarks);
  const width = alarWidth / fw;

  // Bridge contour: curvature using three bridge points
  // Positive = convex (protruding), negative = concave (flat), zero = straight
  const bridgeLength = distance(bridgeTop, bridgeLower);
  const expectedMidZ = (bridgeTop.z ?? 0) + ((bridgeLower.z ?? 0) - (bridgeTop.z ?? 0)) / 2;
  const actualMidZ = bridgeMid.z ?? 0;
  const deviation = actualMidZ - expectedMidZ;

  // Normalize deviation by bridge length
  const bridgeContour = deviation / (bridgeLength || 1);

  // Tip projection: z-depth of tip relative to bridge plane
  const ipd = interocularDistance(leftEye, rightEye);
  const tipZ = noseTip.z ?? 0;
  const bridgeZ = bridgeMid.z ?? 0;
  const tipProjection = (tipZ - bridgeZ) / ipd;

  return {
    width,
    bridgeContour,
    tipProjection,
  };
}

// ============================================================================
// Mouth/Lips
// ============================================================================

export interface MouthMeasurements {
  lipFullness: number;        // ratio of upper/lower lip height
  cupidsBowDefinition: number; // central curve depth
  lipCornerOrientation: number; // angle (positive = upturned)
  philtrumLength: number;     // normalized vertical distance
  mouthWidth: number;         // normalized horizontal distance
}

/**
 * Extract mouth/lip measurements from landmarks
 */
export function extractMouthMeasurements(
  landmarks: Point[],
  leftEye: Point,
  rightEye: Point
): MouthMeasurements {
  const upperLipTop = landmarks[LANDMARKS.upperLipTop];
  const upperLipBottom = landmarks[LANDMARKS.upperLipBottom];
  const lowerLipTop = landmarks[LANDMARKS.lowerLipTop];
  const lowerLipBottom = landmarks[LANDMARKS.lowerLipBottom];
  const cupidsBowLeft = landmarks[LANDMARKS.cupidsBowLeft];
  const cupidsBowCenter = landmarks[LANDMARKS.cupidsBowCenter];
  const cupidsBowRight = landmarks[LANDMARKS.cupidsBowRight];
  const mouthLeft = landmarks[LANDMARKS.mouthLeft];
  const mouthRight = landmarks[LANDMARKS.mouthRight];
  const noseBridgeLower = landmarks[LANDMARKS.noseBridgeLower];

  const ipd = interocularDistance(leftEye, rightEye);

  // Lip fullness: ratio of upper to lower lip height
  const upperHeight = distance(upperLipTop, upperLipBottom);
  const lowerHeight = distance(lowerLipTop, lowerLipBottom);
  const lipFullness = (upperHeight + lowerHeight) / (2 * ipd);

  // Cupid's bow definition: depth of central curve
  // Measure vertical deviation of center from line between left and right points
  const bowLineY = (cupidsBowLeft.y + cupidsBowRight.y) / 2;
  const bowDepth = Math.abs(cupidsBowCenter.y - bowLineY);
  const cupidsBowDefinition = bowDepth / ipd;

  // Lip corner orientation: angle relative to horizontal
  const leftAngle = angleDegrees(cupidsBowCenter, mouthLeft);
  const rightAngle = angleDegrees(cupidsBowCenter, mouthRight);
  const lipCornerOrientation = (leftAngle - rightAngle) / 2; // positive = upturned

  // Philtrum length: distance from nose to upper lip
  const philtrumLength = distance(noseBridgeLower, upperLipTop) / ipd;

  // Mouth width: corner distance normalized by face width
  const mouthWidthAbs = distance(mouthLeft, mouthRight);
  const fw = faceWidth(landmarks);
  const mouthWidth = mouthWidthAbs / fw;

  return {
    lipFullness,
    cupidsBowDefinition,
    lipCornerOrientation,
    philtrumLength,
    mouthWidth,
  };
}

// ============================================================================
// Jaw/Chin
// ============================================================================

export interface JawMeasurements {
  jawWidth: number;           // normalized gonion distance
  mandibularAngle: number;    // angle at jaw corner (degrees)
  chinProjection: number;     // forward projection (z-depth)
  chinWidth: number;          // normalized horizontal span
  symmetry: number;           // left-right deviation (0-1, 1=perfect)
  source?: 'landmarks' | 'synthetic';
}

function angleBetweenPoints(origin: Point, a: Point, b: Point): number {
  const v1x = a.x - origin.x;
  const v1y = a.y - origin.y;
  const v2x = b.x - origin.x;
  const v2y = b.y - origin.y;
  const norm1 = Math.hypot(v1x, v1y) || 1e-6;
  const norm2 = Math.hypot(v2x, v2y) || 1e-6;
  const dot = (v1x * v2x + v1y * v2y) / (norm1 * norm2);
  const clamped = clamp(dot, -1, 1);
  return Math.acos(clamped) * (180 / Math.PI);
}

function estimateChinWidth(polyline: Point[], chinY: number, fallback: number): number {
  const band = 0.05;
  const near = polyline.filter((pt) => Math.abs(pt.y - chinY) <= band);
  if (near.length >= 2) {
    return distance(near[0], near[near.length - 1]);
  }
  const left = polyline[Math.max(0, Math.floor(polyline.length * 0.35))];
  const right = polyline[Math.min(polyline.length - 1, Math.ceil(polyline.length * 0.65))];
  if (left && right) {
    return distance(left, right);
  }
  return fallback;
}

/**
 * Extract jaw/chin measurements from landmarks
 */
export function extractJawMeasurements(
  landmarks: Point[],
  leftEye: Point,
  rightEye: Point,
  synthetic?: SyntheticJawInput
): JawMeasurements {
  const leftGonion = landmarks[LANDMARKS.leftGonion];
  const rightGonion = landmarks[LANDMARKS.rightGonion];
  const chin = landmarks[LANDMARKS.chinCenter];

  const ipd = interocularDistance(leftEye, rightEye);
  const fw = faceWidth(landmarks);

  // Jaw width: gonion distance normalized by face width
  const jawWidthAbs = distance(leftGonion, rightGonion);
  const jawWidth = jawWidthAbs / fw;

  // Mandibular angle: angle at jaw corner
  // Compute angle between vectors: gonion→chin and gonion→ear
  const leftAngle = Math.abs(
    angleDegrees(leftGonion, chin) - angleDegrees(leftGonion, leftEye)
  );
  const rightAngle = Math.abs(
    angleDegrees(rightGonion, chin) - angleDegrees(rightGonion, rightEye)
  );
  const mandibularAngle = (leftAngle + rightAngle) / 2;

  // Chin projection: z-depth relative to face plane
  const faceZ = ((leftEye.z ?? 0) + (rightEye.z ?? 0)) / 2;
  const chinZ = chin.z ?? 0;
  const chinProjection = (chinZ - faceZ) / ipd;

  // Chin width: horizontal span at chin level (approximate)
  // Use distance between jaw points as proxy
  const chinWidth = jawWidthAbs / fw;

  // Symmetry: left-right landmark deviation
  // Compute midline as average X of left/right eye centers
  const midlineX = (leftEye.x + rightEye.x) / 2;
  const chinDeviation = Math.abs(chin.x - midlineX);
  const maxDeviation = ipd * 0.1; // 10% of IPD is "significant"
  const symmetry = Math.max(0, 1 - chinDeviation / maxDeviation);

  if (
    synthetic &&
    synthetic.polyline.length >= 6 &&
    synthetic.confidence >= SYNTHETIC_JAW_CONFIDENCE_THRESHOLD
  ) {
    const poly = synthetic.polyline;
    const left = poly[0];
    const right = poly[poly.length - 1];
    const faceWidthSynthetic = distance(synthetic.leftGonion, synthetic.rightGonion) || distance(left, right) || 1;
    const syntheticJawWidth = distance(left, right) / faceWidthSynthetic;

    const chinIdx = poly.reduce((best, pt, idx) => (pt.y > poly[best].y ? idx : best), 0);
    const chinPoint = poly[chinIdx];
    const leftAnchor = poly[Math.min(Math.max(1, Math.round(poly.length * 0.15)), poly.length - 1)];
    const rightAnchor = poly[Math.max(Math.min(poly.length - 2, Math.round(poly.length * 0.85)), 0)];

    const leftAngle = angleBetweenPoints(left, leftAnchor, chinPoint);
    const rightAngle = angleBetweenPoints(right, rightAnchor, chinPoint);
    const syntheticMandibularAngle = (leftAngle + rightAngle) / 2;

    const chinWidthAbs = estimateChinWidth(poly, chinPoint.y, distance(left, right) * 0.6);
    const syntheticChinWidth = chinWidthAbs / faceWidthSynthetic;

    const midX = (synthetic.leftGonion.x + synthetic.rightGonion.x) / 2;
    const deviation = Math.abs(chinPoint.x - midX);
    const syntheticSymmetry = Math.max(0, 1 - deviation / 0.08);

    return {
      jawWidth: syntheticJawWidth,
      mandibularAngle: syntheticMandibularAngle,
      chinProjection,
      chinWidth: syntheticChinWidth,
      symmetry: syntheticSymmetry,
      source: 'synthetic',
    };
  }

  return {
    jawWidth,
    mandibularAngle,
    chinProjection,
    chinWidth,
    symmetry,
    source: 'landmarks',
  };
}

// ============================================================================
// Brows
// ============================================================================

export interface BrowMeasurements {
  shape: number;               // arc height ratio (0=straight, 1=highly arched)
  position: number;            // vertical distance from eyes (normalized)
  length: number;              // horizontal span ratio to eye width
  leftShape?: number;          // individual brow shapes (for debugging)
  rightShape?: number;
}

/**
 * Extract eyebrow measurements from landmarks with improved stability
 */
export function extractBrowMeasurements(
  landmarks: Point[],
  leftEye: Point,
  rightEye: Point
): BrowMeasurements {
  const ipd = interocularDistance(leftEye, rightEye);

  // Use all 10 landmarks per brow for robust measurements
  const leftBrowPoints = LEFT_EYEBROW_INDICES.map(idx => landmarks[idx]).filter(Boolean);
  const rightBrowPoints = RIGHT_EYEBROW_INDICES.map(idx => landmarks[idx]).filter(Boolean);

  // Compute average positions for inner/mid/outer regions
  const leftBrowInner = averageLandmarks(landmarks, [70, 63, 105]);
  const leftBrowMid = averageLandmarks(landmarks, [66, 107, 55]);
  const leftBrowOuter = averageLandmarks(landmarks, [65, 52, 53, 46]);
  const rightBrowInner = averageLandmarks(landmarks, [300, 293, 334]);
  const rightBrowMid = averageLandmarks(landmarks, [296, 336, 285]);
  const rightBrowOuter = averageLandmarks(landmarks, [295, 282, 283, 276]);

  const leftEyeTop = landmarks[LANDMARKS.leftEyeTop];
  const rightEyeTop = landmarks[LANDMARKS.rightEyeTop];
  const leftEyeInner = landmarks[LANDMARKS.leftEyeInner];
  const leftEyeOuter = landmarks[LANDMARKS.leftEyeOuter];
  const rightEyeInner = landmarks[LANDMARKS.rightEyeInner];
  const rightEyeOuter = landmarks[LANDMARKS.rightEyeOuter];

  // Shape: arc height of brow (distance from mid-brow to line between inner/outer)
  const leftBrowWidth = distance(leftBrowInner, leftBrowOuter);
  const rightBrowWidth = distance(rightBrowInner, rightBrowOuter);

  // Compute baseline (line between inner and outer brow)
  const leftBaselineY = (leftBrowInner.y + leftBrowOuter.y) / 2;
  const rightBaselineY = (rightBrowInner.y + rightBrowOuter.y) / 2;

  // Arc height: vertical deviation of mid-brow from baseline
  const leftArcHeight = Math.abs(leftBrowMid.y - leftBaselineY);
  const rightArcHeight = Math.abs(rightBrowMid.y - rightBaselineY);

  // Normalize by brow width
  const leftShape = leftArcHeight / (leftBrowWidth || 1);
  const rightShape = rightArcHeight / (rightBrowWidth || 1);

  // Bilateral smoothing: average left and right for symmetry
  const shape = (leftShape + rightShape) / 2;

  // Position: vertical distance from brow to eye top (bilateral smoothed)
  const leftGap = distance(leftBrowMid, leftEyeTop);
  const rightGap = distance(rightBrowMid, rightEyeTop);
  const avgGap = (leftGap + rightGap) / 2;
  const position = avgGap / ipd;

  // Length: horizontal span of brow vs eye width (bilateral smoothed)
  const leftEyeWidth = distance(leftEyeInner, leftEyeOuter);
  const rightEyeWidth = distance(rightEyeInner, rightEyeOuter);
  const avgEyeWidth = (leftEyeWidth + rightEyeWidth) / 2;
  const avgBrowWidth = (leftBrowWidth + rightBrowWidth) / 2;
  const length = avgBrowWidth / (avgEyeWidth || 1);

  return {
    shape,
    position,
    length,
    leftShape,
    rightShape,
  };
}

// ============================================================================
// Cheeks/Midface
// ============================================================================

export interface CheekMeasurements {
  prominence: number;           // z-depth of cheekbones
  nasolabialDepth: number;      // depth of nasolabial folds
  height: number;               // vertical position of cheekbones
}

/**
 * Extract cheek/midface measurements from landmarks
 */
export function extractCheekMeasurements(
  landmarks: Point[],
  leftEye: Point,
  rightEye: Point
): CheekMeasurements {
  const leftCheekbone = landmarks[LANDMARKS.leftCheekbone];
  const rightCheekbone = landmarks[LANDMARKS.rightCheekbone];
  const leftNasolabialFold = landmarks[LANDMARKS.leftNasolabialFold];
  const rightNasolabialFold = landmarks[LANDMARKS.rightNasolabialFold];
  const chin = landmarks[LANDMARKS.chinCenter];

  const ipd = interocularDistance(leftEye, rightEye);

  // Prominence: z-depth of cheekbones relative to face plane
  const faceZ = ((leftEye.z ?? 0) + (rightEye.z ?? 0)) / 2;
  const leftCheekZ = leftCheekbone.z ?? 0;
  const rightCheekZ = rightCheekbone.z ?? 0;
  const avgCheekZ = (leftCheekZ + rightCheekZ) / 2;
  const prominence = (avgCheekZ - faceZ) / ipd;

  // Nasolabial fold depth: z-depth of fold landmarks
  const leftFoldZ = leftNasolabialFold.z ?? 0;
  const rightFoldZ = rightNasolabialFold.z ?? 0;
  const avgFoldZ = (leftFoldZ + rightFoldZ) / 2;
  const nasolabialDepth = (faceZ - avgFoldZ) / ipd;

  // Cheekbone height: vertical position relative to eye-chin distance
  const eyeY = (leftEye.y + rightEye.y) / 2;
  const cheekY = (leftCheekbone.y + rightCheekbone.y) / 2;
  const chinY = chin.y;
  const faceHeight = Math.abs(chinY - eyeY);
  const cheekPos = Math.abs(cheekY - eyeY);
  const height = cheekPos / (faceHeight || 1);

  return {
    prominence,
    nasolabialDepth,
    height,
  };
}

// ============================================================================
// Forehead
// ============================================================================

export interface ForeheadMeasurements {
  height: number;              // vertical distance hairline to brows
  contour: number;             // curvature (z-depth deviation)
}

/**
 * Extract forehead measurements from landmarks
 */
export function extractForeheadMeasurements(
  landmarks: Point[],
  leftEye: Point,
  rightEye: Point
): ForeheadMeasurements {
  const foreheadTop = landmarks[LANDMARKS.foreheadTop];
  const leftBrowMid = landmarks[LANDMARKS.leftBrowMid];
  const rightBrowMid = landmarks[LANDMARKS.rightBrowMid];

  const ipd = interocularDistance(leftEye, rightEye);

  // Height: vertical distance from top of forehead to brow line
  const browY = (leftBrowMid.y + rightBrowMid.y) / 2;
  const foreheadHeight = Math.abs(foreheadTop.y - browY);
  const height = foreheadHeight / ipd;

  // Contour: z-depth of forehead relative to face plane
  const faceZ = ((leftEye.z ?? 0) + (rightEye.z ?? 0)) / 2;
  const foreheadZ = foreheadTop.z ?? 0;
  const contour = (foreheadZ - faceZ) / ipd;

  return {
    height,
    contour,
  };
}

// ============================================================================
// Face Shape (Global Metrics)
// ============================================================================

export interface FaceShapeMeasurements {
  lengthWidthRatio: number;     // face height / jaw width
  facialThirds: number;         // balance of upper/mid/lower face (0-1, 1=perfect)
}

/**
 * Extract global face shape measurements from landmarks
 */
export function extractFaceShapeMeasurements(
  landmarks: Point[],
  leftEye: Point,
  rightEye: Point
): FaceShapeMeasurements {
  const foreheadTop = landmarks[LANDMARKS.foreheadTop];
  const chin = landmarks[LANDMARKS.chinCenter];
  const leftBrowMid = landmarks[LANDMARKS.leftBrowMid];
  const rightBrowMid = landmarks[LANDMARKS.rightBrowMid];
  const noseBridge = landmarks[LANDMARKS.noseBridgeLower];

  const fw = faceWidth(landmarks);

  // Length-width ratio: overall face shape descriptor
  const faceHeight = distance(foreheadTop, chin);
  const lengthWidthRatio = faceHeight / (fw || 1);

  // Facial thirds: balance of forehead, midface, lower face
  const browY = (leftBrowMid.y + rightBrowMid.y) / 2;
  const noseBaseY = noseBridge.y;
  const chinY = chin.y;
  const foreheadTopY = foreheadTop.y;

  const upperThird = Math.abs(browY - foreheadTopY);
  const midThird = Math.abs(noseBaseY - browY);
  const lowerThird = Math.abs(chinY - noseBaseY);

  // Ideal is 1:1:1 ratio
  const total = upperThird + midThird + lowerThird;
  const ideal = total / 3;
  const deviation = (
    Math.abs(upperThird - ideal) +
    Math.abs(midThird - ideal) +
    Math.abs(lowerThird - ideal)
  ) / total;

  const facialThirds = Math.max(0, 1 - deviation);

  return {
    lengthWidthRatio,
    facialThirds,
  };
}

// ============================================================================
// Combined Feature Measurements
// ============================================================================

export interface FeatureMeasurements {
  eyes: EyeMeasurements;
  brows: BrowMeasurements;
  nose: NoseMeasurements;
  mouth: MouthMeasurements;
  cheeks: CheekMeasurements;
  jaw: JawMeasurements;
  forehead: ForeheadMeasurements;
  faceShape: FaceShapeMeasurements;
}

export interface FeatureExtractionOptions {
  syntheticJaw?: SyntheticJawInput;
}

/**
 * Extract all feature measurements from landmarks
 */
export function extractFeatureMeasurements(
  landmarks: Point[],
  leftEye: Point,
  rightEye: Point,
  options?: FeatureExtractionOptions
): FeatureMeasurements {
  return {
    eyes: extractEyeMeasurements(landmarks, leftEye, rightEye),
    brows: extractBrowMeasurements(landmarks, leftEye, rightEye),
    nose: extractNoseMeasurements(landmarks, leftEye, rightEye),
    mouth: extractMouthMeasurements(landmarks, leftEye, rightEye),
    cheeks: extractCheekMeasurements(landmarks, leftEye, rightEye),
    jaw: extractJawMeasurements(landmarks, leftEye, rightEye, options?.syntheticJaw),
    forehead: extractForeheadMeasurements(landmarks, leftEye, rightEye),
    faceShape: extractFaceShapeMeasurements(landmarks, leftEye, rightEye),
  };
}
