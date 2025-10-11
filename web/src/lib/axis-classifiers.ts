/**
 * Axis Classifiers - Convert raw measurements to categorical descriptors
 *
 * Maps numerical feature measurements to human-readable categories
 * using empirically-tuned thresholds based on anthropometric literature.
 */

import type {
  FeatureMeasurements,
  EyeMeasurements,
  BrowMeasurements,
  NoseMeasurements,
  MouthMeasurements,
  CheekMeasurements,
  JawMeasurements,
  ForeheadMeasurements,
  FaceShapeMeasurements,
} from './feature-axes';

export interface AxisClassification {
  axis: string;
  value: string;           // category name (e.g., "positive", "wide", "full")
  confidence: number;      // 0-1 (distance from threshold boundaries)
  rawMeasurement: number;
}

// ============================================================================
// Eye Classifications
// ============================================================================

function classifyCanthalTilt(degrees: number): AxisClassification {
  let value: string;
  let confidence: number;

  if (degrees > 3) {
    value = 'positive';
    confidence = Math.min(1, (degrees - 3) / 5); // saturates at 8°
  } else if (degrees < -3) {
    value = 'negative';
    confidence = Math.min(1, Math.abs(degrees + 3) / 5);
  } else {
    value = 'neutral';
    confidence = 1 - Math.abs(degrees) / 3;
  }

  return {
    axis: 'canthal tilt',
    value,
    confidence,
    rawMeasurement: degrees,
  };
}

function classifyEyeSize(normalized: number): AxisClassification {
  let value: string;
  let confidence: number;

  // Typical range: 0.15-0.25 (eye height / IPD)
  if (normalized > 0.22) {
    value = 'wide';
    confidence = Math.min(1, (normalized - 0.22) / 0.08);
  } else if (normalized < 0.18) {
    value = 'narrow';
    confidence = Math.min(1, (0.18 - normalized) / 0.08);
  } else {
    value = 'average';
    confidence = 1 - Math.abs(normalized - 0.20) / 0.02;
  }

  return {
    axis: 'eye size',
    value,
    confidence,
    rawMeasurement: normalized,
  };
}

function classifyInterocularDistance(ratio: number): AxisClassification {
  let value: string;
  let confidence: number;

  // Typical range: 0.35-0.45 (IPD / face width)
  if (ratio > 0.42) {
    value = 'wide-set';
    confidence = Math.min(1, (ratio - 0.42) / 0.08);
  } else if (ratio < 0.38) {
    value = 'close-set';
    confidence = Math.min(1, (0.38 - ratio) / 0.08);
  } else {
    value = 'balanced';
    confidence = 1 - Math.abs(ratio - 0.40) / 0.02;
  }

  return {
    axis: 'interocular distance',
    value,
    confidence,
    rawMeasurement: ratio,
  };
}

export function classifyEyes(measurements: EyeMeasurements): AxisClassification[] {
  return [
    classifyCanthalTilt(measurements.canthalTilt),
    classifyEyeSize(measurements.eyeSize),
    classifyInterocularDistance(measurements.interocularDistance),
  ];
}

// ============================================================================
// Nose Classifications
// ============================================================================

function classifyNoseWidth(ratio: number): AxisClassification {
  let value: string;
  let confidence: number;

  // Typical range: 0.20-0.35 (alar width / face width)
  if (ratio > 0.30) {
    value = 'broad';
    confidence = Math.min(1, (ratio - 0.30) / 0.10);
  } else if (ratio < 0.25) {
    value = 'narrow';
    confidence = Math.min(1, (0.25 - ratio) / 0.10);
  } else {
    value = 'average';
    confidence = 1 - Math.abs(ratio - 0.275) / 0.025;
  }

  return {
    axis: 'nose width',
    value,
    confidence,
    rawMeasurement: ratio,
  };
}

function classifyBridgeContour(curvature: number): AxisClassification {
  let value: string;
  let confidence: number;

  // Curvature metric: positive=convex, negative=concave, zero=straight
  if (curvature > 0.02) {
    value = 'convex';
    confidence = Math.min(1, (curvature - 0.02) / 0.05);
  } else if (curvature < -0.02) {
    value = 'concave';
    confidence = Math.min(1, Math.abs(curvature + 0.02) / 0.05);
  } else {
    value = 'straight';
    confidence = 1 - Math.abs(curvature) / 0.02;
  }

  return {
    axis: 'bridge contour',
    value,
    confidence,
    rawMeasurement: curvature,
  };
}

