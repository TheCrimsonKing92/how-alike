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

/**
 * Compare two axis classifications
 */
function compareAxis(
  axisA: AxisClassification,
  axisB: AxisClassification
): AxisComparison {
  const agreement = axisA.value === axisB.value;

  // Compute similarity based on raw measurements
  // For measurements close in value, similarity is high even if categories differ
  const rawA = axisA.rawMeasurement;
  const rawB = axisB.rawMeasurement;
  const avgMagnitude = (Math.abs(rawA) + Math.abs(rawB)) / 2 || 1;
  const diff = Math.abs(rawA - rawB);
  const normalizedDiff = diff / avgMagnitude;
  const similarity = Math.max(0, 1 - normalizedDiff);

  // Compute percentage difference
  const percentDiff = avgMagnitude !== 0 ? (diff / avgMagnitude) * 100 : 0;

  // Determine direction
  const direction = rawA > rawB ? 'higher' : 'lower';

  return {
    axis: axisA.axis,
    valueA: axisA.value,
    valueB: axisB.value,
    agreement,
    similarity,
    percentDiff,
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
  axesB: AxisClassification[]
): FeatureComparison {
  const axes: AxisComparison[] = [];

  // Match axes by name
  for (const axisA of axesA) {
    const axisB = axesB.find(b => b.axis === axisA.axis);
    if (axisB) {
      axes.push(compareAxis(axisA, axisB));
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
  classificationsB: FeatureClassifications
): FeatureComparison[] {
  return [
    compareFeature('eyes', classificationsA.eyes, classificationsB.eyes),
    compareFeature('brows', classificationsA.brows, classificationsB.brows),
    compareFeature('nose', classificationsA.nose, classificationsB.nose),
    compareFeature('mouth', classificationsA.mouth, classificationsB.mouth),
    compareFeature('cheeks', classificationsA.cheeks, classificationsB.cheeks),
    compareFeature('jaw', classificationsA.jaw, classificationsB.jaw),
    compareFeature('forehead', classificationsA.forehead, classificationsB.forehead),
    compareFeature('face shape', classificationsA.faceShape, classificationsB.faceShape),
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
 * Complete comparison result with all metrics
 */
export interface ComparisonResult {
  comparisons: FeatureComparison[];
  sharedAxes: string[];
  congruenceScore: number;
  agreementSummary: string;
}

/**
 * Perform complete feature comparison with all derived metrics
 */
export function performComparison(
  measurementsA: FeatureMeasurements,
  measurementsB: FeatureMeasurements,
  classificationsA: FeatureClassifications,
  classificationsB: FeatureClassifications
): ComparisonResult {
  const comparisons = compareFeatures(classificationsA, classificationsB);
  const sharedAxes = sharedAxisValues(comparisons);
  const congruenceScore = morphologicalCongruence(comparisons);
  const agreementSummary = featureAgreementSummary(comparisons);

  return {
    comparisons,
    sharedAxes,
    congruenceScore,
    agreementSummary,
  };
}
