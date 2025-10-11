/**
 * Feature Axes - Landmark-based facial feature measurements
 *
 * Extracts detailed geometric measurements from MediaPipe FaceMesh landmarks
 * for axis-based feature analysis and comparison.
 */

export interface Point {
  x: number;
  y: number;
  z?: number;
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

// ============================================================================
// Eyes
// ============================================================================

export interface EyeMeasurements {
  canthalTilt: number;           // degrees (positive = upward slant)
  eyeSize: number;               // normalized height
  interocularDistance: number;   // ratio to face width
}

/**
 * Extract eye measurements from landmarks
 */
export function extractEyeMeasurements(
  landmarks: Point[],
  leftEye: Point,
  rightEye: Point
): EyeMeasurements {
  // Canthal tilt: angle between inner and outer eye corners
  const leftInner = landmarks[LANDMARKS.leftEyeInner];
  const leftOuter = landmarks[LANDMARKS.leftEyeOuter];
  const rightInner = landmarks[LANDMARKS.rightEyeInner];
  const rightOuter = landmarks[LANDMARKS.rightEyeOuter];

  const leftTilt = angleDegrees(leftInner, leftOuter);
  const rightTilt = angleDegrees(rightOuter, rightInner); // reversed for symmetry
  const canthalTilt = (leftTilt + rightTilt) / 2;

  // Eye size: vertical aperture height
  const leftTop = landmarks[LANDMARKS.leftEyeTop];
  const leftBottom = landmarks[LANDMARKS.leftEyeBottom];
  const rightTop = landmarks[LANDMARKS.rightEyeTop];
  const rightBottom = landmarks[LANDMARKS.rightEyeBottom];

  const leftHeight = distance(leftTop, leftBottom);
  const rightHeight = distance(rightTop, rightBottom);
  const avgEyeHeight = (leftHeight + rightHeight) / 2;

  // Normalize by interocular distance
  const ipd = interocularDistance(leftEye, rightEye);
  const eyeSize = avgEyeHeight / ipd;

  // Interocular distance: ratio to face width
  const fw = faceWidth(landmarks);
  const ipdRatio = ipd / fw;

  return {
    canthalTilt,
    eyeSize,
    interocularDistance: ipdRatio,
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
}

/**
 * Extract jaw/chin measurements from landmarks
 */
export function extractJawMeasurements(
  landmarks: Point[],
  leftEye: Point,
  rightEye: Point
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

  return {
    jawWidth,
    mandibularAngle,
    chinProjection,
    chinWidth,
    symmetry,
  };
}

// ============================================================================
// Combined Feature Measurements
// ============================================================================

export interface FeatureMeasurements {
  eyes: EyeMeasurements;
  nose: NoseMeasurements;
  mouth: MouthMeasurements;
  jaw: JawMeasurements;
}

/**
 * Extract all feature measurements from landmarks
 */
export function extractFeatureMeasurements(
  landmarks: Point[],
  leftEye: Point,
  rightEye: Point
): FeatureMeasurements {
  return {
    eyes: extractEyeMeasurements(landmarks, leftEye, rightEye),
    nose: extractNoseMeasurements(landmarks, leftEye, rightEye),
    mouth: extractMouthMeasurements(landmarks, leftEye, rightEye),
    jaw: extractJawMeasurements(landmarks, leftEye, rightEye),
  };
}
