/**
 * Feature Comparisons - Compare two faces across detailed feature axes
 *
 * Compares categorical classifications and raw measurements to determine
 * agreement/disagreement and relative differences between facial features.
 */

import type { FeatureClassifications, AxisClassification } from './axis-classifiers';
import type { FeatureMeasurements, FacialMaturityEstimate, Point } from './feature-axes';
import type { AgeEstimate } from '@/workers/types';
import { estimateFacialMaturity } from './feature-axes';

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
 * Congruence result with age/maturity information
 */
export interface CongruenceResult {
  score: number;
  maturityA?: FacialMaturityEstimate;
  maturityB?: FacialMaturityEstimate;
  ageWarning?: string;
  agePenalty?: number;
}

/**
 * Complete comparison result with all metrics
 */
export interface ComparisonResult {
  comparisons: FeatureComparison[];
  sharedAxes: string[];
  congruenceScore: number;
  agreementSummary: string;
  congruenceResult?: CongruenceResult;
}

/**
 * Compute age-aware congruence using ML-based age estimates (ViT classifier)
 *
 * Uses actual age predictions instead of unreliable landmark-based maturity heuristics.
 * Applies penalty for cross-age comparisons to prevent false positives when comparing
 * faces at different developmental stages.
 */
export function computeMLAgeAwareCongruence(
  comparisons: FeatureComparison[],
  ageEstimateA: AgeEstimate,
  ageEstimateB: AgeEstimate
): CongruenceResult {
  // Base score from hybrid feature comparisons
  const baseScore = morphologicalCongruence(comparisons);

  const ageGap = Math.abs(ageEstimateA.age - ageEstimateB.age);
  const minConfidence = Math.min(ageEstimateA.confidence, ageEstimateB.confidence);

  // Apply penalty for cross-age comparison
  let agePenalty = 0;
  let ageWarning: string | undefined;

  // Only apply penalty if we're confident in both predictions
  if (ageGap >= 5 && minConfidence >= 0.4) {
    // Scale penalty: 5-10 years = 5%, 10-20 = 10-20%, 20-30 = 20-30%, 30+ = 30%
    if (ageGap < 10) {
      agePenalty = 0.05;
    } else if (ageGap < 20) {
      agePenalty = 0.10 + (ageGap - 10) * 0.01; // 10-20%
    } else if (ageGap < 30) {
      agePenalty = 0.20 + (ageGap - 20) * 0.01; // 20-30%
    } else {
      agePenalty = 0.30; // Max 30%
    }

    // Generate warning message
    const stageA = getAgeStageFromAge(ageEstimateA.age);
    const stageB = getAgeStageFromAge(ageEstimateB.age);
    ageWarning = `Cross-age comparison: ${stageA} (~${Math.round(ageEstimateA.age)}) vs ${stageB} (~${Math.round(ageEstimateB.age)}). Similarity may be less meaningful.`;

    if (process.env.NODE_ENV !== 'production') {
      console.info('[feature-comparisons] ML age penalty applied:', {
        baseScore: baseScore.toFixed(3),
        ageGap: ageGap.toFixed(1),
        minConfidence: minConfidence.toFixed(2),
        penalty: (agePenalty * 100).toFixed(1) + '%',
        adjustedScore: (baseScore * (1 - agePenalty)).toFixed(3)
      });
    }
  }

  const adjustedScore = baseScore * (1 - agePenalty);

  return {
    score: adjustedScore,
    ageWarning,
    agePenalty
  };
}

/**
 * Get descriptive age stage from estimated age
 */
function getAgeStageFromAge(age: number): string {
  if (age < 3) return 'Infant';
  if (age < 10) return 'Child';
  if (age < 20) return 'Adolescent';
  if (age < 30) return 'Young Adult';
  if (age < 50) return 'Adult';
  if (age < 70) return 'Middle-Aged Adult';
  return 'Senior';
}

/**
 * Compute age-aware congruence score with maturity estimation (LEGACY - uses landmark heuristics)
 *
 * Applies penalty for cross-age comparisons to prevent false positives
 * when comparing faces at different developmental stages.
 *
 * @deprecated Use computeMLAgeAwareCongruence with ViT age estimates instead
 */
export function computeAgeAwareCongruence(
  comparisons: FeatureComparison[],
  measurementsA: FeatureMeasurements,
  measurementsB: FeatureMeasurements,
  landmarksA: Point[],
  landmarksB: Point[]
): CongruenceResult {
  // Base score from hybrid feature comparisons
  const baseScore = morphologicalCongruence(comparisons);

  // Estimate maturity for both faces
  const maturityA = estimateFacialMaturity(measurementsA, landmarksA);
  const maturityB = estimateFacialMaturity(measurementsB, landmarksB);

  const maturityGap = Math.abs(maturityA.score - maturityB.score);

  // Apply penalty for cross-age comparison
  let agePenalty = 0;
  let ageWarning: string | undefined;

  if (maturityGap > 0.15 && Math.min(maturityA.confidence, maturityB.confidence) > 0.5) {
    // Significant age difference detected with confidence
    // Penalty scales from 10% (gap=0.15) to 30% (gap=0.45+)
    agePenalty = Math.min((maturityGap - 0.15) * 0.67, 0.30);

    const stageA = maturityA.score < 0.3 ? "Child" : maturityA.score < 0.6 ? "Adolescent" : "Adult";
    const stageB = maturityB.score < 0.3 ? "Child" : maturityB.score < 0.6 ? "Adolescent" : "Adult";

    ageWarning = `Cross-age comparison detected: ${stageA} vs ${stageB}. Similarity may be less meaningful.`;
  }

  const adjustedScore = baseScore * (1 - agePenalty);

  return {
    score: adjustedScore,
    maturityA,
    maturityB,
    ageWarning,
    agePenalty
  };
}

/**
 * Perform complete feature comparison with all derived metrics
 *
 * Supports both ML-based age estimation (preferred) and legacy landmark-based maturity.
 * If ageEstimates are provided, uses ML-based scoring. Otherwise falls back to landmark maturity.
 */
export function performComparison(
  measurementsA: FeatureMeasurements,
  measurementsB: FeatureMeasurements,
  classificationsA: FeatureClassifications,
  classificationsB: FeatureClassifications,
  landmarksA?: Point[],
  landmarksB?: Point[],
  ageEstimates?: { ageEstimateA: AgeEstimate; ageEstimateB: AgeEstimate }
): ComparisonResult {
  const comparisons = compareFeatures(classificationsA, classificationsB);
  const sharedAxes = sharedAxisValues(comparisons);
  const agreementSummary = featureAgreementSummary(comparisons);

  // Compute age-aware congruence
  let congruenceResult: CongruenceResult | undefined;
  let congruenceScore: number;

  // Prefer ML-based age estimation if available
  if (ageEstimates) {
    congruenceResult = computeMLAgeAwareCongruence(
      comparisons,
      ageEstimates.ageEstimateA,
      ageEstimates.ageEstimateB
    );
    congruenceScore = congruenceResult.score;
  } else if (landmarksA && landmarksB) {
    // Fallback to legacy landmark-based maturity
    congruenceResult = computeAgeAwareCongruence(comparisons, measurementsA, measurementsB, landmarksA, landmarksB);
    congruenceScore = congruenceResult.score;
  } else {
    // No age adjustment available
    congruenceScore = morphologicalCongruence(comparisons);
  }

  return {
    comparisons,
    sharedAxes,
    congruenceScore,
    agreementSummary,
    congruenceResult,
  };
}
