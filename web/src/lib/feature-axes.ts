/**
 * Feature Axes - Landmark-based facial feature measurements
 *
 * Extracts detailed geometric measurements from MediaPipe FaceMesh landmarks
 * for axis-based feature analysis and comparison.
 */

import type { Point } from '@/lib/points';
import { REFINED_BROW_CONFIDENCE_THRESHOLD, type RefinedBrow } from '@/lib/brow-seg-refinement';

export const SYNTHETIC_JAW_CONFIDENCE_THRESHOLD = 0.12;

export interface SyntheticJawInput {
  polyline: Point[];
  confidence: number;
  leftGonion: Point;
  rightGonion: Point;
  chin: Point;
}

export interface RefinedBrowsInput {
  left?: RefinedBrow;
  right?: RefinedBrow;
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
 * Compute face width at bizygomatic (cheekbone) level
 *
 * Uses maximum width across multiple face levels to find true bizygomatic width.
 * This is critical for accurate interocular distance ratio calculations.
 *
 * Previously used only gonion (234/454), but on faces with tapered jaws,
 * the cheekbones are wider, causing incorrect IPD ratios.
 */
function faceWidth(landmarks: Point[]): number {
  // Measure width at multiple levels and use the widest
  // This accounts for varying face shapes (oval, square, heart-shaped, etc.)
  const candidates = [
    distance(landmarks[234], landmarks[454]),  // Lateral face / gonion region
    distance(landmarks[132], landmarks[361]),  // Lateral orbital region
    distance(landmarks[116], landmarks[345]),  // Mid-cheek region
  ];

  // Filter out invalid measurements and return the maximum
  const validWidths = candidates.filter(w => w > 0 && isFinite(w));
  return validWidths.length > 0 ? Math.max(...validWidths) : 1;
}

/**
 * Compute jaw width at gonion (jaw angle) level
 * Separate from faceWidth to allow proper jaw tapering measurements
 */
function jawWidth(landmarks: Point[]): number {
  const leftGonion = landmarks[LANDMARKS.leftGonion];
  const rightGonion = landmarks[LANDMARKS.rightGonion];
  return distance(leftGonion, rightGonion);
}

// Extended landmark sets for robust canthal tilt (8 points per corner, no overlap)
// Left eye outline: [33(outer), 7, 163, 144, 145, 153, 154, 155, 133(inner), 173, 157, 158, 159, 160, 161, 246]
// Right eye outline: [362(inner), 382, 381, 380, 374, 373, 390, 249, 263(outer), 466, 388, 387, 386, 385, 384, 398]
const LEFT_EYE_OUTER_CORNER_INDICES = [159, 160, 161, 246, 33, 7, 163, 144];
const LEFT_EYE_INNER_CORNER_INDICES = [145, 153, 154, 155, 133, 173, 157, 158];
const RIGHT_EYE_OUTER_CORNER_INDICES = [374, 373, 390, 249, 263, 466, 388, 387];
const RIGHT_EYE_INNER_CORNER_INDICES = [386, 385, 384, 398, 362, 382, 381, 380];

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
  interocularDistance: number;   // ICD / mean eye width (anthropometric standard)
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
  const dx = leftOuterAvgRot.x - leftInnerAvgRot.x;
  const dy_raw = leftOuterAvgRot.y - leftInnerAvgRot.y;
  const dy = -dy_raw;
  const leftCanthalTilt = Math.atan2(dy, dx) * RAD_TO_DEG;

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

  // Eye width (palpebral fissure): outer to inner canthus
  // Used for both eye size and interocular distance normalization
  const leftInnerCanthus = landmarks[LANDMARKS.leftEyeInner];
  const rightInnerCanthus = landmarks[LANDMARKS.rightEyeInner];
  const leftOuterCanthus = landmarks[LANDMARKS.leftEyeOuter];
  const rightOuterCanthus = landmarks[LANDMARKS.rightEyeOuter];

  const leftEyeWidth = distance(leftOuterCanthus, leftInnerCanthus);
  const rightEyeWidth = distance(rightOuterCanthus, rightInnerCanthus);
  const meanEyeWidth = (leftEyeWidth + rightEyeWidth) / 2;

  // Eye size: vertical aperture height / eye width (anthropometric standard)
  // Normalizes by the same eye's horizontal dimension, not IPD
  // Source: MEASUREMENT_VALIDATION_2025-10-26.md (Critical Fix #1)
  const eyeSize = avgEyeHeight / (meanEyeWidth || 1);