function classifyTipProjection(projection: number): AxisClassification {
  let value: string;
  let confidence: number;

  // Negative values indicate forward projection (camera Z-axis)
  if (projection < -0.15) {
    value = 'prominent';
    confidence = Math.min(1, Math.abs(projection + 0.15) / 0.15);
  } else if (projection > -0.05) {
    value = 'retracted';
    confidence = Math.min(1, (projection + 0.05) / 0.15);
  } else {
    value = 'balanced';
    confidence = 1 - Math.abs(projection + 0.10) / 0.05;
  }

  return {
    axis: 'nasal tip projection',
    value,
    confidence,
    rawMeasurement: projection,
  };
}

export function classifyNose(measurements: NoseMeasurements): AxisClassification[] {
  return [
    classifyNoseWidth(measurements.width),
    classifyBridgeContour(measurements.bridgeContour),
    classifyTipProjection(measurements.tipProjection),
  ];
}

// ============================================================================
// Mouth/Lip Classifications
// ============================================================================

function classifyLipFullness(normalized: number): AxisClassification {
  let value: string;
  let confidence: number;

  // Typical range: 0.10-0.20 (lip height / IPD)
  if (normalized > 0.17) {
    value = 'full';
    confidence = Math.min(1, (normalized - 0.17) / 0.08);
  } else if (normalized < 0.13) {
    value = 'thin';
    confidence = Math.min(1, (0.13 - normalized) / 0.08);
  } else {
    value = 'average';
    confidence = 1 - Math.abs(normalized - 0.15) / 0.02;
  }

  return {
    axis: 'lip fullness',
    value,
    confidence,
    rawMeasurement: normalized,
  };
}

function classifyCupidsBow(depth: number): AxisClassification {
  let value: string;
  let confidence: number;

  // Depth normalized by IPD
  if (depth > 0.04) {
    value = 'pronounced';
    confidence = Math.min(1, (depth - 0.04) / 0.04);
  } else if (depth < 0.02) {
    value = 'subtle';
    confidence = Math.min(1, (0.02 - depth) / 0.02);
  } else {
    value = 'defined';
    confidence = 1 - Math.abs(depth - 0.03) / 0.01;
  }

  return {
    axis: "cupid's bow definition",
    value,
    confidence,
    rawMeasurement: depth,
  };
}

function classifyLipCorners(angle: number): AxisClassification {
  let value: string;
  let confidence: number;

  if (angle > 5) {
    value = 'upturned';
    confidence = Math.min(1, (angle - 5) / 10);
  } else if (angle < -5) {
    value = 'downturned';
    confidence = Math.min(1, Math.abs(angle + 5) / 10);
  } else {
    value = 'neutral';
    confidence = 1 - Math.abs(angle) / 5;
  }

  return {
    axis: 'lip corner orientation',
    value,
    confidence,
    rawMeasurement: angle,
  };
}

function classifyPhiltrumLength(normalized: number): AxisClassification {
  let value: string;
  let confidence: number;

  // Philtrum length normalized by IPD
  if (normalized > 0.25) {
    value = 'long';
    confidence = Math.min(1, (normalized - 0.25) / 0.15);
  } else if (normalized < 0.15) {
    value = 'short';
    confidence = Math.min(1, (0.15 - normalized) / 0.10);
  } else {
    value = 'average';
    confidence = 1 - Math.abs(normalized - 0.20) / 0.05;
  }

  return {
    axis: 'philtrum length',
    value,
    confidence,
    rawMeasurement: normalized,
  };
}

function classifyMouthWidth(ratio: number): AxisClassification {
  let value: string;
  let confidence: number;

  // Mouth width / face width
  if (ratio > 0.32) {
    value = 'wide';
    confidence = Math.min(1, (ratio - 0.32) / 0.10);
  } else if (ratio < 0.25) {
    value = 'narrow';
    confidence = Math.min(1, (0.25 - ratio) / 0.10);
  } else {
    value = 'balanced';
    confidence = 1 - Math.abs(ratio - 0.285) / 0.035;
  }

  return {
    axis: 'mouth width',
    value,
    confidence,
    rawMeasurement: ratio,
  };
}

