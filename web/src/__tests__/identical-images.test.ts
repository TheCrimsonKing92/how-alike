/**
 * Test for identical image stability
 *
 * Verifies that comparing the same image twice produces consistent 100% scores.
 */

import { describe, it, expect } from 'vitest';
import { estimateFacePose, normalizeLandmarksToFrontal } from '@/lib/pose-estimation';
import { fromKeypoints, eyeCenterFromIndices, normalizeByEyes, summarizeRegionsProcrustes } from '@/lib/geometry';
import { REGION_INDICES, LEFT_EYE_CENTER_INDICES, RIGHT_EYE_CENTER_INDICES } from '@/lib/regions';
import type { Point3D } from '@/lib/points';

describe('Identical image comparison stability', () => {
  it('should produce 100% scores when comparing identical landmarks', () => {
    // Simulate identical landmarks (simple face shape)
    const landmarks: Point3D[] = Array.from({ length: 468 }, (_, i) => ({
      x: 0.5 + 0.1 * Math.cos(i / 468 * Math.PI * 2),
      y: 0.5 + 0.1 * Math.sin(i / 468 * Math.PI * 2),
      z: 0,
    }));

    // Add some structure to key landmarks
    landmarks[1] = { x: 0.5, y: 0.6, z: 0.02 }; // nose tip
    landmarks[6] = { x: 0.5, y: 0.4, z: -0.01 }; // nose bridge
    landmarks[152] = { x: 0.5, y: 0.8, z: 0 }; // chin
    landmarks[234] = { x: 0.3, y: 0.5, z: -0.02 }; // left cheek
    landmarks[454] = { x: 0.7, y: 0.5, z: -0.02 }; // right cheek

    // Estimate pose for identical landmarks
    const poseA = estimateFacePose(landmarks);
    const poseB = estimateFacePose(landmarks);

    console.log('Pose A:', poseA);
    console.log('Pose B:', poseB);

    // Normalize both
    const normalizedA = normalizeLandmarksToFrontal(landmarks, poseA);
    const normalizedB = normalizeLandmarksToFrontal(landmarks, poseB);

    // Convert to 2D points
    const ptsA = fromKeypoints(normalizedA);
    const ptsB = fromKeypoints(normalizedB);

    // Extract eye centers
    const leftA = eyeCenterFromIndices(ptsA, LEFT_EYE_CENTER_INDICES);
    const rightA = eyeCenterFromIndices(ptsA, RIGHT_EYE_CENTER_INDICES);
    const leftB = eyeCenterFromIndices(ptsB, LEFT_EYE_CENTER_INDICES);
    const rightB = eyeCenterFromIndices(ptsB, RIGHT_EYE_CENTER_INDICES);

    // Normalize by eyes
    const nA = normalizeByEyes(ptsA, leftA, rightA);
    const nB = normalizeByEyes(ptsB, leftB, rightB);

    // Compare regions
    const { scores, overall } = summarizeRegionsProcrustes(nA, nB, REGION_INDICES);

    console.log('Overall score:', overall);
    console.log('Region scores:', scores);

    // For identical images, all scores should be 100% (or very close due to floating point)
    expect(overall).toBeGreaterThan(0.99);

    // Check eyes specifically
    const eyesScore = scores.find(s => s.region === 'eyes');
    expect(eyesScore).toBeDefined();
    expect(eyesScore!.score).toBeGreaterThan(0.99);
  });

  it('should handle small landmark perturbations gracefully', () => {
    // Create base landmarks
    const baseLandmarks: Point3D[] = Array.from({ length: 468 }, (_, i) => ({
      x: 0.5 + 0.1 * Math.cos(i / 468 * Math.PI * 2),
      y: 0.5 + 0.1 * Math.sin(i / 468 * Math.PI * 2),
      z: 0,
    }));

    baseLandmarks[1] = { x: 0.5, y: 0.6, z: 0.02 };
    baseLandmarks[6] = { x: 0.5, y: 0.4, z: -0.01 };
    baseLandmarks[152] = { x: 0.5, y: 0.8, z: 0 };
    baseLandmarks[234] = { x: 0.3, y: 0.5, z: -0.02 };
    baseLandmarks[454] = { x: 0.7, y: 0.5, z: -0.02 };

    // Create slightly perturbed version (simulating MediaPipe variability)
    const perturbedLandmarks: Point3D[] = baseLandmarks.map(pt => ({
      x: pt.x + (Math.random() - 0.5) * 0.0001, // ±0.005% perturbation
      y: pt.y + (Math.random() - 0.5) * 0.0001,
      z: (pt.z ?? 0) + (Math.random() - 0.5) * 0.0001,
    }));

    // Process both
    const poseA = estimateFacePose(baseLandmarks);
    const poseB = estimateFacePose(perturbedLandmarks);

    console.log('Base pose:', poseA);
    console.log('Perturbed pose:', poseB);
    console.log('Pose difference:', {
      yaw: Math.abs(poseA.yaw - poseB.yaw),
      pitch: Math.abs(poseA.pitch - poseB.pitch),
      roll: Math.abs(poseA.roll - poseB.roll),
    });

    const normalizedA = normalizeLandmarksToFrontal(baseLandmarks, poseA);
    const normalizedB = normalizeLandmarksToFrontal(perturbedLandmarks, poseB);

    const ptsA = fromKeypoints(normalizedA);
    const ptsB = fromKeypoints(normalizedB);

    const leftA = eyeCenterFromIndices(ptsA, LEFT_EYE_CENTER_INDICES);
    const rightA = eyeCenterFromIndices(ptsA, RIGHT_EYE_CENTER_INDICES);
    const leftB = eyeCenterFromIndices(ptsB, LEFT_EYE_CENTER_INDICES);
    const rightB = eyeCenterFromIndices(ptsB, RIGHT_EYE_CENTER_INDICES);

    const nA = normalizeByEyes(ptsA, leftA, rightA);
    const nB = normalizeByEyes(ptsB, leftB, rightB);

    const { scores, overall } = summarizeRegionsProcrustes(nA, nB, REGION_INDICES);

    console.log('Overall score with perturbation:', overall);
    console.log('Eye score with perturbation:', scores.find(s => s.region === 'eyes')?.score);

    // Small perturbations should still yield very high similarity
    expect(overall).toBeGreaterThan(0.95);
  });
});