  // Interocular distance: ICD / mean eye width (anthropometric standard)
  // ICD = intercanthal distance (inner canthus to inner canthus)
  const icd = distance(leftInnerCanthus, rightInnerCanthus);
  const icdRatio = icd / (meanEyeWidth || 1);

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
    interocularDistance: icdRatio,
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

  // Tip projection: z-depth of tip relative to bridge, normalized by nasal length
  // Uses nasal length (nasion to pronasale) instead of IPD (anthropometric standard)
  // Simplified alternative to full Goode ratio
  // Source: MEASUREMENT_VALIDATION_2025-10-26.md (Critical Fix #2)
  // TODO: Implement full Goode ratio (tip projection from alar facial junction / nasal length)
  const nasalLength = distance(bridgeTop, noseTip);
  const tipZ = noseTip.z ?? 0;
  const bridgeZ = bridgeMid.z ?? 0;
  console.log('[nose] Raw z-values:', { tipZ, bridgeZ, diff: tipZ - bridgeZ, nasalLength });
  const tipProjection = (tipZ - bridgeZ) / (nasalLength || 1);

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

  // Mouth width (absolute): corner to corner distance
  // Calculated first for use in lip fullness normalization
  const mouthWidthAbs = distance(mouthLeft, mouthRight);

  // Lip fullness: total vermilion height / mouth width (anthropometric standard)
  // Normalizes by mouth width, not IPD - matches visual perception
  // Source: MEASUREMENT_VALIDATION_2025-10-26.md (Critical Fix #3)
  const upperHeight = distance(upperLipTop, upperLipBottom);
  const lowerHeight = distance(lowerLipTop, lowerLipBottom);
  const lipFullness = (upperHeight + lowerHeight) / (mouthWidthAbs || 1);

  // Cupid's bow definition: depth of central curve
  // Measure vertical deviation of center from line between left and right points
  // ANTHROPOMETRIC FIX (2025-10-26): Changed from IPD to philtral width normalization
  // Philtral width = distance between philtral columns (cupid's bow left/right peaks)
  // Source: GPT-5 comprehensive validation consultation
  // TODO: Recalibrate classification thresholds for new scale
  const philtralWidth = distance(cupidsBowLeft, cupidsBowRight);
  const bowLineY = (cupidsBowLeft.y + cupidsBowRight.y) / 2;
  const bowDepth = Math.abs(cupidsBowCenter.y - bowLineY);
  const cupidsBowDefinition = bowDepth / (philtralWidth || 1);  // Changed from ipd to philtralWidth

  // Lip corner orientation: angle relative to horizontal
  const leftAngle = angleDegrees(cupidsBowCenter, mouthLeft);
  const rightAngle = angleDegrees(cupidsBowCenter, mouthRight);
  const lipCornerOrientation = (leftAngle - rightAngle) / 2; // positive = upturned

  // Philtrum length: distance from nose to upper lip
  // ANTHROPOMETRIC FIX (2025-10-26): Changed from IPD to upper facial height normalization
  // Upper facial height = nasion (nose bridge) to subnasale (nose base)
  // Source: GPT-5 comprehensive validation consultation
  // TODO: Recalibrate classification thresholds for new scale
  const noseTip = landmarks[LANDMARKS.noseTip];
  const upperFaceHeight = distance(noseBridgeLower, noseTip);  // Approximation of n-sn
  const philtrumLength = distance(noseBridgeLower, upperLipTop) / (upperFaceHeight || 1);  // Changed from ipd

  // Mouth width: corner distance normalized by face width
  const fw = faceWidth(landmarks);
  const mouthWidth = mouthWidthAbs / fw;
  console.log('[mouth] Mouth width diagnostic:', {
    mouthWidthAbs,
    faceWidth: fw,
    ratio: mouthWidth,
    gonionWidth: distance(landmarks[234], landmarks[454]),
    orbitalWidth: distance(landmarks[132], landmarks[361]),
    midCheekWidth: distance(landmarks[116], landmarks[345])
  });

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

  // Jaw width: gonion distance normalized by bizygomatic (cheekbone) width
  // This measures jaw tapering - ratio < 1.0 indicates tapered/narrow jaw,
  // ratio ≈ 1.0 indicates square jaw, ratio > 1.0 would be unusual
  const jawWidthAbs = jawWidth(landmarks);
  const jawWidthRatio = jawWidthAbs / fw;

