/**
 * Feature Comparisons - Compare two faces across detailed feature axes
 *
 * Compares categorical classifications and raw measurements to determine
 * agreement/disagreement and relative differences between facial features.
 */

import type { FeatureClassifications, AxisClassification } from './axis-classifiers';
import type { FeatureMeasurements } from './feature-axes';

export interface AxisComparison {
  axis: string;
  valueA: string;           // category for subject A
  valueB: string;           // category for subject B
  agreement: boolean;       // true if both have same category
  similarity: number;       // 0-1 similarity based on raw measurements
  percentDiff?: number;     // percentage difference in raw measurements
  direction?: 'higher' | 'lower'; // A relative to B (for numeric comparisons)
}

export interface FeatureComparison {
  feature: string;          // "eyes", "brows", "nose", "mouth", "cheeks", "jaw", "forehead", "face shape"
  axes: AxisComparison[];
  overallAgreement: number; // 0-1 (proportion of axes that match)
}

export interface FeatureComparisonOptions {
  disableAxisTolerance?: boolean;
}

/**
 * Per-axis noise tolerance configuration
 *
 * Maps axis names to either:
 * - Relative threshold (0-1): normalized difference threshold for ratio-based comparison
 * - Absolute threshold (object): fixed value for axes where zero is meaningful
 *
 * Tolerances calibrated from measurement-variance.test.ts analysis:
 * - Tested with 0.5% MediaPipe landmark noise (realistic WebGL variance)
 * - Threshold set to 3x observed variance for robust noise suppression
 */
export type ToleranceConfig = number | { absolute: number };

export const AXIS_NOISE_TOLERANCE: Record<string, ToleranceConfig> = {
  // Eyes (calibrated from measurement-variance.test.ts)
  'canthal tilt': { absolute: 6.0 },  // Absolute threshold in degrees (~3x observed variance)
  'eye size': 0.24,                   // 0.5% coordinate jitter -> ~0.08 normalized diff (x3 safety)
  'interocular distance': 0.09,       // 0.5% coordinate jitter -> ~0.03 normalized diff (x3 safety)

  // Brows (estimated - needs calibration)
  'brow shape': 0.20,             // Arc height sensitive to landmark position
  'brow position': 0.12,          // Vertical distance with moderate jitter
  'brow length': 0.10,            // Horizontal span, moderately stable

  // Nose (estimated - needs calibration)
  'nose width': 0.08,
  'bridge contour': 0.15,
  'nasal tip projection': 0.10,

  // Mouth (estimated - needs calibration)
  'lip fullness': 0.10,
  'cupid\'s bow definition': 0.20,        // Small curvature, sensitive to noise
  'lip corner orientation': { absolute: 5.0 }, // Angle in degrees, neutral ~0°
  'philtrum length': 0.08,
  'mouth width': 0.08,

  // Jaw (estimated - needs calibration)
  'jaw width': 0.08,
  'mandibular angle': { absolute: 10.0 },  // Angle in degrees, typical 120°
  'chin projection': 0.10,
  'chin width': 0.10,
  'symmetry': 0.15,                // Jaw symmetry

  // Cheeks (estimated - needs calibration)
  'zygomatic prominence': 0.12,
  'nasolabial fold depth': 0.15,
  'cheekbone height': 0.10,

  // Forehead (estimated - needs calibration)
  'forehead height': 0.10,
  'forehead contour': 0.15,

  // Face shape (estimated - needs calibration)
  'face shape ratio': 0.08,
  'facial thirds balance': 0.12,
};

/**
 * Get noise tolerance configuration for a specific measurement axis
 *
 * Returns calibrated threshold from AXIS_NOISE_TOLERANCE map,
 * or conservative default for unmapped axes.
 */