export function classifyMouth(measurements: MouthMeasurements): AxisClassification[] {
  return [
    classifyLipFullness(measurements.lipFullness),
    classifyCupidsBow(measurements.cupidsBowDefinition),
    classifyLipCorners(measurements.lipCornerOrientation),
    classifyPhiltrumLength(measurements.philtrumLength),
    classifyMouthWidth(measurements.mouthWidth),
  ];
}

// ============================================================================
// Jaw/Chin Classifications
// ============================================================================

function classifyJawWidth(ratio: number): AxisClassification {
  let value: string;
  let confidence: number;

  // Jaw width should approximately equal face width (ratio ≈ 1.0)
  if (ratio > 1.05) {
    value = 'wide';
    confidence = Math.min(1, (ratio - 1.05) / 0.15);
  } else if (ratio < 0.95) {
    value = 'narrow';
    confidence = Math.min(1, (0.95 - ratio) / 0.15);
  } else {
    value = 'balanced';
    confidence = 1 - Math.abs(ratio - 1.0) / 0.05;
  }

  return {
    axis: 'jaw width',
    value,
    confidence,
    rawMeasurement: ratio,
  };
}

function classifyMandibularAngle(degrees: number): AxisClassification {
  let value: string;
  let confidence: number;

  // Typical range: 90-130 degrees
  if (degrees > 115) {
    value = 'steep';
    confidence = Math.min(1, (degrees - 115) / 20);
  } else if (degrees < 95) {
    value = 'square';
    confidence = Math.min(1, (95 - degrees) / 20);
  } else {
    value = 'moderate';
    confidence = 1 - Math.abs(degrees - 105) / 10;
  }

  return {
    axis: 'mandibular angle',
    value,
    confidence,
    rawMeasurement: degrees,
  };
}

function classifyChinProjection(projection: number): AxisClassification {
  let value: string;
  let confidence: number;

  // Negative values indicate forward projection
  if (projection < -0.10) {
    value = 'prominent';
    confidence = Math.min(1, Math.abs(projection + 0.10) / 0.15);
  } else if (projection > 0.05) {
    value = 'recessed';
    confidence = Math.min(1, (projection - 0.05) / 0.15);
  } else {
    value = 'neutral';
    confidence = 1 - Math.abs(projection + 0.025) / 0.075;
  }

  return {
    axis: 'chin projection',
    value,
    confidence,
    rawMeasurement: projection,
  };
}

function classifyChinWidth(ratio: number): AxisClassification {
  let value: string;
  let confidence: number;

  // Using jaw width as proxy (same metric in current implementation)
  if (ratio > 1.05) {
    value = 'broad';
    confidence = Math.min(1, (ratio - 1.05) / 0.15);
  } else if (ratio < 0.95) {
    value = 'narrow';
    confidence = Math.min(1, (0.95 - ratio) / 0.15);
  } else {
    value = 'average';
    confidence = 1 - Math.abs(ratio - 1.0) / 0.05;
  }

  return {
    axis: 'chin width',
    value,
    confidence,
    rawMeasurement: ratio,
  };
}

function classifySymmetry(score: number): AxisClassification {
  let value: string;
  let confidence: number;

  // Score: 1.0 = perfect, 0.0 = highly asymmetric
  if (score > 0.90) {
    value = 'centered';
    confidence = score;
  } else if (score > 0.70) {
    value = 'slight deviation';
    confidence = 1 - (0.90 - score) / 0.20;
  } else {
    value = 'noticeable deviation';
    confidence = 1 - score;
  }

  return {
    axis: 'symmetry',
    value,
    confidence,
    rawMeasurement: score,
  };
}

export function classifyJaw(measurements: JawMeasurements): AxisClassification[] {
  return [
    classifyJawWidth(measurements.jawWidth),
    classifyMandibularAngle(measurements.mandibularAngle),
    classifyChinProjection(measurements.chinProjection),
    classifyChinWidth(measurements.chinWidth),
    classifySymmetry(measurements.symmetry),
  ];
}

// ============================================================================
// Brow Classifications
// ============================================================================

