// Diagnostic test to understand brow shape measurement
import { describe, it, expect } from 'vitest';
import { createCanonicalLandmarks } from './fixtures/canonical-face';
import { extractBrowMeasurements, extractEyeMeasurements } from '@/lib/feature-axes';

const LEFT_EYE_CENTER_INDICES = [33, 133, 159, 145];
const RIGHT_EYE_CENTER_INDICES = [362, 263, 386, 374];

const LEFT_EYEBROW_INDICES = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
const RIGHT_EYEBROW_INDICES = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];

function centroid(points: Array<{ x: number; y: number; z?: number }>) {
  const n = points.length || 1;
  let sumX = 0, sumY = 0, sumZ = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumZ += p.z ?? 0;
  }
  return { x: sumX / n, y: sumY / n, z: sumZ / n };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

describe('Brow Shape Diagnostic', () => {
  it('should analyze brow landmark positions and shape calculation', () => {
    const landmarks = createCanonicalLandmarks();

    // Compute eye centers
    const leftEyePoints = LEFT_EYE_CENTER_INDICES.map(i => landmarks[i]);
    const rightEyePoints = RIGHT_EYE_CENTER_INDICES.map(i => landmarks[i]);
    const leftEye = centroid(leftEyePoints);
    const rightEye = centroid(rightEyePoints);

    console.log('\n=== Brow Shape Diagnostic ===\n');

    // Extract brow measurements using actual implementation
    const browMeasurements = extractBrowMeasurements(landmarks, leftEye, rightEye);
    console.log('Brow measurements from extractBrowMeasurements():');
    console.log(`  Shape: ${browMeasurements.shape.toFixed(6)}`);
    console.log(`  Position: ${browMeasurements.position.toFixed(6)}`);
    console.log(`  Length: ${browMeasurements.length.toFixed(6)}`);
    console.log(`  Left shape: ${browMeasurements.leftShape?.toFixed(6)}`);
    console.log(`  Right shape: ${browMeasurements.rightShape?.toFixed(6)}`);
    console.log('');

    // Manual calculation to understand the formula
    console.log('=== Left Brow Analysis ===');

    // Print all left brow landmark positions
    console.log('Left brow landmarks (from inner to outer):');
    LEFT_EYEBROW_INDICES.forEach((idx, i) => {
      const pt = landmarks[idx];
      console.log(`  [${i}] Landmark ${idx}: (${pt.x.toFixed(4)}, ${pt.y.toFixed(4)})`);
    });
    console.log('');

    // Compute regions used in measurement
    const leftBrowInner = centroid([landmarks[70], landmarks[63], landmarks[105]]);
    const leftBrowMid = centroid([landmarks[66], landmarks[107], landmarks[55]]);
    const leftBrowOuter = centroid([landmarks[65], landmarks[52], landmarks[53], landmarks[46]]);

    console.log('Regional centroids:');
    console.log(`  Inner (70,63,105): (${leftBrowInner.x.toFixed(4)}, ${leftBrowInner.y.toFixed(4)})`);
    console.log(`  Mid (66,107,55): (${leftBrowMid.x.toFixed(4)}, ${leftBrowMid.y.toFixed(4)})`);
    console.log(`  Outer (65,52,53,46): (${leftBrowOuter.x.toFixed(4)}, ${leftBrowOuter.y.toFixed(4)})`);
    console.log('');

    // Compute shape metrics
    const leftBrowWidth = distance(leftBrowInner, leftBrowOuter);
    const leftBaselineY = (leftBrowInner.y + leftBrowOuter.y) / 2;

    console.log('Shape calculation:');
    console.log(`  Brow width (inner to outer): ${leftBrowWidth.toFixed(6)}`);
    console.log(`  Baseline Y (avg of inner/outer): ${leftBaselineY.toFixed(6)}`);
    console.log(`  Mid Y: ${leftBrowMid.y.toFixed(6)}`);
    console.log(`  Mid - Baseline: ${(leftBrowMid.y - leftBaselineY).toFixed(6)}`);
    console.log(`  Baseline - Mid (corrected): ${(leftBaselineY - leftBrowMid.y).toFixed(6)}`);

    const currentArcHeight = Math.abs(leftBrowMid.y - leftBaselineY);
    const correctedArcHeight = leftBaselineY - leftBrowMid.y;

    console.log(`  Arc height (current abs): ${currentArcHeight.toFixed(6)}`);
    console.log(`  Arc height (corrected sign): ${correctedArcHeight.toFixed(6)}`);
    console.log(`  Shape ratio (current): ${(currentArcHeight / leftBrowWidth).toFixed(6)}`);
    console.log(`  Shape ratio (corrected): ${(correctedArcHeight / leftBrowWidth).toFixed(6)}`);
    console.log('');

    console.log('Interpretation (Y increases downward in screen coords):');
    if (correctedArcHeight > 0) {
      console.log(`  ✓ Mid is ABOVE baseline (smaller Y) → ARCHED brow`);
    } else if (correctedArcHeight < 0) {
      console.log(`  ✗ Mid is BELOW baseline (larger Y) → INVERSE/DROOPING brow`);
    } else {
      console.log(`  = Mid is AT baseline → STRAIGHT brow`);
    }
    console.log('');

    // Find actual peak (highest point = smallest Y)
    console.log('Finding actual peak (smallest Y):');
    let peakIdx = LEFT_EYEBROW_INDICES[0];
    let peakY = landmarks[peakIdx].y;

    LEFT_EYEBROW_INDICES.forEach(idx => {
      const pt = landmarks[idx];
      if (pt.y < peakY) {
        peakY = pt.y;
        peakIdx = idx;
      }
    });

    const peakPt = landmarks[peakIdx];
    console.log(`  Actual peak: Landmark ${peakIdx} at Y=${peakY.toFixed(6)}`);
    console.log(`  Peak vs baseline: ${(leftBaselineY - peakY).toFixed(6)}`);
    console.log(`  Peak vs mid: ${(leftBrowMid.y - peakY).toFixed(6)}`);
    console.log('');

    // Classification thresholds
    console.log('Classification thresholds:');
    console.log('  > 0.15 = arched');
    console.log('  0.08-0.15 = moderate');
    console.log('  < 0.08 = straight');
    console.log('');

    // This test is just diagnostic
    expect(browMeasurements.shape).toBeGreaterThanOrEqual(0);
  });
});