function getAxisNoiseToleranceConfig(axisName: string): ToleranceConfig {
  const tolerance = AXIS_NOISE_TOLERANCE[axisName];

  if (tolerance !== undefined) {
    return tolerance;
  }

  // Conservative default for uncalibrated axes
  // TODO: Log warning in dev mode for missing calibrations
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[feature-comparisons] No calibrated tolerance for axis "${axisName}", using default 0.15`);
  }

  return 0.15;
}

/**
 * Compare two axis classifications
 */
function compareAxis(
  axisA: AxisClassification,
  axisB: AxisClassification,
  options?: FeatureComparisonOptions
): AxisComparison {
  const agreement = axisA.value === axisB.value;

  // Compute similarity based on raw measurements
  // For measurements close in value, similarity is high even if categories differ
  const rawA = axisA.rawMeasurement;
  const rawB = axisB.rawMeasurement;
  const diff = Math.abs(rawA - rawB);
  const direction = rawA > rawB ? 'higher' : 'lower';
  const avgMagnitude = (Math.abs(rawA) + Math.abs(rawB)) / 2 || 1;
  const percentDiffRelative = avgMagnitude !== 0 ? (diff / avgMagnitude) * 100 : 0;

  if (options?.disableAxisTolerance) {
    const normalizedDiff = diff / avgMagnitude;
    const similarity = Math.max(0, 1 - normalizedDiff);
    return {
      axis: axisA.axis,
      valueA: axisA.value,
      valueB: axisB.value,
      agreement,
      similarity,
      percentDiff: percentDiffRelative,
      direction,
    };
  }

  // Get tolerance configuration (absolute or relative)
  const toleranceConfig = getAxisNoiseToleranceConfig(axisA.axis);
  const isAbsolute = typeof toleranceConfig === 'object' && 'absolute' in toleranceConfig;

  if (isAbsolute) {
    const threshold = toleranceConfig.absolute;

    if (diff < threshold) {
      return {
        axis: axisA.axis,
        valueA: axisA.value,
        valueB: axisB.value,
        agreement,
        similarity: 1.0,
        percentDiff: (diff / threshold) * 100,
        direction,
      };
    }

    const similarity = Math.max(0, 1 - (diff - threshold) / threshold);
    return {
      axis: axisA.axis,
      valueA: axisA.value,
      valueB: axisB.value,
      agreement,
      similarity,
      percentDiff: (diff / threshold) * 100,
      direction,
    };
  }

  const noiseTolerance = toleranceConfig;
  const normalizedDiff = diff / avgMagnitude;

  if (normalizedDiff < noiseTolerance) {
    return {
      axis: axisA.axis,
      valueA: axisA.value,
      valueB: axisB.value,
      agreement,
      similarity: 1.0,
      percentDiff: percentDiffRelative,
      direction,
    };
  }

  const similarity = Math.max(0, 1 - (normalizedDiff - noiseTolerance) / (1 - noiseTolerance));

  return {
    axis: axisA.axis,
    valueA: axisA.value,
    valueB: axisB.value,
    agreement,
    similarity,
    percentDiff: percentDiffRelative,
    direction,
  };
}

/**
 * Compute hybrid score for an axis: blend categorical agreement with continuous similarity
 *
 * This prevents false 100% scores when two measurements fall in the same category
 * but have significantly different raw values (e.g., both "average" but 0.38 vs 0.45).
 *
 * Formula: 40% categorical (same/different bin) + 60% continuous (actual measurement distance)
 */
function computeHybridAxisScore(axis: AxisComparison): number {
  const categoricalScore = axis.agreement ? 1.0 : 0.0;
  const continuousScore = axis.similarity; // Already computed from raw measurements

  // Weighted blend: categorical provides base similarity, continuous adds precision
  return categoricalScore * 0.4 + continuousScore * 0.6;
}

/**
 * Compare a feature category (e.g., all eye axes)
 */
function compareFeature(
  featureName: string,
  axesA: AxisClassification[],
  axesB: AxisClassification[],
  options?: FeatureComparisonOptions
): FeatureComparison {
  const axes: AxisComparison[] = [];

  // Match axes by name
  for (const axisA of axesA) {
    const axisB = axesB.find(b => b.axis === axisA.axis);
    if (axisB) {
      axes.push(compareAxis(axisA, axisB, options));
    }
  }

  // Compute overall agreement using hybrid scoring
  // This combines categorical agreement (same bin) with continuous similarity (actual distance)
  let totalScore = 0;
  for (const axis of axes) {
    totalScore += computeHybridAxisScore(axis);
  }
  const overallAgreement = axes.length > 0 ? totalScore / axes.length : 0;

  return {
    feature: featureName,
    axes,
    overallAgreement,
  };
}

/**
 * Compare all features between two faces
 */
export function compareFeatures(
  classificationsA: FeatureClassifications,
  classificationsB: FeatureClassifications,
  options?: FeatureComparisonOptions
): FeatureComparison[] {
  return [
    compareFeature('eyes', classificationsA.eyes, classificationsB.eyes, options),
    compareFeature('brows', classificationsA.brows, classificationsB.brows, options),
    compareFeature('nose', classificationsA.nose, classificationsB.nose, options),
    compareFeature('mouth', classificationsA.mouth, classificationsB.mouth, options),
    compareFeature('cheeks', classificationsA.cheeks, classificationsB.cheeks, options),
    compareFeature('jaw', classificationsA.jaw, classificationsB.jaw, options),
    compareFeature('forehead', classificationsA.forehead, classificationsB.forehead, options),
    compareFeature('face shape', classificationsA.faceShape, classificationsB.faceShape, options),
  ];
}

/**
 * Compute dimensional comparison between two measurements
 * Returns a human-readable description like "Subject A's face is 8% longer"
 */
export function dimensionalComparison(
  measurementA: number,
  measurementB: number,
  axisName: string,
  subjectAName = 'Subject A',
  subjectBName = 'Subject B'
): string {
  const diff = measurementA - measurementB;
  const avgMagnitude = (Math.abs(measurementA) + Math.abs(measurementB)) / 2 || 1;
  const percentDiff = Math.abs((diff / avgMagnitude) * 100);

  if (percentDiff < 3) {
    return `${subjectAName} and ${subjectBName} have very similar ${axisName}`;
  }

  const subject = diff > 0 ? subjectAName : subjectBName;
  const comparator = diff > 0 ? 'larger' : 'smaller';

  return `${subject}'s ${axisName} is ${percentDiff.toFixed(1)}% ${comparator}`;
}