function classifyBrowShape(ratio: number): AxisClassification {
  let value: string;
  let confidence: number;

  // Ratio of arc height to brow width
  if (ratio > 0.15) {
    value = 'arched';
    confidence = Math.min(1, (ratio - 0.15) / 0.15);
  } else if (ratio < 0.08) {
    value = 'straight';
    confidence = Math.min(1, (0.08 - ratio) / 0.08);
  } else {
    value = 'moderate';
    confidence = 1 - Math.abs(ratio - 0.115) / 0.035;
  }

  return {
    axis: 'brow shape',
    value,
    confidence,
    rawMeasurement: ratio,
  };
}

function classifyBrowPosition(normalized: number): AxisClassification {
  let value: string;
  let confidence: number;

  // Gap from brow to eye, normalized by IPD
  if (normalized > 0.20) {
    value = 'high-set';
    confidence = Math.min(1, (normalized - 0.20) / 0.15);
  } else if (normalized < 0.12) {
    value = 'low-set';
    confidence = Math.min(1, (0.12 - normalized) / 0.08);
  } else {
    value = 'mid-set';
    confidence = 1 - Math.abs(normalized - 0.16) / 0.04;
  }

  return {
    axis: 'brow position',
    value,
    confidence,
    rawMeasurement: normalized,
  };
}

function classifyBrowLength(ratio: number): AxisClassification {
  let value: string;
  let confidence: number;

  // Brow width vs eye width
  if (ratio > 1.15) {
    value = 'extended';
    confidence = Math.min(1, (ratio - 1.15) / 0.20);
  } else if (ratio < 0.95) {
    value = 'short';
    confidence = Math.min(1, (0.95 - ratio) / 0.15);
  } else {
    value = 'proportional';
    confidence = 1 - Math.abs(ratio - 1.05) / 0.10;
  }

  return {
    axis: 'brow length',
    value,
    confidence,
    rawMeasurement: ratio,
  };
}

export function classifyBrows(measurements: BrowMeasurements): AxisClassification[] {
  return [
    classifyBrowShape(measurements.shape),
    classifyBrowPosition(measurements.position),
    classifyBrowLength(measurements.length),
  ];
}

// ============================================================================
// Cheek/Midface Classifications
// ============================================================================

function classifyCheekProminence(projection: number): AxisClassification {
  let value: string;
  let confidence: number;

  // Z-depth of cheekbones relative to face plane
  if (projection > 0.10) {
    value = 'high';
    confidence = Math.min(1, (projection - 0.10) / 0.15);
  } else if (projection < 0.02) {
    value = 'flat';
    confidence = Math.min(1, (0.02 - projection) / 0.10);
  } else {
    value = 'moderate';
    confidence = 1 - Math.abs(projection - 0.06) / 0.04;
  }

  return {
    axis: 'zygomatic prominence',
    value,
    confidence,
    rawMeasurement: projection,
  };
}

function classifyNasolabialDepth(depth: number): AxisClassification {
  let value: string;
  let confidence: number;

  // Depth of nasolabial folds
  if (depth > 0.08) {
    value = 'deep';
    confidence = Math.min(1, (depth - 0.08) / 0.10);
  } else if (depth < 0.03) {
    value = 'shallow';
    confidence = Math.min(1, (0.03 - depth) / 0.03);
  } else {
    value = 'average';
    confidence = 1 - Math.abs(depth - 0.055) / 0.025;
  }

  return {
    axis: 'nasolabial fold depth',
    value,
    confidence,
    rawMeasurement: depth,
  };
}

function classifyCheekboneHeight(ratio: number): AxisClassification {
  let value: string;
  let confidence: number;

  // Vertical position of cheekbones
  if (ratio > 0.45) {
    value = 'low';
    confidence = Math.min(1, (ratio - 0.45) / 0.20);
  } else if (ratio < 0.30) {
    value = 'high';
    confidence = Math.min(1, (0.30 - ratio) / 0.15);
  } else {
    value = 'mid';
    confidence = 1 - Math.abs(ratio - 0.375) / 0.075;
  }

  return {
    axis: 'cheekbone height',
    value,
    confidence,
    rawMeasurement: ratio,
  };
}

export function classifyCheeks(measurements: CheekMeasurements): AxisClassification[] {
  return [
    classifyCheekProminence(measurements.prominence),
    classifyNasolabialDepth(measurements.nasolabialDepth),
    classifyCheekboneHeight(measurements.height),
  ];
}

