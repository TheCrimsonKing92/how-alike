/**
 * Feature Narratives - Generate human-readable descriptions of feature comparisons
 *
 * Converts axis comparisons into natural language explanations of similarities
 * and differences between two faces.
 */

import type { AxisComparison, FeatureComparison } from './feature-comparisons';

type FeatureBucket = 'upper' | 'mid' | 'lower' | 'global';

const FEATURE_BUCKETS: Record<string, FeatureBucket> = {
  eyes: 'upper',
  brows: 'upper',
  forehead: 'upper',
  nose: 'mid',
  cheeks: 'mid',
  mouth: 'lower',
  jaw: 'lower',
  faceShape: 'global',
  'face shape': 'global',
};

const FEATURE_LABELS: Record<string, string> = {
  faceShape: 'face shape',
  'face shape': 'face shape',
};

const BUCKET_DESCRIPTORS: Record<FeatureBucket, string> = {
  upper: 'eyes and brows',
  mid: 'mid-face features',
  lower: 'lower face structure',
  global: 'overall face shape',
};

const BUCKET_ORDER: FeatureBucket[] = ['upper', 'mid', 'lower', 'global'];

interface BucketPhrase {
  bucket: FeatureBucket;
  label: string;
}

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
 * Detailed narrative organized by shared/distinctive characteristics
 */
export interface DetailedNarrative {
  shared: string[];
  imageA: string[];
  imageB: string[];
  agreement?: number; // 0-1 score for this feature's overall agreement
}

/**
 * Generate detailed axis-by-axis narratives for a feature, organized by similarity
 */
export function detailedNarrativeForFeature(comparison: FeatureComparison): DetailedNarrative {
  const agreements = comparison.axes.filter(axis => axis.agreement);
  const disagreements = comparison.axes.filter(axis => !axis.agreement);

  // For shared: just state the characteristic (section header already says "Shared")
  const shared = agreements.map(axis => `${capitalize(axis.valueA)} ${axis.axis}`);

  // For distinctive: show what each image has
  const imageA = disagreements.map(axis => `${capitalize(axis.valueA)} ${axis.axis}`);
  const imageB = disagreements.map(axis => `${capitalize(axis.valueB)} ${axis.axis}`);

  return { shared, imageA, imageB, agreement: comparison.overallAgreement };
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

  const sentences = [description];
  const highAgreement = comparisons.filter(c => c.overallAgreement >= 0.67);
  const lowAgreement = comparisons.filter(c => c.overallAgreement <= 0.33);
  const positivePhrases = createBucketPhrases(highAgreement.map(c => c.feature));

  if (positivePhrases.length > 0) {
    const qualifier = selectSimilarityQualifier(congruenceScore);
    const nonLowerTargets = positivePhrases.filter(phrase => phrase.bucket !== 'lower');
    const primaryTargets = nonLowerTargets.length > 0 ? nonLowerTargets : positivePhrases;
    sentences.push(`${qualifier} similarity across ${formatList(primaryTargets.map(p => p.label))}`);

    if (nonLowerTargets.length > 0) {
      const lowerPhrase = positivePhrases.find(phrase => phrase.bucket === 'lower');
      if (lowerPhrase) {
        const alignment = selectAlignmentQualifier(congruenceScore);
        sentences.push(`${capitalize(lowerPhrase.label)} also ${alignment}`);
      }
    }
  }

  const negativePhrases = createBucketPhrases(lowAgreement.map(c => c.feature));
  if (negativePhrases.length > 0) {
    const clause = `${selectDifferenceQualifier(congruenceScore)} ${formatList(negativePhrases.map(p => p.label))}`;
    if (sentences.length > 1) {
      sentences.push(`However, ${clause}`);
    } else {
      sentences.push(capitalize(clause));
    }
  }

  return sentences.join('. ');
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

function createBucketPhrases(features: string[]): BucketPhrase[] {
  if (features.length === 0) {
    return [];
  }

  const grouped = bucketizeFeatures(features);
  const phrases: BucketPhrase[] = [];

  for (const bucket of BUCKET_ORDER) {
    const entries = grouped[bucket];
    if (!entries || entries.length === 0) {
      continue;
    }

    if (bucket === 'upper') {
      for (const feature of entries) {
        phrases.push({
          bucket,
          label: humanizeFeatureName(feature),
        });
      }
      continue;
    }

    phrases.push({
      bucket,
      label: descriptorForBucket(bucket, entries),
    });
  }

  return phrases;
}

function bucketizeFeatures(features: string[]): Record<FeatureBucket, string[]> {
  const grouped: Record<FeatureBucket, string[]> = {
    upper: [],
    mid: [],
    lower: [],
    global: [],
  };

  for (const feature of features) {
    const bucket = FEATURE_BUCKETS[feature] ?? 'global';
    grouped[bucket].push(feature);
  }

  return grouped;
}

function descriptorForBucket(bucket: FeatureBucket, features: string[]): string {
  if (features.length === 1) {
    return humanizeFeatureName(features[0]);
  }

  return BUCKET_DESCRIPTORS[bucket];
}

function humanizeFeatureName(feature: string): string {
  if (FEATURE_LABELS[feature]) {
    return FEATURE_LABELS[feature];
  }

  return feature
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .toLowerCase();
}

function formatList(items: string[]): string {
  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  const start = items.slice(0, -1).join(', ');
  const end = items[items.length - 1];
  return `${start}, and ${end}`;
}

function selectSimilarityQualifier(score: number): string {
  if (score >= 0.9) {
    return 'Very strong';
  }

  if (score >= 0.8) {
    return 'Strong';
  }

  if (score >= 0.7) {
    return 'Notable';
  }

  return 'Some';
}

function selectAlignmentQualifier(score: number): string {
  if (score >= 0.9) {
    return 'closely aligned';
  }

  if (score >= 0.8) {
    return 'well aligned';
  }

  if (score >= 0.7) {
    return 'aligned';
  }

  return 'generally aligned';
}

function selectDifferenceQualifier(score: number): string {
  if (score >= 0.7) {
    return 'minor differences remain around';
  }

  if (score >= 0.5) {
    return 'differences remain around';
  }

  if (score >= 0.3) {
    return 'key differences remain around';
  }

  return 'major contrasts appear around';
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
  axisDetails: Record<string, DetailedNarrative>;
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
  const axisDetails: Record<string, DetailedNarrative> = {};

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
