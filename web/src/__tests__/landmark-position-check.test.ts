// Check what landmarks 234, 454, 116, 345 actually represent
import { describe, it, expect } from 'vitest';
import { createCanonicalLandmarks } from './fixtures/canonical-face';

describe('Landmark Position Check', () => {
  it('should show positions of candidate face width landmarks', () => {
    const landmarks = createCanonicalLandmarks();

    console.log('\n=== Landmark Position Analysis ===\n');

    // Check the landmarks we're considering for face width
    const candidates = [
      { indices: [234, 454], name: 'Gonion (current jaw angle)' },
      { indices: [116, 345], name: 'Mid-cheek (proposed bizygomatic)' },
      { indices: [50, 280], name: 'Upper cheek / zygomatic region' },
      { indices: [205, 425], name: 'Lower face region' },
      { indices: [132, 361], name: 'Lateral orbital region' },
    ];

    for (const { indices, name } of candidates) {
      const [left, right] = indices;
      const leftPt = landmarks[left];
      const rightPt = landmarks[right];

      if (leftPt && rightPt) {
        const width = Math.hypot(rightPt.x - leftPt.x, rightPt.y - leftPt.y);
        const avgY = (leftPt.y + rightPt.y) / 2;

        console.log(`${name}:`);
        console.log(`  Landmarks: ${left} / ${right}`);
        console.log(`  Left:  (${leftPt.x.toFixed(4)}, ${leftPt.y.toFixed(4)})`);
        console.log(`  Right: (${rightPt.x.toFixed(4)}, ${rightPt.y.toFixed(4)})`);
        console.log(`  Width: ${width.toFixed(6)}`);
        console.log(`  Avg Y: ${avgY.toFixed(4)} (lower Y = higher on face)`);
        console.log('');
      }
    }

    console.log('Reference points for vertical position:');
    console.log(`  Eyes (avg Y): ${((landmarks[33].y + landmarks[263].y) / 2).toFixed(4)}`);
    console.log(`  Nose tip (1): ${landmarks[1].y.toFixed(4)}`);
    console.log(`  Chin (152): ${landmarks[152].y.toFixed(4)}`);
    console.log('');

    console.log('Interpretation:');
    console.log('  - Y increases downward in screen coordinates');
    console.log('  - Bizygomatic (cheekbone) width should be at or above nose level');
    console.log('  - Gonion (jaw angle) should be below nose, above chin');
    console.log('  - Widest point is typically at cheekbones, not jaw');
    console.log('');

    expect(true).toBe(true); // Just diagnostic
  });
});