/**
 * Compute overall morphological congruence score
 * Returns 0-1 score based on all axis similarities
 */
export function morphologicalCongruence(
  comparisons: FeatureComparison[]
): number {
  let totalSimilarity = 0;
  let totalAxes = 0;

  for (const feature of comparisons) {
    for (const axis of feature.axes) {
      totalSimilarity += axis.similarity;
      totalAxes += 1;
    }
  }

  return totalAxes > 0 ? totalSimilarity / totalAxes : 0;
}

/**
 * Get shared axis values (e.g., "Both share positive canthal tilt")
 */
export function sharedAxisValues(comparisons: FeatureComparison[]): string[] {
  const shared: string[] = [];

  for (const feature of comparisons) {
    for (const axis of feature.axes) {
      if (axis.agreement) {
        shared.push(`Both share ${axis.valueA} ${axis.axis}`);
      }
    }
  }

  return shared;
}

/**
 * Get feature-specific agreement summary
 * Returns strings like "Eyes and nose are similar; jaw differs"
 */
export function featureAgreementSummary(
  comparisons: FeatureComparison[]
): string {
  const similar: string[] = [];
  const different: string[] = [];

  for (const feature of comparisons) {
    if (feature.overallAgreement >= 0.67) {
      similar.push(feature.feature);
    } else if (feature.overallAgreement <= 0.33) {
      different.push(feature.feature);
    }
  }

  const parts: string[] = [];
  if (similar.length > 0) {
    parts.push(`${similar.join(' and ')} ${similar.length === 1 ? 'is' : 'are'} similar`);
  }
  if (different.length > 0) {
    parts.push(`${different.join(' and ')} ${different.length === 1 ? 'differs' : 'differ'}`);
  }

  return parts.join('; ') || 'Mixed similarity across features';
}

/**
 * Complete comparison result with all metrics.
 * Age-aware adjustments have been removed; congruence relies purely on morphology.
 */
export interface ComparisonResult {
  comparisons: FeatureComparison[];
  sharedAxes: string[];
  congruenceScore: number;
  agreementSummary: string;
}

/**
 * Perform complete feature comparison using morphological data only.
 */
export function performComparison(
  measurementsA: FeatureMeasurements,
  measurementsB: FeatureMeasurements,
  classificationsA: FeatureClassifications,
  classificationsB: FeatureClassifications,
  options?: FeatureComparisonOptions
): ComparisonResult {
  void measurementsA;
  void measurementsB;

  const comparisons = compareFeatures(classificationsA, classificationsB, options);
  const sharedAxes = sharedAxisValues(comparisons);
  const agreementSummary = featureAgreementSummary(comparisons);
  const congruenceScore = morphologicalCongruence(comparisons);

  return {
    comparisons,
    sharedAxes,
    congruenceScore,
    agreementSummary,
  };
}
