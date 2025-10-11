import { describe, it, expect } from 'vitest';
import { extractLandmarkBrows, extractLandmarkNose, computeLocalCurvature } from '@/lib/landmark-features';
import type { Pt } from '@/lib/landmark-features';

describe('landmark-features', () => {
  describe('extractLandmarkBrows', () => {
    it('should extract left and right brow curves from landmarks', () => {
      // Create a minimal synthetic face with 468 landmarks
      const points: Pt[] = Array.from({ length: 468 }, (_, i) => ({
        x: 100 + (i % 30) * 5,
        y: 100 + Math.floor(i / 30) * 5
      }));

      // Set up eye centers
      const leftEyeCenter = { x: 150, y: 200 };
      const rightEyeCenter = { x: 250, y: 200 };
      const ipd = 100;

      // Add some points above eyes (simulating upper lid)
      [33, 7, 163, 144, 145, 153, 154, 155, 133].forEach((idx, i) => {
        points[idx] = {
          x: leftEyeCenter.x - 20 + i * 5,
          y: leftEyeCenter.y - 10 - Math.abs(i - 4) * 2
        };
      });

      [263, 249, 390, 373, 374, 380, 381, 382, 362].forEach((idx, i) => {
        points[idx] = {
          x: rightEyeCenter.x - 20 + i * 5,
          y: rightEyeCenter.y - 10 - Math.abs(i - 4) * 2
        };
      });

      const [leftBrow, rightBrow] = extractLandmarkBrows(
        points,
        leftEyeCenter,
        rightEyeCenter,
        ipd
      );

      expect(leftBrow.length).toBeGreaterThanOrEqual(3);
      expect(rightBrow.length).toBeGreaterThanOrEqual(3);

      // Brows should be above eyes
      const leftBrowAvgY = leftBrow.reduce((sum, p) => sum + p.y, 0) / leftBrow.length;
      const rightBrowAvgY = rightBrow.reduce((sum, p) => sum + p.y, 0) / rightBrow.length;

      expect(leftBrowAvgY).toBeLessThan(leftEyeCenter.y);
      expect(rightBrowAvgY).toBeLessThan(rightEyeCenter.y);
    });

    it('should handle degenerate landmarks gracefully', () => {
      const points: Pt[] = Array.from({ length: 468 }, () => ({ x: 0, y: 0 }));
      const eyeCenter = { x: 100, y: 100 };
      const ipd = 100;

      const [leftBrow, rightBrow] = extractLandmarkBrows(
        points,
        eyeCenter,
        eyeCenter,
        ipd
      );

      // When all points are at origin, function returns some points
      // but they won't form anatomically valid brows
      expect(leftBrow).toBeDefined();
      expect(rightBrow).toBeDefined();
    });
  });

  describe('extractLandmarkNose', () => {
    it('should extract nose outline from bridge and alar landmarks', () => {
      const points: Pt[] = Array.from({ length: 468 }, () => ({ x: 0, y: 0 }));
      const ipd = 100;

      // Set key nose landmarks
      points[6] = { x: 200, y: 150 }; // bridge root
      points[168] = { x: 200, y: 170 }; // mid-bridge
      points[4] = { x: 200, y: 220 }; // tip
      points[2] = { x: 200, y: 222 }; // tip apex
      points[94] = { x: 185, y: 215 }; // left alar outer
      points[19] = { x: 190, y: 218 }; // left alar
      points[98] = { x: 195, y: 220 }; // left alar base
      points[327] = { x: 205, y: 220 }; // right alar base
      points[309] = { x: 210, y: 218 }; // right alar
      points[331] = { x: 215, y: 215 }; // right alar outer

      const noseOutline = extractLandmarkNose(points, ipd);

      expect(noseOutline.length).toBeGreaterThanOrEqual(5);

      // Check that outline includes bridge (top), alar (sides), and tip (bottom)
      const minY = Math.min(...noseOutline.map(p => p.y));
      const maxY = Math.max(...noseOutline.map(p => p.y));

      expect(minY).toBeLessThan(180); // Should include bridge
      expect(maxY).toBeGreaterThan(200); // Should include tip/alar area (smoothing may reduce max)
    });

    it('should handle degenerate nose landmarks', () => {
      const points: Pt[] = Array.from({ length: 468 }, () => ({ x: 0, y: 0 }));
      const ipd = 100;

      const noseOutline = extractLandmarkNose(points, ipd);

      // When all points are at origin, function still returns points
      // but they represent a degenerate (collapsed) nose
      expect(noseOutline).toBeDefined();
      expect(Array.isArray(noseOutline)).toBe(true);
    });
  });

  describe('computeLocalCurvature', () => {
    it('should compute principal direction for landmark neighborhood', () => {
      const points: Pt[] = Array.from({ length: 468 }, () => ({ x: 0, y: 0 }));

      // Create a line of landmarks with variation in both x and y
      const indices = [10, 11, 12, 13, 14];
      indices.forEach((idx, i) => {
        points[idx] = { x: 100 + i * 20, y: 150 + i * 5 };
      });

      const result = computeLocalCurvature(points, indices, 50);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.center.x).toBeCloseTo(140, 1);
        expect(result.center.y).toBeCloseTo(160, 1);

        // Direction vector should be normalized (length ≈ 1)
        const length = Math.hypot(result.direction.x, result.direction.y);
        expect(length).toBeCloseTo(1, 2);
      }
    });

    it('should return null for insufficient landmarks', () => {
      const points: Pt[] = Array.from({ length: 468 }, () => ({ x: 0, y: 0 }));
      const result = computeLocalCurvature(points, [1, 2], 10);

      expect(result).toBeNull();
    });
  });
});
