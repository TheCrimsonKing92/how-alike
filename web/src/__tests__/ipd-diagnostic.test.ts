// Diagnostic test to check IPD calculation vs face width
import { describe, it, expect } from 'vitest';
import { createCanonicalLandmarks } from './fixtures/canonical-face';

// Eye center indices (from regions.ts)
const LEFT_EYE_CENTER_INDICES = [33, 133, 159, 145];
const RIGHT_EYE_CENTER_INDICES = [362, 263, 386, 374];

// Gonion indices (jaw angles, from feature-axes.ts)
const LEFT_GONION = 234;
const RIGHT_GONION = 454;

function centroid(points: Array<{ x: number; y: number }>) {
  const n = points.length || 1;
  let sumX = 0, sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  return { x: sumX / n, y: sumY / n };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

describe('IPD Diagnostic', () => {
  it('should report IPD ratio and classification for canonical face', () => {
    const landmarks = createCanonicalLandmarks();

    // Compute eye centers
    const leftEyePoints = LEFT_EYE_CENTER_INDICES.map(i => landmarks[i]);
    const rightEyePoints = RIGHT_EYE_CENTER_INDICES.map(i => landmarks[i]);

    const leftEye = centroid(leftEyePoints);
    const rightEye = centroid(rightEyePoints);

    const ipd = distance(leftEye, rightEye);

    // Compute face width (gonion distance)
    const leftGonion = landmarks[LEFT_GONION];
    const rightGonion = landmarks[RIGHT_GONION];
    const faceWidth = distance(leftGonion, rightGonion);

    // Compute ratio
    const ipdRatio = ipd / faceWidth;

    console.log('\n=== IPD Diagnostic ===');
    console.log(`Left eye center: (${leftEye.x.toFixed(4)}, ${leftEye.y.toFixed(4)})`);
    console.log(`Right eye center: (${rightEye.x.toFixed(4)}, ${rightEye.y.toFixed(4)})`);
    console.log(`IPD: ${ipd.toFixed(6)}`);
    console.log('');
    console.log(`Left gonion (${LEFT_GONION}): (${leftGonion.x.toFixed(4)}, ${leftGonion.y.toFixed(4)})`);
    console.log(`Right gonion (${RIGHT_GONION}): (${rightGonion.x.toFixed(4)}, ${rightGonion.y.toFixed(4)})`);
    console.log(`Face width (gonion): ${faceWidth.toFixed(6)}`);
    console.log('');
    console.log(`IPD / Face Width Ratio: ${ipdRatio.toFixed(6)}`);
    console.log('');
    console.log('Classification thresholds:');
    console.log('  > 0.42 = wide-set');
    console.log('  0.38-0.42 = balanced');
    console.log('  < 0.38 = close-set');
    console.log('');
    console.log(`Current classification: ${ipdRatio > 0.42 ? 'WIDE-SET' : ipdRatio < 0.38 ? 'CLOSE-SET' : 'BALANCED'}`);
    console.log('');

    // Check alternative widths
    console.log('=== Alternative Width Measurements ===');

    const landmarks_to_check = [
      { name: 'Outer eye corners', left: 33, right: 263 },
      { name: 'Inner eye corners', left: 133, right: 362 },
      { name: 'Mid-cheek', left: 116, right: 345 },
      { name: 'Jawline mid', left: 187, right: 411 },
      { name: 'Chin sides', left: 150, right: 379 },
    ];

    for (const { name, left, right } of landmarks_to_check) {
      const leftPt = landmarks[left];
      const rightPt = landmarks[right];
      if (leftPt && rightPt) {
        const width = distance(leftPt, rightPt);
        const ratio = ipd / width;
        console.log(`${name} (${left}/${right}): width=${width.toFixed(6)}, ratio=${ratio.toFixed(6)} ${ratio > 0.42 ? '[WIDE-SET]' : ratio < 0.38 ? '[CLOSE-SET]' : '[BALANCED]'}`);
      }
    }

    console.log('\n');

    // This test always passes - it's just for diagnostics
    expect(ipdRatio).toBeGreaterThan(0);
  });
});
