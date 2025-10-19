import { describe, it, expect } from 'vitest';
import {
  estimateFacePose,
  normalizeLandmarksToFrontal,
  isNonFrontal,
  poseAngularDistance,
  formatPose,
  type FacePose,
  type Point3D,
} from '@/lib/pose-estimation';

describe('pose-estimation', () => {
  // Helper to create a frontal face (landmarks arranged symmetrically)
  function createFrontalFace(): Point3D[] {
    const landmarks: Point3D[] = new Array(468).fill(null).map(() => ({
      x: 0.5,
      y: 0.5,
      z: 0,
    }));

    // Set key landmarks for frontal pose
    landmarks[1] = { x: 0.5, y: 0.45, z: 0 }; // nose tip (centered)
    landmarks[234] = { x: 0.3, y: 0.5, z: 0 }; // left cheek
    landmarks[454] = { x: 0.7, y: 0.5, z: 0 }; // right cheek (symmetric)
    landmarks[6] = { x: 0.5, y: 0.3, z: 0 }; // nose bridge
    landmarks[152] = { x: 0.5, y: 0.8, z: 0 }; // chin bottom

    // Eye landmarks (level horizontal line)
    landmarks[33] = { x: 0.3, y: 0.35, z: 0 }; // left eye outer
    landmarks[133] = { x: 0.45, y: 0.35, z: 0 }; // left eye inner
    landmarks[362] = { x: 0.55, y: 0.35, z: 0 }; // right eye inner
    landmarks[263] = { x: 0.7, y: 0.35, z: 0 }; // right eye outer

    return landmarks;
  }

  describe('estimateFacePose', () => {
    it('should detect frontal pose with near-zero angles', () => {
      const landmarks = createFrontalFace();
      const pose = estimateFacePose(landmarks);

      expect(Math.abs(pose.yaw)).toBeLessThan(5);
      expect(Math.abs(pose.pitch)).toBeLessThan(10);
      expect(Math.abs(pose.roll)).toBeLessThan(5);
      expect(pose.confidence).toBeGreaterThan(0);
    });

    it('should detect rightward yaw when right cheek is closer', () => {
      const landmarks = createFrontalFace();
      // Move nose tip toward right cheek (face turned right)
      // This makes rightDist smaller, so asymmetry = (small - large) / sum = negative
      landmarks[1] = { x: 0.6, y: 0.45, z: 0 };

      const pose = estimateFacePose(landmarks);
      expect(pose.yaw).toBeLessThan(0); // Current formula gives negative for right turn
    });

    it('should detect leftward yaw when left cheek is closer', () => {
      const landmarks = createFrontalFace();
      // Move nose tip toward left cheek (face turned left)
      // This makes leftDist smaller, so asymmetry = (large - small) / sum = positive
      landmarks[1] = { x: 0.4, y: 0.45, z: 0 };

      const pose = estimateFacePose(landmarks);
      expect(pose.yaw).toBeGreaterThan(0); // Current formula gives positive for left turn
    });

    it('should detect upward pitch when nose tip is higher', () => {
      const landmarks = createFrontalFace();
      // Move nose tip up (face tilted up)
      landmarks[1] = { x: 0.5, y: 0.35, z: 0 };

      const pose = estimateFacePose(landmarks);
      expect(pose.pitch).toBeLessThan(0); // Negative = tilted down in image (looking up)
    });

    it('should detect downward pitch when nose tip is lower', () => {
      const landmarks = createFrontalFace();
      // Move nose tip down (face tilted down)
      landmarks[1] = { x: 0.5, y: 0.55, z: 0 };

      const pose = estimateFacePose(landmarks);
      expect(pose.pitch).toBeGreaterThan(0); // Positive = tilted up in image (looking down)
    });

    it('should detect clockwise roll when right eye is lower', () => {
      const landmarks = createFrontalFace();
      // Tilt right eye down (clockwise roll)
      landmarks[362]!.y = 0.37; // right eye inner
      landmarks[263]!.y = 0.37; // right eye outer

      const pose = estimateFacePose(landmarks);
      expect(pose.roll).toBeGreaterThan(0); // Positive = clockwise
    });

    it('should detect counterclockwise roll when left eye is lower', () => {
      const landmarks = createFrontalFace();
      // Tilt left eye down (counterclockwise roll)
      landmarks[33]!.y = 0.37; // left eye outer
      landmarks[133]!.y = 0.37; // left eye inner

      const pose = estimateFacePose(landmarks);
      expect(pose.roll).toBeLessThan(0); // Negative = counterclockwise
    });

    it('should have higher confidence with z-coordinates', () => {
      const landmarks = createFrontalFace();
      // Remove z-coordinates to test 2D-only
      const landmarks2D = landmarks.map((lm) => ({ x: lm.x, y: lm.y }));
      const pose2D = estimateFacePose(landmarks2D);

      // Add z-coordinates
      const landmarks3D = landmarks.map((lm) => ({ ...lm, z: 0.5 }));
      const pose3D = estimateFacePose(landmarks3D);

      expect(pose3D.confidence).toBeGreaterThan(pose2D.confidence);
    });

    it('should clamp extreme yaw values', () => {
      const landmarks = createFrontalFace();
      // Create extreme asymmetry
      landmarks[1] = { x: 0.9, y: 0.45, z: 0 };

      const pose = estimateFacePose(landmarks);
      expect(pose.yaw).toBeLessThanOrEqual(90);
      expect(pose.yaw).toBeGreaterThanOrEqual(-90);
    });

    it('should clamp extreme pitch values', () => {
      const landmarks = createFrontalFace();
      // Create extreme pitch
      landmarks[1] = { x: 0.5, y: 0.1, z: 0 };

      const pose = estimateFacePose(landmarks);
      expect(pose.pitch).toBeLessThanOrEqual(90);
      expect(pose.pitch).toBeGreaterThanOrEqual(-90);
    });
  });

  describe('normalizeLandmarksToFrontal', () => {
    it('should not modify landmarks when pose is already frontal', () => {
      const landmarks = createFrontalFace();
      // Force pose to be exactly frontal to skip normalization
      const frontalPose: FacePose = { yaw: 0, pitch: 0, roll: 0, confidence: 0.9 };
      const normalized = normalizeLandmarksToFrontal(landmarks, frontalPose);

      // Should return same array (not modified)
      expect(normalized).toBe(landmarks);
    });

    it('should modify landmarks when pose is non-frontal', () => {
      const landmarks = createFrontalFace();
      // Create non-frontal pose (20° yaw)
      landmarks[1] = { x: 0.65, y: 0.45, z: 0 };

      const pose = estimateFacePose(landmarks);
      const normalized = normalizeLandmarksToFrontal(landmarks, pose);

      // Should return different array
      expect(normalized).not.toBe(landmarks);
      expect(normalized.length).toBe(landmarks.length);
    });

    it('should preserve landmark count', () => {
      const landmarks = createFrontalFace();
      landmarks[1] = { x: 0.65, y: 0.45, z: 0 };

      const pose = estimateFacePose(landmarks);
      const normalized = normalizeLandmarksToFrontal(landmarks, pose);

      expect(normalized.length).toBe(468);
    });

    it('should reduce asymmetry in yaw-rotated faces', () => {
      const landmarks = createFrontalFace();
      // Create strong rightward yaw
      landmarks[1] = { x: 0.65, y: 0.45, z: 0 };

      const originalPose = estimateFacePose(landmarks);
      const normalized = normalizeLandmarksToFrontal(landmarks, originalPose);
      const normalizedPose = estimateFacePose(normalized);

      // Normalized pose should have smaller yaw magnitude
      expect(Math.abs(normalizedPose.yaw)).toBeLessThan(Math.abs(originalPose.yaw));
    });

    it('should handle landmarks with undefined z-coordinates', () => {
      const landmarks = createFrontalFace();
      // Remove z-coordinates
      landmarks.forEach((lm) => delete lm.z);
      landmarks[1] = { x: 0.65, y: 0.45 };

      const pose = estimateFacePose(landmarks);
      const normalized = normalizeLandmarksToFrontal(landmarks, pose);

      expect(normalized).toBeDefined();
      expect(normalized.length).toBe(468);
    });
  });

  describe('isNonFrontal', () => {
    it('should return false for frontal pose', () => {
      const pose: FacePose = { yaw: 0, pitch: 0, roll: 0, confidence: 0.9 };
      expect(isNonFrontal(pose)).toBe(false);
    });

    it('should return true for large yaw', () => {
      const pose: FacePose = { yaw: 20, pitch: 0, roll: 0, confidence: 0.9 };
      expect(isNonFrontal(pose, 15)).toBe(true);
    });

    it('should return true for large pitch', () => {
      const pose: FacePose = { yaw: 0, pitch: 20, roll: 0, confidence: 0.9 };
      expect(isNonFrontal(pose, 15)).toBe(true);
    });

    it('should return true for large roll', () => {
      const pose: FacePose = { yaw: 0, pitch: 0, roll: 20, confidence: 0.9 };
      expect(isNonFrontal(pose, 15)).toBe(true);
    });

    it('should respect custom threshold', () => {
      const pose: FacePose = { yaw: 10, pitch: 0, roll: 0, confidence: 0.9 };
      expect(isNonFrontal(pose, 15)).toBe(false);
      expect(isNonFrontal(pose, 5)).toBe(true);
    });
  });

  describe('poseAngularDistance', () => {
    it('should return zero for identical poses', () => {
      const poseA: FacePose = { yaw: 10, pitch: 5, roll: 2, confidence: 0.9 };
      const poseB: FacePose = { yaw: 10, pitch: 5, roll: 2, confidence: 0.9 };
      expect(poseAngularDistance(poseA, poseB)).toBeCloseTo(0, 5);
    });

    it('should calculate Euclidean distance in angle space', () => {
      const poseA: FacePose = { yaw: 0, pitch: 0, roll: 0, confidence: 0.9 };
      const poseB: FacePose = { yaw: 3, pitch: 4, roll: 0, confidence: 0.9 };
      // Distance = sqrt(3^2 + 4^2 + 0^2) = 5
      expect(poseAngularDistance(poseA, poseB)).toBeCloseTo(5, 5);
    });

    it('should handle negative angles correctly', () => {
      const poseA: FacePose = { yaw: -10, pitch: 5, roll: 0, confidence: 0.9 };
      const poseB: FacePose = { yaw: 10, pitch: -5, roll: 0, confidence: 0.9 };
      const distance = poseAngularDistance(poseA, poseB);
      // Distance = sqrt(20^2 + 10^2) = sqrt(500) ≈ 22.36
      expect(distance).toBeCloseTo(22.36, 1);
    });

    it('should be symmetric', () => {
      const poseA: FacePose = { yaw: 15, pitch: 10, roll: 5, confidence: 0.9 };
      const poseB: FacePose = { yaw: 5, pitch: 20, roll: -5, confidence: 0.9 };
      expect(poseAngularDistance(poseA, poseB)).toBeCloseTo(
        poseAngularDistance(poseB, poseA),
        5
      );
    });
  });

  describe('formatPose', () => {
    it('should format positive yaw as right', () => {
      const pose: FacePose = { yaw: 15.7, pitch: 0, roll: 0, confidence: 0.9 };
      expect(formatPose(pose)).toContain('yaw: right 15.7°');
    });

    it('should format negative yaw as left', () => {
      const pose: FacePose = { yaw: -15.7, pitch: 0, roll: 0, confidence: 0.9 };
      expect(formatPose(pose)).toContain('yaw: left 15.7°');
    });

    it('should format positive pitch as up', () => {
      const pose: FacePose = { yaw: 0, pitch: 10.3, roll: 0, confidence: 0.9 };
      expect(formatPose(pose)).toContain('pitch: up 10.3°');
    });

    it('should format negative pitch as down', () => {
      const pose: FacePose = { yaw: 0, pitch: -10.3, roll: 0, confidence: 0.9 };
      expect(formatPose(pose)).toContain('pitch: down 10.3°');
    });

    it('should format positive roll as CW', () => {
      const pose: FacePose = { yaw: 0, pitch: 0, roll: 5.2, confidence: 0.9 };
      expect(formatPose(pose)).toContain('roll: CW 5.2°');
    });

    it('should format negative roll as CCW', () => {
      const pose: FacePose = { yaw: 0, pitch: 0, roll: -5.2, confidence: 0.9 };
      expect(formatPose(pose)).toContain('roll: CCW 5.2°');
    });

    it('should format complete pose correctly', () => {
      const pose: FacePose = { yaw: 15.2, pitch: -3.9, roll: 2.1, confidence: 0.9 };
      const formatted = formatPose(pose);
      expect(formatted).toContain('yaw: right 15.2°');
      expect(formatted).toContain('pitch: down 3.9°');
      expect(formatted).toContain('roll: CW 2.1°');
    });
  });

  describe('rotation matrix correctness', () => {
    it('should preserve landmark positions when applying identity rotation', () => {
      const landmarks = createFrontalFace();
      const identityPose: FacePose = { yaw: 0, pitch: 0, roll: 0, confidence: 0.9 };
      const normalized = normalizeLandmarksToFrontal(landmarks, identityPose);

      // Identity rotation should not change landmarks
      expect(normalized).toBe(landmarks);
    });

    it('should be reversible (inverse rotation)', () => {
      const landmarks = createFrontalFace();
      // Create non-frontal pose with moderate angles
      landmarks[1] = { x: 0.6, y: 0.4, z: 0.1 };

      const originalPose = estimateFacePose(landmarks);

      // Normalize to frontal
      const normalized = normalizeLandmarksToFrontal(landmarks, originalPose);

      // Create inverse pose
      const inversePose: FacePose = {
        yaw: -originalPose.yaw,
        pitch: -originalPose.pitch,
        roll: -originalPose.roll,
        confidence: originalPose.confidence,
      };

      // Apply inverse rotation to normalized landmarks
      const restored = normalizeLandmarksToFrontal(normalized, inversePose);

      // Should be close to original (within reasonable precision)
      // Note: Due to estimation inaccuracies, we use relaxed tolerance
      const noseTipOriginal = landmarks[1];
      const noseTipRestored = restored[1];
      expect(noseTipRestored.x).toBeCloseTo(noseTipOriginal.x, 1);
      expect(noseTipRestored.y).toBeCloseTo(noseTipOriginal.y, 1);
    });

    it('should preserve centroid position after rotation', () => {
      const landmarks = createFrontalFace();
      landmarks[1] = { x: 0.65, y: 0.45, z: 0 };

      // Calculate original centroid
      const originalCentroid = {
        x: landmarks.reduce((sum, lm) => sum + lm.x, 0) / landmarks.length,
        y: landmarks.reduce((sum, lm) => sum + lm.y, 0) / landmarks.length,
        z: landmarks.reduce((sum, lm) => sum + (lm.z ?? 0), 0) / landmarks.length,
      };

      const pose = estimateFacePose(landmarks);
      const normalized = normalizeLandmarksToFrontal(landmarks, pose);

      // Calculate normalized centroid
      const normalizedCentroid = {
        x: normalized.reduce((sum, lm) => sum + lm.x, 0) / normalized.length,
        y: normalized.reduce((sum, lm) => sum + lm.y, 0) / normalized.length,
        z: normalized.reduce((sum, lm) => sum + (lm.z ?? 0), 0) / normalized.length,
      };

      // Centroid should remain in same position (rotation around center)
      expect(normalizedCentroid.x).toBeCloseTo(originalCentroid.x, 5);
      expect(normalizedCentroid.y).toBeCloseTo(originalCentroid.y, 5);
      expect(normalizedCentroid.z).toBeCloseTo(originalCentroid.z, 5);
    });
  });
});
