/**
 * Feature Narratives - Generate human-readable descriptions of feature comparisons
 *
 * Converts axis comparisons into natural language explanations of similarities
 * and differences between two faces.
 */

import type { AxisComparison, FeatureComparison } from './feature-comparisons';

/**
 * Generate narrative text for a single axis comparison
 */
export function narrativeForAxis(comparison: AxisComparison): string {
  const { axis, valueA, valueB, agreement, percentDiff } = comparison;

  if (agreement) {
    // Same category - emphasize similarity
    return `Both have ${valueA} ${axis}`;
  }

  // Different categories - describe the difference
  const diff = percentDiff ?? 0;
  if (diff < 5) {
    // Very small difference - soft disagreement
    return `${axis}: ${valueA} vs ${valueB} (subtle difference)`;
  } else if (diff < 15) {
    // Moderate difference
    return `${axis}: ${valueA} vs ${valueB}`;
  } else {
    // Large difference - emphasize contrast
    return `${axis} differs: ${valueA} vs ${valueB}`;
  }
}

/**
 * Generate summary text for a feature comparison
 */
export function narrativeForFeature(comparison: FeatureComparison): string {
  const { feature, axes, overallAgreement } = comparison;

  // High agreement - emphasize similarity
  if (overallAgreement >= 0.8) {
    const agreements = axes.filter(a => a.agreement);
    const shared = agreements.map(a => a.valueA).join(', ');
    return `${capitalize(feature)} are highly similar (${shared})`;
  }

  // Low agreement - emphasize differences
  if (overallAgreement <= 0.3) {
    const disagreements = axes.filter(a => !a.agreement);
    const diffs = disagreements.slice(0, 2).map(a => `${a.axis}: ${a.valueA} vs ${a.valueB}`).join('; ');
    return `${capitalize(feature)} differ (${diffs})`;
  }

  // Mixed agreement - list specific axes
  const agreements = axes.filter(a => a.agreement);
  const disagreements = axes.filter(a => !a.agreement);

  if (agreements.length > 0 && disagreements.length > 0) {
    const agreed = agreements[0].axis;
    const differed = disagreements[0].axis;
    return `${capitalize(feature)} partially match (similar ${agreed}, different ${differed})`;
  }

  return `${capitalize(feature)} show mixed similarity`;
}

/**
 * Generate detailed axis-by-axis narratives for a feature
 */
export function detailedNarrativeForFeature(comparison: FeatureComparison): string[] {
  return comparison.axes.map(axis => narrativeForAxis(axis));
}

/**
 * Generate overall comparison narrative
 */
export function overallNarrative(
  comparisons: FeatureComparison[],
  congruenceScore: number
): string {
  let description: string;

  if (congruenceScore >= 0.85) {
    description = 'High morphological congruence';
  } else if (congruenceScore >= 0.70) {
    description = 'Good morphological similarity';
  } else if (congruenceScore >= 0.50) {
    description = 'Moderate morphological similarity';
  } else if (congruenceScore >= 0.30) {
    description = 'Low morphological similarity';
  } else {
    description = 'Distinct morphological features';
  }

  // Add feature-specific details
  const highAgreement = comparisons.filter(c => c.overallAgreement >= 0.67);
  const lowAgreement = comparisons.filter(c => c.overallAgreement <= 0.33);

  if (highAgreement.length > 0) {
    const features = highAgreement.map(c => c.feature).join(' and ');
    description += `. Similar ${features}`;
  }

  if (lowAgreement.length > 0) {
    const features = lowAgreement.map(c => c.feature).join(' and ');
    description += `, but different ${features}`;
  }

  return description;
}

/**
 * Generate narrative for shared characteristics
 */
export function sharedCharacteristicsNarrative(sharedAxes: string[]): string {
  if (sharedAxes.length === 0) {
    return 'No shared categorical features';
  }

  if (sharedAxes.length === 1) {
    return sharedAxes[0];
  }

  if (sharedAxes.length <= 3) {
    return sharedAxes.join(', ');
  }

  // Many shared axes - summarize
  const sample = sharedAxes.slice(0, 2).join(', ');
  return `${sample}, and ${sharedAxes.length - 2} other shared characteristics`;
}

/**
 * Generate comparison narrative with emphasis on specific differences
 */
export function contrastNarrative(
  comparison: AxisComparison,
  subjectAName = 'Subject A',
  subjectBName = 'Subject B'
): string {
  const { axis, valueA, valueB, percentDiff } = comparison;

  if (comparison.agreement) {
    return `Both subjects have ${valueA} ${axis}`;
  }

  const diff = percentDiff ?? 0;
  if (diff < 10) {
    return `${subjectAName} has ${valueA} ${axis}, while ${subjectBName} has ${valueB} ${axis} (minor difference)`;
  }

  return `${subjectAName} has ${valueA} ${axis}, while ${subjectBName} has ${valueB} ${axis}`;
}

/**
 * Generate dimensional comparison narrative
 */
export function dimensionalNarrative(
  comparison: AxisComparison,
  subjectAName = 'Subject A',
  subjectBName = 'Subject B'
): string {
  const { axis, direction, percentDiff } = comparison;

  if (!percentDiff || percentDiff < 3) {
    return `${subjectAName} and ${subjectBName} have nearly identical ${axis}`;
  }

  const subject = direction === 'higher' ? subjectAName : subjectBName;
  const comparator = getComparator(axis, direction === 'higher');

  return `${subject}'s ${axis} is ${percentDiff.toFixed(1)}% ${comparator}`;
}

/**
 * Get appropriate comparator word for an axis
 */
function getComparator(axis: string, higher: boolean): string {
  // Axes where "higher" means "larger/wider/fuller"
  const sizeAxes = ['width', 'size', 'fullness', 'length', 'projection'];
  const isSize = sizeAxes.some(word => axis.includes(word));

  if (isSize) {
    return higher ? 'larger' : 'smaller';
  }

  // Axes where "higher" means "more extreme"
  return higher ? 'more pronounced' : 'less pronounced';
}

/**
 * Capitalize first letter
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Complete narrative result with all text descriptions
 */
export interface NarrativeResult {
  overall: string;
  featureSummaries: Record<string, string>;
  axisDetails: Record<string, string[]>;
  sharedCharacteristics: string;
}

/**
 * Generate complete narrative for feature comparison
 */
export function generateNarrative(
  comparisons: FeatureComparison[],
  sharedAxes: string[],
  congruenceScore: number
): NarrativeResult {
  const overall = overallNarrative(comparisons, congruenceScore);
  const sharedCharacteristics = sharedCharacteristicsNarrative(sharedAxes);

  const featureSummaries: Record<string, string> = {};
  const axisDetails: Record<string, string[]> = {};

  for (const comparison of comparisons) {
    featureSummaries[comparison.feature] = narrativeForFeature(comparison);
    axisDetails[comparison.feature] = detailedNarrativeForFeature(comparison);
  }

  return {
    overall,
    featureSummaries,
    axisDetails,
    sharedCharacteristics,
  };
}