  // Mandibular angle: angle at jaw corner
  // Compute angle between vectors: gonion→chin and gonion→ear
  const leftAngle = Math.abs(
    angleDegrees(leftGonion, chin) - angleDegrees(leftGonion, leftEye)
  );
  const rightAngle = Math.abs(
    angleDegrees(rightGonion, chin) - angleDegrees(rightGonion, rightEye)
  );
  const mandibularAngle = (leftAngle + rightAngle) / 2;

  // Chin projection: z-depth relative to face plane, normalized by lower face height
  // Uses vertical face distance instead of IPD (anthropometric standard)
  // Simplified approach - proper method uses nasion vertical + full face height (n-gn)
  // Source: MEASUREMENT_VALIDATION_2025-10-26.md (Critical Fix #4 - simplified)
  // TODO: Implement full nasion vertical approach (HIGH complexity - requires FH plane)
  const faceZ = ((leftEye.z ?? 0) + (rightEye.z ?? 0)) / 2;
  const chinZ = chin.z ?? 0;
  const eyeY = (leftEye.y + rightEye.y) / 2;
  const lowerFaceHeight = Math.abs(chin.y - eyeY);
  console.log('[jaw] Raw z-values:', {
    leftEyeZ: leftEye.z,
    rightEyeZ: rightEye.z,
    faceZ,
    chinZ,
    diff: chinZ - faceZ,
    lowerFaceHeight
  });
  const chinProjection = (chinZ - faceZ) / (lowerFaceHeight || 1);

  // Chin width: horizontal span at chin level (approximate)
  // Use distance between jaw points as proxy
  const chinWidth = jawWidthAbs / fw;

  // Symmetry: left-right landmark deviation
  // Compute midline as average X of left/right eye centers
  // ANTHROPOMETRIC FIX (2025-10-26): Changed from 0.1×IPD to bizygomatic width normalization
  // Source: GPT-5 comprehensive validation consultation
  // TODO: Recalibrate classification thresholds for new scale
  const midlineX = (leftEye.x + rightEye.x) / 2;
  const chinDeviation = Math.abs(chin.x - midlineX);
  const maxDeviation = fw * 0.1;  // Changed from ipd * 0.1 to fw * 0.1 (10% of face width)
  const symmetry = Math.max(0, 1 - chinDeviation / maxDeviation);

