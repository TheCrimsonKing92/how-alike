/**
 * Generate natural language descriptions from segmentation-based similarity scores
 */

import type { RegionScore } from './segmentation-scoring';

export type NarrativeText = { region: string; text: string };

/**
 * Generate narrative descriptions for regional similarity scores
 */
export function generateNarrativeFromScores(scores: RegionScore[]): NarrativeText[] {
  const narratives: NarrativeText[] = [];

  for (const { region, score } of scores) {
    const text = describeRegionSimilarity(region, score);
    if (text) {
      narratives.push({ region, text });
    }
  }

  return narratives;
}

/**
 * Describe similarity for a specific region based on score
 */
function describeRegionSimilarity(region: string, score: number): string | null {
  // Score ranges:
  // 0.90-1.00: very similar
  // 0.75-0.89: similar
  // 0.60-0.74: somewhat similar
  // 0.45-0.59: somewhat different
  // 0.30-0.44: different
  // 0.00-0.29: very different

  const level =
    score >= 0.90 ? 'very-similar' :
    score >= 0.75 ? 'similar' :
    score >= 0.60 ? 'somewhat-similar' :
    score >= 0.45 ? 'somewhat-different' :
    score >= 0.30 ? 'different' :
    'very-different';

  switch (region) {
    case 'eyes':
      return describeEyes(level);
    case 'brows':
      return describeBrows(level);
    case 'nose':
      return describeNose(level);
    case 'mouth':
      return describeMouth(level);
    case 'jaw':
      return describeJaw(level);
    case 'ears':
      return describeEars(level);
    case 'skin':
      return describeSkin(level);
    case 'hair':
      return describeHair(level);
    case 'neck':
      return describeNeck(level);
    case 'eyeglasses':
      return describeEyeglasses(level);
    default:
      return null;
  }
}

function describeEyes(level: string): string {
  switch (level) {
    case 'very-similar':
      return 'eye shape and position are nearly identical';
    case 'similar':
      return 'eyes have similar shape and placement';
    case 'somewhat-similar':
      return 'eyes share some common features but differ in shape or position';
    case 'somewhat-different':
      return 'eye shape or position shows noticeable differences';
    case 'different':
      return 'eyes differ in shape and placement';
    case 'very-different':
      return 'eye shape and position are quite different';
    default:
      return 'eye comparison available';
  }
}

function describeBrows(level: string): string {
  switch (level) {
    case 'very-similar':
      return 'eyebrow shape and arch are nearly identical';
    case 'similar':
      return 'eyebrows have similar arch and thickness';
    case 'somewhat-similar':
      return 'eyebrows share some characteristics but differ in arch or thickness';
    case 'somewhat-different':
      return 'eyebrow shape or arch shows noticeable differences';
    case 'different':
      return 'eyebrows differ in shape and arch';
    case 'very-different':
      return 'eyebrow shape and arch are quite different';
    default:
      return 'eyebrow comparison available';
  }
}

function describeNose(level: string): string {
  switch (level) {
    case 'very-similar':
      return 'nose shape and bridge are nearly identical';
    case 'similar':
      return 'noses have similar shape and proportions';
    case 'somewhat-similar':
      return 'noses share some features but differ in width or bridge';
    case 'somewhat-different':
      return 'nose shape or bridge shows noticeable differences';
    case 'different':
      return 'noses differ in shape and proportions';
    case 'very-different':
      return 'nose shape and structure are quite different';
    default:
      return 'nose comparison available';
  }
}

function describeMouth(level: string): string {
  switch (level) {
    case 'very-similar':
      return 'mouth shape and size are nearly identical';
    case 'similar':
      return 'mouths have similar width and lip proportions';
    case 'somewhat-similar':
      return 'mouths share some features but differ in width or fullness';
    case 'somewhat-different':
      return 'mouth shape or size shows noticeable differences';
    case 'different':
      return 'mouths differ in width and proportions';
    case 'very-different':
      return 'mouth shape and size are quite different';
    default:
      return 'mouth comparison available';
  }
}

function describeJaw(level: string): string {
  switch (level) {
    case 'very-similar':
      return 'jaw structure and face shape are nearly identical';
    case 'similar':
      return 'jawlines have similar structure and angle';
    case 'somewhat-similar':
      return 'jaw shapes share some characteristics but differ in width or angle';
    case 'somewhat-different':
      return 'jawline structure shows noticeable differences';
    case 'different':
      return 'jaw structures differ in shape and angle';
    case 'very-different':
      return 'jaw structure and face shape are quite different';
    default:
      return 'jawline comparison available';
  }
}

function describeEars(level: string): string {
  switch (level) {
    case 'very-similar':
      return 'ear shape and position are nearly identical';
    case 'similar':
      return 'ears have similar shape and placement';
    case 'somewhat-similar':
      return 'ears share some features but differ in shape or position';
    case 'somewhat-different':
      return 'ear shape or position shows noticeable differences';
    case 'different':
      return 'ears differ in shape and placement';
    case 'very-different':
      return 'ear shape and position are quite different';
    default:
      return 'ear comparison available';
  }
}

function describeSkin(level: string): string {
  switch (level) {
    case 'very-similar':
      return 'facial contours and overall shape are nearly identical';
    case 'similar':
      return 'face shapes have similar contours and proportions';
    case 'somewhat-similar':
      return 'facial shapes share some characteristics';
    case 'somewhat-different':
      return 'facial contours show noticeable differences';
    case 'different':
      return 'face shapes differ in contours and proportions';
    case 'very-different':
      return 'facial contours are quite different';
    default:
      return 'facial contour comparison available';
  }
}

function describeHair(level: string): string {
  switch (level) {
    case 'very-similar':
      return 'hairline and coverage are nearly identical';
    case 'similar':
      return 'hairlines have similar shape and position';
    case 'somewhat-similar':
      return 'hairlines share some characteristics';
    case 'somewhat-different':
      return 'hairline shape or position shows noticeable differences';
    case 'different':
      return 'hairlines differ in shape and coverage';
    case 'very-different':
      return 'hairline and coverage are quite different';
    default:
      return 'hairline comparison available';
  }
}

function describeNeck(level: string): string {
  switch (level) {
    case 'very-similar':
      return 'neck shape and proportions are nearly identical';
    case 'similar':
      return 'necks have similar shape and thickness';
    case 'somewhat-similar':
      return 'neck shapes share some characteristics';
    case 'somewhat-different':
      return 'neck shape shows noticeable differences';
    case 'different':
      return 'necks differ in shape and proportions';
    case 'very-different':
      return 'neck shape and proportions are quite different';
    default:
      return 'neck comparison available';
  }
}

function describeEyeglasses(level: string): string {
  switch (level) {
    case 'very-similar':
      return 'both subjects wear similar eyeglasses';
    case 'similar':
      return 'eyeglasses coverage is similar';
    case 'somewhat-similar':
      return 'eyeglasses presence is partially similar';
    case 'somewhat-different':
      return 'eyeglasses differ between subjects';
    case 'different':
      return 'eyeglasses coverage differs';
    case 'very-different':
      return 'one subject wears glasses while the other does not';
    default:
      return 'eyeglasses comparison available';
  }
}