// ============================================================================
// Forehead Classifications
// ============================================================================

function classifyForeheadHeight(normalized: number): AxisClassification {
  let value: string;
  let confidence: number;

  // Forehead height normalized by IPD
  if (normalized > 1.20) {
    value = 'tall';
    confidence = Math.min(1, (normalized - 1.20) / 0.50);
  } else if (normalized < 0.80) {
    value = 'short';
    confidence = Math.min(1, (0.80 - normalized) / 0.40);
  } else {
    value = 'medium';
    confidence = 1 - Math.abs(normalized - 1.00) / 0.20;
  }

  return {
    axis: 'forehead height',
    value,
    confidence,
    rawMeasurement: normalized,
  };
}

function classifyForeheadContour(curvature: number): AxisClassification {
  let value: string;
  let confidence: number;

  // Z-depth curvature
  if (curvature > 0.05) {
    value = 'rounded';
    confidence = Math.min(1, (curvature - 0.05) / 0.10);
  } else if (curvature < -0.02) {
    value = 'sloped';
    confidence = Math.min(1, Math.abs(curvature + 0.02) / 0.08);
  } else {
    value = 'flat';
    confidence = 1 - Math.abs(curvature - 0.015) / 0.035;
  }

  return {
    axis: 'forehead contour',
    value,
    confidence,
    rawMeasurement: curvature,
  };
}

export function classifyForehead(measurements: ForeheadMeasurements): AxisClassification[] {
  return [
    classifyForeheadHeight(measurements.height),
    classifyForeheadContour(measurements.contour),
  ];
}

// ============================================================================
// Face Shape Classifications
// ============================================================================

function classifyFaceLengthWidthRatio(ratio: number): AxisClassification {
  let value: string;
  let confidence: number;

  // Face height / jaw width
  if (ratio > 1.6) {
    value = 'oblong';
    confidence = Math.min(1, (ratio - 1.6) / 0.40);
  } else if (ratio > 1.4) {
    value = 'oval';
    confidence = 1 - Math.abs(ratio - 1.5) / 0.10;
  } else if (ratio > 1.2) {
    value = 'square';
    confidence = 1 - Math.abs(ratio - 1.3) / 0.10;
  } else {
    value = 'round';
    confidence = Math.min(1, (1.2 - ratio) / 0.30);
  }

  return {
    axis: 'face shape ratio',
    value,
    confidence,
    rawMeasurement: ratio,
  };
}

function classifyFacialThirdsBalance(score: number): AxisClassification {
  let value: string;
  let confidence: number;

  // Balance score: 1.0 = perfect thirds, 0.0 = very imbalanced
  if (score > 0.85) {
    value = 'balanced';
    confidence = score;
  } else if (score > 0.65) {
    value = 'slightly imbalanced';
    confidence = 1 - (0.85 - score) / 0.20;
  } else {
    value = 'imbalanced';
    confidence = 1 - score;
  }

  return {
    axis: 'facial thirds balance',
    value,
    confidence,
    rawMeasurement: score,
  };
}

export function classifyFaceShape(measurements: FaceShapeMeasurements): AxisClassification[] {
  return [
    classifyFaceLengthWidthRatio(measurements.lengthWidthRatio),
    classifyFacialThirdsBalance(measurements.facialThirds),
  ];
}

// ============================================================================
// Combined Classification
// ============================================================================

export interface FeatureClassifications {
  eyes: AxisClassification[];
  brows: AxisClassification[];
  nose: AxisClassification[];
  mouth: AxisClassification[];
  cheeks: AxisClassification[];
  jaw: AxisClassification[];
  forehead: AxisClassification[];
  faceShape: AxisClassification[];
}

/**
 * Classify all feature measurements into categorical descriptors
 */
export function classifyFeatures(
  measurements: FeatureMeasurements
): FeatureClassifications {
  return {
    eyes: classifyEyes(measurements.eyes),
    brows: classifyBrows(measurements.brows),
    nose: classifyNose(measurements.nose),
    mouth: classifyMouth(measurements.mouth),
    cheeks: classifyCheeks(measurements.cheeks),
    jaw: classifyJaw(measurements.jaw),
    forehead: classifyForehead(measurements.forehead),
    faceShape: classifyFaceShape(measurements.faceShape),
  };
}