  if (
    synthetic &&
    synthetic.polyline.length >= 6 &&
    synthetic.confidence >= SYNTHETIC_JAW_CONFIDENCE_THRESHOLD
  ) {
    const poly = synthetic.polyline;
    const left = poly[0];
    const right = poly[poly.length - 1];
    // Use bizygomatic face width for consistency with landmark-based measurements
    const syntheticJawWidthAbs = distance(left, right);
    const syntheticJawWidth = syntheticJawWidthAbs / fw;

    const chinIdx = poly.reduce((best, pt, idx) => (pt.y > poly[best].y ? idx : best), 0);
    const chinPoint = poly[chinIdx];
    const leftAnchor = poly[Math.min(Math.max(1, Math.round(poly.length * 0.15)), poly.length - 1)];
    const rightAnchor = poly[Math.max(Math.min(poly.length - 2, Math.round(poly.length * 0.85)), 0)];

    const leftAngle = angleBetweenPoints(left, leftAnchor, chinPoint);
    const rightAngle = angleBetweenPoints(right, rightAnchor, chinPoint);
    const syntheticMandibularAngle = (leftAngle + rightAngle) / 2;

    const chinWidthAbs = estimateChinWidth(poly, chinPoint.y, distance(left, right) * 0.6);
    const syntheticChinWidth = chinWidthAbs / fw;

    const midX = (synthetic.leftGonion.x + synthetic.rightGonion.x) / 2;
    const deviation = Math.abs(chinPoint.x - midX);
    const syntheticMaxDeviation = fw * 0.1;  // Consistent with landmark-based calculation
    const syntheticSymmetry = Math.max(0, 1 - deviation / syntheticMaxDeviation);

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
    jawWidth: jawWidthRatio,
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
  shape: number;               // max arc height ratio across brows
  position: number;            // vertical distance from eyes (normalized)
  length: number;              // horizontal span ratio to eye width
  leftShape: number;
  rightShape: number;
}

/**
 * Extract eyebrow measurements from landmarks with improved stability
 */
export function extractBrowMeasurements(
  landmarks: Point[],
  leftEye: Point,
  rightEye: Point,
  refined?: RefinedBrowsInput,
  contours?: Array<{ region: string; points: {x: number; y: number}[] }>
): BrowMeasurements {
  const ipd = interocularDistance(leftEye, rightEye);

  // Prefer segmentation contours over landmarks for arch measurement (follows hair vs bone)
  if (contours && contours.length >= 2) {
    // Extract left and right brow contours (spatially separated by face midline)
    const browContours = contours.filter(c => c.region === 'brows');
    if (process.env.NODE_ENV !== 'production') {
      console.log('[extractBrowMeasurements] received contours:', contours.length, 'brow contours:', browContours.length);
    }
    if (browContours.length >= 1) {
      const midlineX = 0.5; // normalized face midline in eye-relative coords

      const collectSidePoints = (isLeft: boolean): {x: number; y: number}[] => {
        const collected: {x: number; y: number}[] = [];
        for (const contour of browContours) {
          const pts = contour.points;
          if (pts.length === 0) continue;
          let sumX = 0;
          for (const p of pts) sumX += p.x;
          const centroidX = sumX / pts.length;
          const belongsLeft = centroidX <= midlineX;
          if (belongsLeft === isLeft) {
            collected.push(...pts);
          }
        }
        return collected;
      };

      const measureArchFromPoints = (pts: {x: number; y: number}[]): number => {
        if (pts.length < 3) return 0;
        let leftmost = pts[0];
        let rightmost = pts[0];
        for (const p of pts) {
          if (p.x < leftmost.x) leftmost = p;
          if (p.x > rightmost.x) rightmost = p;
        }
        const dx = rightmost.x - leftmost.x;
        const dy = rightmost.y - leftmost.y;
        const chordLength = Math.hypot(dx, dy) || 1;
        if (chordLength < 1e-6) return 0;
        const c = dx * leftmost.y - dy * leftmost.x;
        const slope = dx !== 0 ? dy / dx : 0;
        const baselineY = (x: number) => leftmost.y + slope * (x - leftmost.x);

        let maxSagitta = 0;
        for (const p of pts) {
          const baseY = baselineY(p.x);
          if (p.y < baseY) continue; // only consider underside (larger Y)
          const dist = Math.abs(dy * p.x - dx * p.y + c) / chordLength;
          if (dist > maxSagitta) maxSagitta = dist;
        }
        if (maxSagitta === 0) {
          for (const p of pts) {
            const dist = Math.abs(dy * p.x - dx * p.y + c) / chordLength;
            if (dist > maxSagitta) maxSagitta = dist;
          }
        }
        return maxSagitta;
      };

      const leftCombined = collectSidePoints(true);
      const rightCombined = collectSidePoints(false);

      const selectBestSingleContour = (isLeft: boolean) => {
        let best: {x: number; y: number}[] | undefined;
        let bestWidth = -Infinity;
        for (const contour of browContours) {
          const pts = contour.points;
          if (pts.length < 3) continue;
          let sumX = 0;
          let minX = pts[0].x;
          let maxX = pts[0].x;
          for (const p of pts) {
            sumX += p.x;
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
          }
          const centroidX = sumX / pts.length;
          const width = maxX - minX;
          const belongsLeft = centroidX <= midlineX;
          if (belongsLeft === isLeft && width > bestWidth) {
            best = pts;
            bestWidth = width;
          }
        }
        return best;
      };

      const leftContour = selectBestSingleContour(true);
      const rightContour = selectBestSingleContour(false);

      const leftUnionShape =
        leftCombined.length >= 3 ? measureArchFromPoints(leftCombined) : 0;
      const rightUnionShape =
        rightCombined.length >= 3 ? measureArchFromPoints(rightCombined) : 0;
      const leftSingleShape =
        leftContour && leftContour.length >= 3 ? measureArchFromPoints(leftContour) : 0;
      const rightSingleShape =
        rightContour && rightContour.length >= 3 ? measureArchFromPoints(rightContour) : 0;

      const leftSegShape = Math.max(leftUnionShape, leftSingleShape);
      const rightSegShape = Math.max(rightUnionShape, rightSingleShape);

      if (
        Number.isFinite(leftSegShape) &&
        Number.isFinite(rightSegShape) &&
        (leftSegShape > 1e-4 || rightSegShape > 1e-4)
      ) {
        const leftShape = leftSegShape;
        const rightShape = rightSegShape;
        const shape = Math.max(leftShape, rightShape);

        if (process.env.NODE_ENV !== 'production') {
          console.log('[extractBrowMeasurements] segmentation-based:', {
            leftShape: leftShape.toFixed(3),
            rightShape: rightShape.toFixed(3),
            shape: shape.toFixed(3),
            leftPoints: leftCombined.length,
            rightPoints: rightCombined.length,
            classification: shape <= 0.085 ? 'straight' : shape >= 0.13 ? 'arched' : 'moderate'
          });
        }

        // Still use landmarks for position and length measurements
        const leftBrowPoints = LEFT_EYEBROW_INDICES.map(idx => landmarks[idx]).filter(Boolean);
        const rightBrowPoints = RIGHT_EYEBROW_INDICES.map(idx => landmarks[idx]).filter(Boolean);

        const leftY = leftBrowPoints.reduce((sum, p) => sum + p.y, 0) / leftBrowPoints.length;
        const rightY = rightBrowPoints.reduce((sum, p) => sum + p.y, 0) / rightBrowPoints.length;
        const browY = (leftY + rightY) / 2;
        const eyeY = (leftEye.y + rightEye.y) / 2;
        const position = Math.abs(browY - eyeY) / ipd;

        const leftInner = leftBrowPoints.reduce((min, p) => p.x < min.x ? p : min, leftBrowPoints[0]);
        const leftOuter = leftBrowPoints.reduce((max, p) => p.x > max.x ? p : max, leftBrowPoints[0]);
        const rightInner = rightBrowPoints.reduce((min, p) => p.x > min.x ? p : min, rightBrowPoints[0]);
        const rightOuter = rightBrowPoints.reduce((max, p) => p.x < max.x ? p : max, rightBrowPoints[0]);

        const leftLength = Math.abs(leftOuter.x - leftInner.x);
        const rightLength = Math.abs(rightOuter.x - rightInner.x);
        const avgLength = (leftLength + rightLength) / 2;
        const eyeWidth = Math.abs(rightEye.x - leftEye.x);
        const length = avgLength / eyeWidth;

        return { shape, position, length, leftShape, rightShape };
      }
    }
  }

  // Fall back to landmark-based measurement
  if (process.env.NODE_ENV !== 'production') {
    console.log('[extractBrowMeasurements] using landmark-based measurement (no valid contours)');
  }
  const leftBrowPoints = LEFT_EYEBROW_INDICES.map(idx => landmarks[idx]).filter(Boolean);
  const rightBrowPoints = RIGHT_EYEBROW_INDICES.map(idx => landmarks[idx]).filter(Boolean);

  // === SHAPE: Arc height measurement ===
  // Find endpoints dynamically (innermost/outermost by X coordinate)
  const leftInner = leftBrowPoints.reduce((min, p) => p.x < min.x ? p : min, leftBrowPoints[0]);
  const leftOuter = leftBrowPoints.reduce((max, p) => p.x > max.x ? p : max, leftBrowPoints[0]);
  const rightInner = rightBrowPoints.reduce((min, p) => p.x > min.x ? p : min, rightBrowPoints[0]);
  const rightOuter = rightBrowPoints.reduce((max, p) => p.x < max.x ? p : max, rightBrowPoints[0]);

  // Measure arch on the local brow plane (3D-aware) to handle camera angle
  // This prevents arch flattening from top-down or tilted camera views
  const measureArchOnPlane = (pts: Point[]): { arcHeight: number; chordLength: number } => {
    if (pts.length < 3) return { arcHeight: 0, chordLength: 1 };

    // 1. Fit plane z = ax + by + c using least squares
    const n = pts.length;
    let sumX = 0, sumY = 0, sumZ = 0;
    let sumXX = 0, sumXY = 0, sumXZ = 0;
    let sumYY = 0, sumYZ = 0;

    for (const p of pts) {
      const x = p.x;
      const y = p.y;
      const z = p.z ?? 0;
      sumX += x;
      sumY += y;
      sumZ += z;
      sumXX += x * x;
      sumXY += x * y;
      sumXZ += x * z;
      sumYY += y * y;
      sumYZ += y * z;
    }

    // Solve normal equations: [XX XY X][a]   [XZ]
    //                         [XY YY Y][b] = [YZ]
    //                         [X  Y  n][c]   [Z ]
    const det = sumXX * (sumYY * n - sumY * sumY)
              - sumXY * (sumXY * n - sumX * sumY)
              + sumX * (sumXY * sumY - sumYY * sumX);

    if (Math.abs(det) < 1e-10) {
      // Degenerate case: points are collinear or all same
      // Fall back to 2D measurement in XY plane
      const inner = pts.reduce((min, p) => p.x < min.x ? p : min, pts[0]);
      const outer = pts.reduce((max, p) => p.x > max.x ? p : max, pts[0]);
      const peak = pts.reduce((highest, p) => p.y < highest.y ? p : highest, pts[0]);

      const dx = outer.x - inner.x;
      const dy = outer.y - inner.y;
      const chordLength = Math.hypot(dx, dy) || 1;
      const c = dx * inner.y - dy * inner.x;
      const arcHeight = Math.abs(dy * peak.x - dx * peak.y + c) / chordLength;

      return { arcHeight, chordLength };
    }

    const a = (sumXZ * (sumYY * n - sumY * sumY)
             - sumXY * (sumYZ * n - sumY * sumZ)
             + sumX * (sumYZ * sumY - sumYY * sumZ)) / det;
    const b = (sumXX * (sumYZ * n - sumY * sumZ)
             - sumXZ * (sumXY * n - sumX * sumY)
             + sumX * (sumXY * sumZ - sumXZ * sumY)) / det;
    const c = (sumXX * (sumYY * sumZ - sumY * sumYZ)
             - sumXY * (sumXY * sumZ - sumX * sumYZ)
             + sumXZ * (sumXY * sumY - sumYY * sumX)) / det;

    // 2. Project each 3D point onto the fitted plane
    // Plane: z = ax + by + c
    // Normal: n = (-a, -b, 1) normalized
    let nx = -a, ny = -b, nz = 1;
    const nLen = Math.hypot(nx, ny, nz);
    nx /= nLen; ny /= nLen; nz /= nLen;

    // Project each point: p_proj = p - ((p - p0)·n)n
    // where p0 is any point on plane, e.g. (0, 0, c)
    const projectedPts = pts.map(p => {
      const px = p.x;
      const py = p.y;
      const pz = p.z ?? 0;
      // Distance from point to plane along normal
      const dist = px * nx + py * ny + pz * nz - c * nz;
      // Project onto plane
      return {
        x: px - dist * nx,
        y: py - dist * ny,
        z: pz - dist * nz
      };
    });

    // 3. Create 2D coordinate system on the plane
    // u-axis: direction along brow (roughly horizontal)
    // v-axis: perpendicular to u within plane
    const centX = sumX / n;
    const centY = sumY / n;
    const centZ = sumZ / n;

    // Find two farthest projected points to define u-axis
    let maxDist = 0;
    let p1 = projectedPts[0], p2 = projectedPts[0];
    for (let i = 0; i < projectedPts.length; i++) {
      for (let j = i + 1; j < projectedPts.length; j++) {
        const dx = projectedPts[j].x - projectedPts[i].x;
        const dy = projectedPts[j].y - projectedPts[i].y;
        const dz = projectedPts[j].z - projectedPts[i].z;
        const d = dx * dx + dy * dy + dz * dz;
        if (d > maxDist) {
          maxDist = d;
          p1 = projectedPts[i];
          p2 = projectedPts[j];
        }
      }
    }

    // u-axis along p1->p2
    let ux = p2.x - p1.x;
    let uy = p2.y - p1.y;
    let uz = p2.z - p1.z;
    const uLen = Math.hypot(ux, uy, uz) || 1;
    ux /= uLen; uy /= uLen; uz /= uLen;

    // v-axis = n × u (perpendicular to both normal and u)
    const vx = ny * uz - nz * uy;
    const vy = nz * ux - nx * uz;
    const vz = nx * uy - ny * ux;

    // Project onto (u, v) coordinate system
    const projected = projectedPts.map(p => ({
      u: (p.x - centX) * ux + (p.y - centY) * uy + (p.z - centZ) * uz,
      v: (p.x - centX) * vx + (p.y - centY) * vy + (p.z - centZ) * vz
    }));

    // 4. Find endpoints and peak in 2D plane coordinates
    const inner = projected.reduce((min, p) => p.u < min.u ? p : min, projected[0]);
    const outer = projected.reduce((max, p) => p.u > max.u ? p : max, projected[0]);
    const peak = projected.reduce((highest, p) => Math.abs(p.v) > Math.abs(highest.v) ? p : highest, projected[0]);

    // 4. Measure arch height (perpendicular distance from peak to chord)
    const du = outer.u - inner.u;
    const dv = outer.v - inner.v;
    const chordLength = Math.hypot(du, dv) || 1;

    // Point-to-line distance: |dv*(pu - iu) - du*(pv - iv)| / chordLength
    const arcHeight = Math.abs(dv * (peak.u - inner.u) - du * (peak.v - inner.v)) / chordLength;

    return { arcHeight, chordLength };
  };

  const leftResult = measureArchOnPlane(leftBrowPoints);
  const rightResult = measureArchOnPlane(rightBrowPoints);

  const leftArcHeight = leftResult.arcHeight;
  const rightArcHeight = rightResult.arcHeight;

  // Normalize by chord length from plane measurement (consistent with arch height)
  const fallbackLeftShape = leftArcHeight / (leftResult.chordLength || 1);
  const fallbackRightShape = rightArcHeight / (rightResult.chordLength || 1);
  const refinedLeft = refined?.left;
  const refinedRight = refined?.right;
  const useRefinedLeft = refinedLeft && refinedLeft.confidence >= REFINED_BROW_CONFIDENCE_THRESHOLD;
  const useRefinedRight = refinedRight && refinedRight.confidence >= REFINED_BROW_CONFIDENCE_THRESHOLD;
  const fallbackAverage = (fallbackLeftShape + fallbackRightShape) / 2;
  const overrideThreshold = fallbackAverage < 0.05 ? fallbackAverage * 0.55 : 0;
  const leftShapeOverride = fallbackLeftShape < overrideThreshold && useRefinedLeft ? refinedLeft.archHeightNorm : undefined;
  const rightShapeOverride = fallbackRightShape < overrideThreshold && useRefinedRight ? refinedRight.archHeightNorm : undefined;
  const leftShape = leftShapeOverride ?? (useRefinedLeft ? Math.max(fallbackLeftShape, refinedLeft!.archHeightNorm) : fallbackLeftShape);
  const rightShape = rightShapeOverride ?? (useRefinedRight ? Math.max(fallbackRightShape, refinedRight!.archHeightNorm) : fallbackRightShape);
  const shape = Math.max(leftShape, rightShape);

  // === Calculate eye widths (needed for position and length) ===
  const leftEyeInner = landmarks[LANDMARKS.leftEyeInner];
  const leftEyeOuter = landmarks[LANDMARKS.leftEyeOuter];
  const rightEyeInner = landmarks[LANDMARKS.rightEyeInner];
  const rightEyeOuter = landmarks[LANDMARKS.rightEyeOuter];
  const leftEyeWidth = distance(leftEyeInner, leftEyeOuter);
  const rightEyeWidth = distance(rightEyeInner, rightEyeOuter);
  const avgEyeWidth = (leftEyeWidth + rightEyeWidth) / 2;

  // === POSITION: Vertical distance from brow to eye ===
  // Use centroids for position measurement (stable reference point)
  // ANTHROPOMETRIC FIX (2025-10-26): Changed from IPD to eye width normalization
  // Source: GPT-5 comprehensive validation consultation
  // TODO: Recalibrate classification thresholds for new scale
  const leftBrowCenter = averageLandmarks(landmarks, LEFT_EYEBROW_INDICES);
  const rightBrowCenter = averageLandmarks(landmarks, RIGHT_EYEBROW_INDICES);
  const leftEyeTop = landmarks[LANDMARKS.leftEyeTop];
  const rightEyeTop = landmarks[LANDMARKS.rightEyeTop];

  const leftGap = distance(leftBrowCenter, leftEyeTop);
  const rightGap = distance(rightBrowCenter, rightEyeTop);
  const avgGap = (leftGap + rightGap) / 2;
  const position = avgGap / (avgEyeWidth || 1);  // Changed from ipd to avgEyeWidth

  // === LENGTH: Horizontal span of brow vs eye width ===
  // Use chord length from plane measurement for consistency
  const avgBrowWidth = (leftResult.chordLength + rightResult.chordLength) / 2;
  const fallbackLength = avgBrowWidth / (avgEyeWidth || 1);
  const refinedLengths: number[] = [];
  if (useRefinedLeft) refinedLengths.push((refinedLeft!.browLenNorm * (ipd || 1e-6)) / (avgEyeWidth || 1e-6));
  if (useRefinedRight) refinedLengths.push((refinedRight!.browLenNorm * (ipd || 1e-6)) / (avgEyeWidth || 1e-6));
  const length = refinedLengths.length
    ? refinedLengths.reduce((sum, val) => sum + val, 0) / refinedLengths.length
    : fallbackLength;

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
  const noseBridge = landmarks[LANDMARKS.noseBridge];

  const ipd = interocularDistance(leftEye, rightEye);

  // Calculate total facial height (nasion to gnathion) for z-depth normalization
  // n-gn approximation: nose bridge top to chin
  const totalFaceHeight = distance(noseBridge, chin);

  // Prominence: z-depth of cheekbones relative to face plane
  // ANTHROPOMETRIC FIX (2025-10-26): Changed from IPD to total facial height (n-gn) normalization
  // Z-depth measurements should normalize by vertical facial dimensions, not IPD
  // Source: GPT-5 comprehensive validation consultation
  // TODO: Recalibrate classification thresholds for new scale
  const faceZ = ((leftEye.z ?? 0) + (rightEye.z ?? 0)) / 2;
  const leftCheekZ = leftCheekbone.z ?? 0;
  const rightCheekZ = rightCheekbone.z ?? 0;
  const avgCheekZ = (leftCheekZ + rightCheekZ) / 2;
  const prominence = (avgCheekZ - faceZ) / (totalFaceHeight || 1);  // Changed from ipd to totalFaceHeight

  // Nasolabial fold depth: z-depth of fold landmarks
  // ANTHROPOMETRIC FIX (2025-10-26): Changed from IPD to mouth width (ch-ch) normalization
  // Nasolabial fold depth should normalize by mouth width (cheilion to cheilion), not IPD
  // Source: GPT-5 comprehensive validation consultation
  // TODO: Recalibrate classification thresholds for new scale
  const mouthLeft = landmarks[LANDMARKS.mouthLeft];
  const mouthRight = landmarks[LANDMARKS.mouthRight];
  const mouthWidth = distance(mouthLeft, mouthRight);
  const leftFoldZ = leftNasolabialFold.z ?? 0;
  const rightFoldZ = rightNasolabialFold.z ?? 0;
  const avgFoldZ = (leftFoldZ + rightFoldZ) / 2;
  const nasolabialDepth = (faceZ - avgFoldZ) / (mouthWidth || 1);  // Changed from ipd to mouthWidth

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
  const noseBridge = landmarks[LANDMARKS.noseBridge];
  const chin = landmarks[LANDMARKS.chinCenter];

  const ipd = interocularDistance(leftEye, rightEye);

  // Calculate total facial height (nasion to gnathion) for vertical normalization
  // n-gn approximation: nose bridge top to chin
  const totalFaceHeight = distance(noseBridge, chin);

  // Height: vertical distance from top of forehead to brow line
  // ANTHROPOMETRIC FIX (2025-10-26): Changed from IPD to total facial height (n-gn) normalization
  // Forehead height should normalize by total vertical face dimensions, not IPD
  // Source: GPT-5 comprehensive validation consultation
  // TODO: Recalibrate classification thresholds for new scale
  const browY = (leftBrowMid.y + rightBrowMid.y) / 2;
  const foreheadHeight = Math.abs(foreheadTop.y - browY);
  const height = foreheadHeight / (totalFaceHeight || 1);  // Changed from ipd to totalFaceHeight

  // Contour: z-depth of forehead relative to face plane
  // ANTHROPOMETRIC FIX (2025-10-26): Changed from IPD to forehead length normalization
  // Z-depth contour should normalize by vertical forehead length, not IPD
  // Source: GPT-5 comprehensive validation consultation
  // TODO: Recalibrate classification thresholds for new scale
  const faceZ = ((leftEye.z ?? 0) + (rightEye.z ?? 0)) / 2;
  const foreheadZ = foreheadTop.z ?? 0;
  const foreheadLength = foreheadHeight;  // Vertical extent of forehead
  const contour = (foreheadZ - faceZ) / (foreheadLength || 1);  // Changed from ipd to foreheadLength

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
  refinedBrows?: RefinedBrowsInput;
  browContours?: Array<{ region: string; points: {x: number; y: number}[] }>;
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
    brows: extractBrowMeasurements(landmarks, leftEye, rightEye, options?.refinedBrows, options?.browContours),
    nose: extractNoseMeasurements(landmarks, leftEye, rightEye),
    mouth: extractMouthMeasurements(landmarks, leftEye, rightEye),
    cheeks: extractCheekMeasurements(landmarks, leftEye, rightEye),
    jaw: extractJawMeasurements(landmarks, leftEye, rightEye, options?.syntheticJaw),
    forehead: extractForeheadMeasurements(landmarks, leftEye, rightEye),
    faceShape: extractFaceShapeMeasurements(landmarks, leftEye, rightEye),
  };
}
