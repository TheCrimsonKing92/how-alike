/**
 * Segmentation-based regional similarity scoring
 *
 * Uses face parsing segmentation masks to compute region-specific similarity
 * based on shape overlap (IoU/Dice), position (centroid distance), and size (area ratio).
 */

export type Vec2 = { x: number; y: number };
export type RegionScore = { region: string; score: number };

export interface SegmentationMask {
  width: number;
  height: number;
  labels: Uint8Array;
  crop: { sx: number; sy: number; sw: number; sh: number };
}

// CelebAMask-HQ class mapping
export const CLASS_TO_REGION: Record<number, string> = {
  1: 'skin',
  2: 'nose',
  3: 'eyeglasses',
  4: 'eyes', // l_eye
  5: 'eyes', // r_eye
  6: 'brows', // l_brow
  7: 'brows', // r_brow
  8: 'ears', // l_ear
  9: 'ears', // r_ear
  10: 'mouth',
  11: 'mouth', // u_lip
  12: 'mouth', // l_lip
  13: 'hair',
  17: 'neck',
  18: 'cloth',
};

/**
 * Extract binary mask for a specific class ID
 */
export function extractClassMask(mask: SegmentationMask, classId: number): Uint8Array {
  const binary = new Uint8Array(mask.labels.length);
  for (let i = 0; i < mask.labels.length; i++) {
    binary[i] = mask.labels[i] === classId ? 1 : 0;
  }
  return binary;
}

/**
 * Extract binary mask for a region (may combine multiple classes)
 */
export function extractRegionMask(mask: SegmentationMask, region: string): Uint8Array {
  const binary = new Uint8Array(mask.labels.length);
  const classIds = Object.entries(CLASS_TO_REGION)
    .filter(([_, r]) => r === region)
    .map(([id]) => Number(id));

  for (let i = 0; i < mask.labels.length; i++) {
    binary[i] = classIds.includes(mask.labels[i]) ? 1 : 0;
  }
  return binary;
}

/**
 * Compute centroid of a binary mask
 */
export function computeCentroid(mask: Uint8Array, width: number, height: number): Vec2 | null {
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (mask[idx]) {
        sumX += x;
        sumY += y;
        count++;
      }
    }
  }

  if (count === 0) return null;
  return { x: sumX / count, y: sumY / count };
}

/**
 * Compute area (pixel count) of a binary mask
 */
export function computeArea(mask: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) count++;
  }
  return count;
}

/**
 * Compute Intersection over Union (IoU) between two binary masks
 */
export function computeIoU(maskA: Uint8Array, maskB: Uint8Array): number {
  let intersection = 0;
  let union = 0;

  for (let i = 0; i < maskA.length; i++) {
    const a = maskA[i];
    const b = maskB[i];
    if (a && b) intersection++;
    if (a || b) union++;
  }

  return union > 0 ? intersection / union : 0;
}

/**
 * Compute Dice coefficient between two binary masks
 */
export function computeDice(maskA: Uint8Array, maskB: Uint8Array): number {
  let intersection = 0;
  let sumA = 0;
  let sumB = 0;

  for (let i = 0; i < maskA.length; i++) {
    const a = maskA[i];
    const b = maskB[i];
    if (a && b) intersection++;
    if (a) sumA++;
    if (b) sumB++;
  }

  const total = sumA + sumB;
  return total > 0 ? (2 * intersection) / total : 0;
}

/**
 * Compute normalized centroid distance (0 = same position, 1 = opposite corners)
 */
export function computeCentroidDistance(
  centroidA: Vec2 | null,
  centroidB: Vec2 | null,
  width: number,
  height: number
): number {
  if (!centroidA || !centroidB) return 1; // max distance if either is missing

  const dx = centroidA.x - centroidB.x;
  const dy = centroidA.y - centroidB.y;
  const dist = Math.hypot(dx, dy);

  // Normalize by diagonal length
  const diagonal = Math.hypot(width, height);
  return Math.min(dist / diagonal, 1);
}

/**
 * Compute area ratio similarity (0 = very different sizes, 1 = same size)
 */
export function computeAreaSimilarity(areaA: number, areaB: number): number {
  if (areaA === 0 && areaB === 0) return 1; // both empty = same
  if (areaA === 0 || areaB === 0) return 0; // one empty = different

  const ratio = Math.min(areaA, areaB) / Math.max(areaA, areaB);
  return ratio;
}

/**
 * Compute region similarity from segmentation masks
 * Combines shape overlap, position, and size into single score
 */
export function computeRegionSimilarityFromMasks(
  maskA: SegmentationMask,
  maskB: SegmentationMask,
  region: string
): number {
  // Extract region masks
  const binA = extractRegionMask(maskA, region);
  const binB = extractRegionMask(maskB, region);

  // Check if region exists in both images
  const areaA = computeArea(binA);
  const areaB = computeArea(binB);

  if (areaA === 0 && areaB === 0) {
    // Region not present in either image - perfect match
    return 1;
  }

  if (areaA === 0 || areaB === 0) {
    // Region present in only one image - no match
    return 0;
  }

  // Compute shape overlap (use Dice - less sensitive to size differences than IoU)
  const shapeSim = computeDice(binA, binB);

  // Compute position similarity
  const centroidA = computeCentroid(binA, maskA.width, maskA.height);
  const centroidB = computeCentroid(binB, maskB.width, maskB.height);
  const centroidDist = computeCentroidDistance(centroidA, centroidB, maskA.width, maskA.height);
  const positionSim = 1 - centroidDist;

  // Compute size similarity
  const sizeSim = computeAreaSimilarity(areaA, areaB);

  // Weighted combination (shape is most important)
  const score = 0.6 * shapeSim + 0.25 * positionSim + 0.15 * sizeSim;

  return score;
}

/**
 * Summarize all regions from segmentation masks
 */
export function summarizeRegionsFromMasks(
  maskA: SegmentationMask,
  maskB: SegmentationMask
): { scores: RegionScore[]; overall: number } {
  // Get unique regions present in either mask
  const regions = new Set<string>();
  for (const region of Object.values(CLASS_TO_REGION)) {
    regions.add(region);
  }

  // Exclude cloth region from similarity calculations (not part of facial features)
  regions.delete('cloth');

  const scores: RegionScore[] = [];
  let totalWeight = 0;
  let weightedSum = 0;

  for (const region of regions) {
    const score = computeRegionSimilarityFromMasks(maskA, maskB, region);

    // Weight by region importance (presence in either image)
    const binA = extractRegionMask(maskA, region);
    const binB = extractRegionMask(maskB, region);
    const weight = Math.max(computeArea(binA), computeArea(binB));

    if (weight > 0) {
      scores.push({ region, score });
      totalWeight += weight;
      weightedSum += score * weight;
    }
  }

  const overall = totalWeight > 0 ? weightedSum / totalWeight : 0;

  return {
    scores: scores.sort((a, b) => b.score - a.score),
    overall
  };
}
