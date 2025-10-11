import { describe, it, expect } from 'vitest';
import {
  extractClassMask,
  extractRegionMask,
  computeCentroid,
  computeArea,
  computeIoU,
  computeDice,
  computeCentroidDistance,
  computeAreaSimilarity,
  computeRegionSimilarityFromMasks,
  summarizeRegionsFromMasks,
  CLASS_TO_REGION,
  type SegmentationMask,
} from '../lib/segmentation-scoring';

describe('segmentation-scoring', () => {
  const createMask = (width: number, height: number, labels: number[]): SegmentationMask => ({
    width,
    height,
    labels: new Uint8Array(labels),
    crop: { sx: 0, sy: 0, sw: width, sh: height },
  });

  describe('extractClassMask', () => {
    it('extracts binary mask for specific class', () => {
      const mask = createMask(3, 3, [
        1, 2, 1,
        2, 2, 1,
        1, 2, 1,
      ]);

      const class2 = extractClassMask(mask, 2);
      expect(Array.from(class2)).toEqual([
        0, 1, 0,
        1, 1, 0,
        0, 1, 0,
      ]);
    });
  });

  describe('extractRegionMask', () => {
    it('combines multiple classes for a region', () => {
      // eyes region includes both l_eye (4) and r_eye (5)
      const mask = createMask(3, 3, [
        0, 4, 0,
        5, 0, 5,
        0, 4, 0,
      ]);

      const eyes = extractRegionMask(mask, 'eyes');
      expect(Array.from(eyes)).toEqual([
        0, 1, 0,
        1, 0, 1,
        0, 1, 0,
      ]);
    });
  });

  describe('computeCentroid', () => {
    it('computes center of mass for binary mask', () => {
      const mask = new Uint8Array([
        0, 1, 0,
        0, 1, 0,
        0, 1, 0,
      ]);

      const centroid = computeCentroid(mask, 3, 3);
      expect(centroid).toEqual({ x: 1, y: 1 }); // center column, middle row
    });

    it('returns null for empty mask', () => {
      const mask = new Uint8Array([0, 0, 0, 0]);
      expect(computeCentroid(mask, 2, 2)).toBeNull();
    });
  });

  describe('computeArea', () => {
    it('counts non-zero pixels', () => {
      const mask = new Uint8Array([1, 0, 1, 1, 0]);
      expect(computeArea(mask)).toBe(3);
    });
  });

  describe('computeIoU', () => {
    it('computes perfect overlap', () => {
      const maskA = new Uint8Array([1, 1, 0, 0]);
      const maskB = new Uint8Array([1, 1, 0, 0]);
      expect(computeIoU(maskA, maskB)).toBe(1);
    });

    it('computes no overlap', () => {
      const maskA = new Uint8Array([1, 1, 0, 0]);
      const maskB = new Uint8Array([0, 0, 1, 1]);
      expect(computeIoU(maskA, maskB)).toBe(0);
    });

    it('computes partial overlap', () => {
      const maskA = new Uint8Array([1, 1, 0, 0]);
      const maskB = new Uint8Array([0, 1, 1, 0]);
      // intersection = 1, union = 3
      expect(computeIoU(maskA, maskB)).toBeCloseTo(1 / 3);
    });
  });

  describe('computeDice', () => {
    it('computes perfect overlap', () => {
      const maskA = new Uint8Array([1, 1, 0, 0]);
      const maskB = new Uint8Array([1, 1, 0, 0]);
      expect(computeDice(maskA, maskB)).toBe(1);
    });

    it('computes partial overlap', () => {
      const maskA = new Uint8Array([1, 1, 0, 0]);
      const maskB = new Uint8Array([0, 1, 1, 0]);
      // intersection = 1, sumA = 2, sumB = 2
      // dice = 2*1 / (2+2) = 0.5
      expect(computeDice(maskA, maskB)).toBe(0.5);
    });
  });

  describe('computeCentroidDistance', () => {
    it('computes zero distance for same position', () => {
      const centroidA = { x: 5, y: 5 };
      const centroidB = { x: 5, y: 5 };
      expect(computeCentroidDistance(centroidA, centroidB, 10, 10)).toBe(0);
    });

    it('normalizes by diagonal', () => {
      const centroidA = { x: 0, y: 0 };
      const centroidB = { x: 10, y: 10 };
      const diagonal = Math.hypot(10, 10);
      const expected = diagonal / diagonal; // should be 1
      expect(computeCentroidDistance(centroidA, centroidB, 10, 10)).toBeCloseTo(1);
    });

    it('returns max distance if either centroid is null', () => {
      expect(computeCentroidDistance(null, { x: 5, y: 5 }, 10, 10)).toBe(1);
      expect(computeCentroidDistance({ x: 5, y: 5 }, null, 10, 10)).toBe(1);
    });
  });

  describe('computeAreaSimilarity', () => {
    it('computes perfect similarity for same size', () => {
      expect(computeAreaSimilarity(100, 100)).toBe(1);
    });

    it('computes ratio for different sizes', () => {
      expect(computeAreaSimilarity(50, 100)).toBe(0.5);
      expect(computeAreaSimilarity(100, 50)).toBe(0.5);
    });

    it('returns 0 if one area is zero', () => {
      expect(computeAreaSimilarity(0, 100)).toBe(0);
      expect(computeAreaSimilarity(100, 0)).toBe(0);
    });

    it('returns 1 if both areas are zero', () => {
      expect(computeAreaSimilarity(0, 0)).toBe(1);
    });
  });

  describe('computeRegionSimilarityFromMasks', () => {
    it('returns 1 for identical nose regions', () => {
      const maskA = createMask(4, 4, [
        0, 0, 0, 0,
        0, 2, 2, 0,
        0, 2, 2, 0,
        0, 0, 0, 0,
      ]);
      const maskB = createMask(4, 4, [
        0, 0, 0, 0,
        0, 2, 2, 0,
        0, 2, 2, 0,
        0, 0, 0, 0,
      ]);

      const score = computeRegionSimilarityFromMasks(maskA, maskB, 'nose');
      expect(score).toBe(1);
    });

    it('returns 0 for completely different nose positions', () => {
      const maskA = createMask(4, 4, [
        2, 2, 0, 0,
        2, 2, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
      ]);
      const maskB = createMask(4, 4, [
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 2, 2,
        0, 0, 2, 2,
      ]);

      const score = computeRegionSimilarityFromMasks(maskA, maskB, 'nose');
      expect(score).toBeLessThan(0.3); // very low similarity
    });

    it('returns 1 if region absent in both masks', () => {
      const maskA = createMask(2, 2, [0, 0, 0, 0]);
      const maskB = createMask(2, 2, [0, 0, 0, 0]);

      const score = computeRegionSimilarityFromMasks(maskA, maskB, 'nose');
      expect(score).toBe(1);
    });

    it('returns 0 if region present in only one mask', () => {
      const maskA = createMask(2, 2, [2, 2, 0, 0]);
      const maskB = createMask(2, 2, [0, 0, 0, 0]);

      const score = computeRegionSimilarityFromMasks(maskA, maskB, 'nose');
      expect(score).toBe(0);
    });
  });

  describe('summarizeRegionsFromMasks', () => {
    it('computes scores for all present regions', () => {
      // Mask with nose (2) and eyes (4, 5)
      const maskA = createMask(4, 4, [
        4, 2, 2, 5,
        0, 2, 2, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
      ]);
      const maskB = createMask(4, 4, [
        4, 2, 2, 5,
        0, 2, 2, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
      ]);

      const result = summarizeRegionsFromMasks(maskA, maskB);

      // Should have scores for nose and eyes
      expect(result.scores.some(s => s.region === 'nose')).toBe(true);
      expect(result.scores.some(s => s.region === 'eyes')).toBe(true);

      // Perfect match should have overall score of 1
      expect(result.overall).toBe(1);
    });

    it('weights regions by area', () => {
      // Large nose region, tiny eye region
      const maskA = createMask(4, 4, [
        2, 2, 2, 4, // nose=3px, eyes=1px
        2, 2, 2, 0,
        2, 2, 2, 0,
        0, 0, 0, 0,
      ]);
      const maskB = createMask(4, 4, [
        2, 2, 2, 4,
        2, 2, 2, 0,
        2, 2, 2, 0,
        0, 0, 0, 0,
      ]);

      const result = summarizeRegionsFromMasks(maskA, maskB);

      // Overall should be heavily weighted toward nose (larger region)
      expect(result.overall).toBe(1);

      // Scores should be sorted by score (highest first)
      expect(result.scores[0].score).toBeGreaterThanOrEqual(result.scores[result.scores.length - 1].score);
    });
  });
});
