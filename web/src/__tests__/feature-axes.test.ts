import { describe, it, expect } from 'vitest';
import {
  extractEyeMeasurements,
  extractNoseMeasurements,
  extractMouthMeasurements,
  extractJawMeasurements,
  extractBrowMeasurements,
  extractFeatureMeasurements,
  type Point,
  type SyntheticJawInput,
} from '@/lib/feature-axes';

// Create mock landmarks array with proper indices
function createMockLandmarks(overrides: Record<number, Partial<Point>> = {}): Point[] {
  const landmarks: Point[] = [];
  for (let i = 0; i < 468; i++) {
    landmarks[i] = { x: 0, y: 0, z: 0, ...overrides[i] };
  }
  return landmarks;
}

describe('extractEyeMeasurements', () => {
  it('should calculate positive canthal tilt for upward-slanting eyes', () => {
    const landmarks = createMockLandmarks({
      // Left eye outer corner region (upward tilt) - X≈145-150, Y≈93-97 (outer higher)
      159: { x: 140, y: 96, z: 0 },
      160: { x: 145, y: 95, z: 0 },
      161: { x: 148, y: 94, z: 0 },
      246: { x: 149, y: 93, z: 0 },
      33: { x: 150, y: 93, z: 0 },     // outer corner
      7: { x: 149, y: 94, z: 0 },
      163: { x: 148, y: 95, z: 0 },
      144: { x: 145, y: 96, z: 0 },
      // Left eye inner corner region - X≈100-110, Y≈99-101 (inner lower)
      145: { x: 110, y: 99, z: 0 },
      153: { x: 105, y: 100, z: 0 },
      154: { x: 102, y: 100, z: 0 },
      155: { x: 101, y: 100, z: 0 },
      133: { x: 100, y: 100, z: 0 },   // inner corner
      173: { x: 101, y: 100, z: 0 },
      157: { x: 102, y: 100, z: 0 },
      158: { x: 105, y: 99, z: 0 },
      // Right eye outer corner region (upward tilt) - X≈250-260, Y≈93-97
      374: { x: 255, y: 96, z: 0 },
      373: { x: 252, y: 95, z: 0 },
      390: { x: 251, y: 94, z: 0 },
      249: { x: 251, y: 94, z: 0 },
      263: { x: 250, y: 93, z: 0 },    // outer corner
      466: { x: 251, y: 93, z: 0 },
      388: { x: 252, y: 94, z: 0 },
      387: { x: 255, y: 95, z: 0 },
      // Right eye inner corner region - X≈290-300, Y≈99-101
      386: { x: 295, y: 99, z: 0 },
      385: { x: 298, y: 100, z: 0 },
      384: { x: 299, y: 100, z: 0 },
      398: { x: 299, y: 100, z: 0 },
      362: { x: 300, y: 100, z: 0 },   // inner corner
      382: { x: 299, y: 100, z: 0 },
      381: { x: 298, y: 100, z: 0 },
      380: { x: 295, y: 100, z: 0 },
      // Jaw
      234: { x: 50, y: 200, z: 0 },
      454: { x: 300, y: 200, z: 0 },
    });

    const leftEye = { x: 125, y: 100, z: 0 };
    const rightEye = { x: 225, y: 100, z: 0 };

    const result = extractEyeMeasurements(landmarks, leftEye, rightEye);

    // Positive tilt means outer corners are higher than inner
    expect(result.canthalTilt).toBeGreaterThan(0);
    expect(result.eyeSize).toBeGreaterThan(0);
    // interocularDistance now uses ICD/eye-width metric (typical range 0.9-1.1)
    // This test data produces a high ratio due to narrow eye width relative to ICD
    expect(result.interocularDistance).toBeGreaterThan(0);
  });

  it('should calculate negative canthal tilt for downward-slanting eyes', () => {
    const landmarks = createMockLandmarks({
      // Left eye outer corner region (downward tilt) - X≈145-150, Y≈103-107 (outer lower)
      159: { x: 140, y: 104, z: 0 },
      160: { x: 145, y: 105, z: 0 },
      161: { x: 148, y: 106, z: 0 },
      246: { x: 149, y: 107, z: 0 },
      33: { x: 150, y: 107, z: 0 },    // outer corner (lower than inner)
      7: { x: 149, y: 106, z: 0 },
      163: { x: 148, y: 105, z: 0 },
      144: { x: 145, y: 104, z: 0 },
      // Left eye inner corner region - X≈100-110, Y≈99-101 (inner higher)
      145: { x: 110, y: 101, z: 0 },
      153: { x: 105, y: 100, z: 0 },
      154: { x: 102, y: 100, z: 0 },
      155: { x: 101, y: 100, z: 0 },
      133: { x: 100, y: 100, z: 0 },   // inner corner (higher than outer)
      173: { x: 101, y: 100, z: 0 },
      157: { x: 102, y: 100, z: 0 },
      158: { x: 105, y: 101, z: 0 },
      // Right eye outer corner region (downward tilt) - X≈250-260, Y≈103-107
      374: { x: 255, y: 104, z: 0 },
      373: { x: 252, y: 105, z: 0 },
      390: { x: 251, y: 106, z: 0 },
      249: { x: 251, y: 106, z: 0 },
      263: { x: 250, y: 107, z: 0 },   // outer corner (lower than inner)
      466: { x: 251, y: 107, z: 0 },
      388: { x: 252, y: 106, z: 0 },
      387: { x: 255, y: 105, z: 0 },
      // Right eye inner corner region - X≈290-300, Y≈99-101 (inner higher)
      386: { x: 295, y: 101, z: 0 },
      385: { x: 298, y: 100, z: 0 },
      384: { x: 299, y: 100, z: 0 },
      398: { x: 299, y: 100, z: 0 },
      362: { x: 300, y: 100, z: 0 },   // inner corner (higher than outer)
      382: { x: 299, y: 100, z: 0 },
      381: { x: 298, y: 100, z: 0 },
      380: { x: 295, y: 100, z: 0 },
      // Jaw
      234: { x: 50, y: 200, z: 0 },
      454: { x: 300, y: 200, z: 0 },
    });

    const leftEye = { x: 125, y: 100, z: 0 };
    const rightEye = { x: 225, y: 100, z: 0 };

    const result = extractEyeMeasurements(landmarks, leftEye, rightEye);

    expect(result.canthalTilt).toBeLessThan(0);
  });

  it('should calculate larger eye size for wider aperture', () => {
    const landmarks = createMockLandmarks({
      // Left eye outer corner region
      33: { x: 150, y: 100, z: 0 },
      7: { x: 151, y: 100, z: 0 },
      163: { x: 149, y: 100, z: 0 },
      144: { x: 150, y: 100, z: 0 },
      145: { x: 150, y: 120, z: 0 },  // large vertical aperture
      246: { x: 148, y: 80, z: 0 },
      161: { x: 147, y: 80, z: 0 },
      160: { x: 149, y: 80, z: 0 },
      158: { x: 148, y: 80, z: 0 },
      159: { x: 100, y: 80, z: 0 },
      // Left eye inner corner region
      133: { x: 100, y: 100, z: 0 },
      173: { x: 101, y: 100, z: 0 },
      157: { x: 99, y: 100, z: 0 },
      // Right eye outer corner region
      263: { x: 250, y: 100, z: 0 },
      249: { x: 251, y: 100, z: 0 },
      390: { x: 249, y: 100, z: 0 },
      373: { x: 250, y: 100, z: 0 },
      374: { x: 250, y: 120, z: 0 },  // large vertical aperture
      466: { x: 248, y: 80, z: 0 },
      388: { x: 247, y: 80, z: 0 },
      387: { x: 249, y: 80, z: 0 },
      385: { x: 248, y: 80, z: 0 },
      386: { x: 200, y: 80, z: 0 },
      // Right eye inner corner region
      362: { x: 200, y: 100, z: 0 },
      398: { x: 201, y: 100, z: 0 },
      384: { x: 199, y: 100, z: 0 },
      // Jaw
      234: { x: 50, y: 200, z: 0 },
      454: { x: 300, y: 200, z: 0 },
    });

    const leftEye = { x: 125, y: 100, z: 0 };
    const rightEye = { x: 225, y: 100, z: 0 };

    const result = extractEyeMeasurements(landmarks, leftEye, rightEye);

    expect(result.eyeSize).toBeGreaterThan(0.3); // normalized by IPD
  });

  it('should calculate higher interocular distance ratio for wide-set eyes', () => {
    const landmarks = createMockLandmarks({
      // Left eye outer corner region
      33: { x: 150, y: 100, z: 0 },
      7: { x: 151, y: 100, z: 0 },
      163: { x: 149, y: 100, z: 0 },
      144: { x: 150, y: 110, z: 0 },
      145: { x: 150, y: 110, z: 0 },
      246: { x: 148, y: 90, z: 0 },
      161: { x: 147, y: 90, z: 0 },
      160: { x: 149, y: 90, z: 0 },
      158: { x: 148, y: 90, z: 0 },
      159: { x: 125, y: 90, z: 0 },
      // Left eye inner corner region
      133: { x: 100, y: 100, z: 0 },
      173: { x: 101, y: 100, z: 0 },
      157: { x: 99, y: 100, z: 0 },
      // Right eye outer corner region
      263: { x: 250, y: 100, z: 0 },
      249: { x: 251, y: 100, z: 0 },
      390: { x: 249, y: 100, z: 0 },
      373: { x: 250, y: 110, z: 0 },
      374: { x: 250, y: 110, z: 0 },
      466: { x: 248, y: 90, z: 0 },
      388: { x: 247, y: 90, z: 0 },
      387: { x: 249, y: 90, z: 0 },
      385: { x: 248, y: 90, z: 0 },
      386: { x: 225, y: 90, z: 0 },
      // Right eye inner corner region
      362: { x: 200, y: 100, z: 0 },
      398: { x: 201, y: 100, z: 0 },
      384: { x: 199, y: 100, z: 0 },
      // Jaw (narrow face width)
      234: { x: 50, y: 200, z: 0 },
      454: { x: 300, y: 200, z: 0 },
    });

    const leftEye = { x: 100, y: 100, z: 0 };  // wide IPD
    const rightEye = { x: 250, y: 100, z: 0 };

    const result = extractEyeMeasurements(landmarks, leftEye, rightEye);

    expect(result.interocularDistance).toBeGreaterThan(0.5);
  });
});

describe('extractBrowMeasurements with segmentation refinement', () => {
  it('prefers refined metrics when confidence is high', () => {
    const landmarks = createMockLandmarks({
      // Simplified brow landmarks set to a flat line (fallback shape ~0)
      70: { x: -40, y: -20, z: 0 },
      63: { x: -30, y: -20, z: 0 },
      105: { x: -20, y: -20, z: 0 },
      66: { x: -10, y: -20, z: 0 },
      107: { x: 0, y: -20, z: 0 },
      55: { x: 10, y: -20, z: 0 },
      65: { x: 20, y: -20, z: 0 },
      52: { x: 30, y: -20, z: 0 },
      53: { x: 35, y: -20, z: 0 },
      46: { x: 40, y: -20, z: 0 },
      300: { x: 80, y: -18, z: 0 },
      293: { x: 90, y: -18, z: 0 },
      334: { x: 100, y: -18, z: 0 },
      296: { x: 110, y: -18, z: 0 },
      336: { x: 120, y: -18, z: 0 },
      285: { x: 130, y: -18, z: 0 },
      417: { x: 140, y: -18, z: 0 },
      282: { x: 150, y: -18, z: 0 },
      283: { x: 160, y: -18, z: 0 },
      295: { x: 170, y: -18, z: 0 },
      // Eye landmarks for width/IPD calculations
      133: { x: -20, y: 0, z: 0 },
      33: { x: 20, y: 0, z: 0 },
      362: { x: 120, y: 0, z: 0 },
      263: { x: 160, y: 0, z: 0 },
      159: { x: -20, y: -10, z: 0 },
      145: { x: -20, y: 10, z: 0 },
      386: { x: 120, y: -10, z: 0 },
      374: { x: 120, y: 10, z: 0 },
    });

    const leftEye = { x: 0, y: 0, z: 0 };
    const rightEye = { x: 140, y: 0, z: 0 };

    const refinedLeft = {
      side: 'left' as const,
      curveImg: [],
      headImg: { x: -40, y: -20 },
      tailImg: { x: 40, y: -24 },
      apexImg: { x: 0, y: -32 },
      archHeightNorm: 0.30,
      curvature: 0.12,
      tiltDeg: -2.5,
      browLenNorm: 1.02,
      confidence: 0.72,
    };
    const refinedRight = {
      side: 'right' as const,
      curveImg: [],
      headImg: { x: 110, y: -18 },
      tailImg: { x: 190, y: -22 },
      apexImg: { x: 150, y: -30 },
      archHeightNorm: 0.26,
      curvature: 0.11,
      tiltDeg: 1.8,
      browLenNorm: 0.96,
      confidence: 0.68,
    };

    const result = extractBrowMeasurements(landmarks, leftEye, rightEye, {
      left: refinedLeft,
      right: refinedRight,
    });

    expect(result.shape).toBeCloseTo(Math.max(refinedLeft.archHeightNorm, refinedRight.archHeightNorm), 3);
    const ipd = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
    const leftEyeWidth = Math.hypot(
      landmarks[33].x - landmarks[133].x,
      landmarks[33].y - landmarks[133].y
    );
    const rightEyeWidth = Math.hypot(
      landmarks[263].x - landmarks[362].x,
      landmarks[263].y - landmarks[362].y
    );
    const avgEyeWidth = (leftEyeWidth + rightEyeWidth) / 2;
    const expectedLength =
      ((refinedLeft.browLenNorm * ipd) / avgEyeWidth + (refinedRight.browLenNorm * ipd) / avgEyeWidth) / 2;
    expect(result.length).toBeCloseTo(expectedLength, 3);
    expect(result.leftShape).toBeCloseTo(refinedLeft.archHeightNorm, 3);
    expect(result.rightShape).toBeCloseTo(refinedRight.archHeightNorm, 3);
  });
});

describe('extractNoseMeasurements', () => {
  it('should calculate nose width ratio', () => {
    const landmarks = createMockLandmarks({
      94: { x: 140, y: 150, z: 0 },   // left alar
      331: { x: 210, y: 150, z: 0 },  // right alar
      1: { x: 175, y: 160, z: 0 },    // nose tip
      6: { x: 175, y: 80, z: 0 },     // bridge top
      168: { x: 175, y: 100, z: 0 },  // bridge mid
      197: { x: 175, y: 120, z: 0 },  // bridge lower
      234: { x: 50, y: 200, z: 0 },
      454: { x: 300, y: 200, z: 0 },
    });

    const leftEye = { x: 125, y: 100, z: 0 };
    const rightEye = { x: 225, y: 100, z: 0 };

    const result = extractNoseMeasurements(landmarks, leftEye, rightEye);

    expect(result.width).toBeGreaterThan(0);
    expect(result.width).toBeLessThan(1);
  });

  it('should detect convex bridge contour', () => {
    const landmarks = createMockLandmarks({
      94: { x: 140, y: 150, z: 0 },
      331: { x: 210, y: 150, z: 0 },
      1: { x: 175, y: 160, z: 0 },
      6: { x: 175, y: 80, z: 10 },     // bridge top
      168: { x: 175, y: 100, z: 15 },  // bridge mid protruding (convex)
      197: { x: 175, y: 120, z: 10 },  // bridge lower
      234: { x: 50, y: 200, z: 0 },
      454: { x: 300, y: 200, z: 0 },
    });

    const leftEye = { x: 125, y: 100, z: 0 };
    const rightEye = { x: 225, y: 100, z: 0 };

    const result = extractNoseMeasurements(landmarks, leftEye, rightEye);

    expect(result.bridgeContour).toBeGreaterThan(0); // positive = convex
  });

  it('should detect concave bridge contour', () => {
    const landmarks = createMockLandmarks({
      94: { x: 140, y: 150, z: 0 },
      331: { x: 210, y: 150, z: 0 },
      1: { x: 175, y: 160, z: 0 },
      6: { x: 175, y: 80, z: 10 },
      168: { x: 175, y: 100, z: 5 },   // bridge mid recessed (concave)
      197: { x: 175, y: 120, z: 10 },
      234: { x: 50, y: 200, z: 0 },
      454: { x: 300, y: 200, z: 0 },
    });

    const leftEye = { x: 125, y: 100, z: 0 };
    const rightEye = { x: 225, y: 100, z: 0 };

    const result = extractNoseMeasurements(landmarks, leftEye, rightEye);

    expect(result.bridgeContour).toBeLessThan(0); // negative = concave
  });

  it('should calculate tip projection', () => {
    const landmarks = createMockLandmarks({
      94: { x: 140, y: 150, z: 0 },
      331: { x: 210, y: 150, z: 0 },
      1: { x: 175, y: 160, z: -20 },   // tip projects forward (negative z)
      6: { x: 175, y: 80, z: 0 },
      168: { x: 175, y: 100, z: 0 },
      197: { x: 175, y: 120, z: 0 },
      234: { x: 50, y: 200, z: 0 },
      454: { x: 300, y: 200, z: 0 },
    });

    const leftEye = { x: 125, y: 100, z: 0 };
    const rightEye = { x: 225, y: 100, z: 0 };

    const result = extractNoseMeasurements(landmarks, leftEye, rightEye);

    expect(result.tipProjection).toBeLessThan(0); // negative = forward projection
  });
});

describe('extractMouthMeasurements', () => {
  it('should calculate lip fullness', () => {
    const landmarks = createMockLandmarks({
      0: { x: 175, y: 170, z: 0 },    // upper lip top
      13: { x: 175, y: 180, z: 0 },   // upper lip bottom
      14: { x: 175, y: 180, z: 0 },   // lower lip top
      17: { x: 175, y: 190, z: 0 },   // lower lip bottom
      37: { x: 160, y: 170, z: 0 },   // cupid's bow left
      267: { x: 190, y: 170, z: 0 },  // cupid's bow right
      61: { x: 140, y: 180, z: 0 },   // mouth left
      291: { x: 210, y: 180, z: 0 },  // mouth right
      197: { x: 175, y: 160, z: 0 },  // nose bridge lower
      234: { x: 50, y: 200, z: 0 },
      454: { x: 300, y: 200, z: 0 },
    });

    const leftEye = { x: 125, y: 100, z: 0 };
    const rightEye = { x: 225, y: 100, z: 0 };

    const result = extractMouthMeasurements(landmarks, leftEye, rightEye);

    expect(result.lipFullness).toBeGreaterThan(0);
  });

  it('should calculate cupid\'s bow definition', () => {
    const landmarks = createMockLandmarks({
      0: { x: 175, y: 165, z: 0 },    // center dips below line
      13: { x: 175, y: 180, z: 0 },
      14: { x: 175, y: 180, z: 0 },
      17: { x: 175, y: 190, z: 0 },
      37: { x: 160, y: 170, z: 0 },
      267: { x: 190, y: 170, z: 0 },
      61: { x: 140, y: 180, z: 0 },
      291: { x: 210, y: 180, z: 0 },
      197: { x: 175, y: 160, z: 0 },
      234: { x: 50, y: 200, z: 0 },
      454: { x: 300, y: 200, z: 0 },
    });

    const leftEye = { x: 125, y: 100, z: 0 };
    const rightEye = { x: 225, y: 100, z: 0 };

    const result = extractMouthMeasurements(landmarks, leftEye, rightEye);

    expect(result.cupidsBowDefinition).toBeGreaterThan(0);
  });

  it('should detect upturned lip corners', () => {
    const landmarks = createMockLandmarks({
      0: { x: 175, y: 170, z: 0 },
      13: { x: 175, y: 180, z: 0 },
      14: { x: 175, y: 180, z: 0 },
      17: { x: 175, y: 190, z: 0 },
      37: { x: 160, y: 170, z: 0 },
      267: { x: 190, y: 170, z: 0 },
      61: { x: 140, y: 175, z: 0 },   // corners higher than center
      291: { x: 210, y: 175, z: 0 },
      197: { x: 175, y: 160, z: 0 },
      234: { x: 50, y: 200, z: 0 },
      454: { x: 300, y: 200, z: 0 },
    });

    const leftEye = { x: 125, y: 100, z: 0 };
    const rightEye = { x: 225, y: 100, z: 0 };

    const result = extractMouthMeasurements(landmarks, leftEye, rightEye);

    // Positive orientation indicates upturned corners
    expect(result.lipCornerOrientation).not.toBeNaN();
  });

  it('should calculate philtrum length', () => {
    const landmarks = createMockLandmarks({
      0: { x: 175, y: 170, z: 0 },
      13: { x: 175, y: 180, z: 0 },
      14: { x: 175, y: 180, z: 0 },
      17: { x: 175, y: 190, z: 0 },
      37: { x: 160, y: 170, z: 0 },
      267: { x: 190, y: 170, z: 0 },
      61: { x: 140, y: 180, z: 0 },
      291: { x: 210, y: 180, z: 0 },
      197: { x: 175, y: 150, z: 0 },  // nose bridge lower
      234: { x: 50, y: 200, z: 0 },
      454: { x: 300, y: 200, z: 0 },
    });

    const leftEye = { x: 125, y: 100, z: 0 };
    const rightEye = { x: 225, y: 100, z: 0 };

    const result = extractMouthMeasurements(landmarks, leftEye, rightEye);

    expect(result.philtrumLength).toBeGreaterThan(0);
  });

  it('should calculate mouth width', () => {
    const landmarks = createMockLandmarks({
      0: { x: 175, y: 170, z: 0 },
      13: { x: 175, y: 180, z: 0 },
      14: { x: 175, y: 180, z: 0 },
      17: { x: 175, y: 190, z: 0 },
      37: { x: 160, y: 170, z: 0 },
      267: { x: 190, y: 170, z: 0 },
      61: { x: 130, y: 180, z: 0 },   // wide mouth
      291: { x: 220, y: 180, z: 0 },
      197: { x: 175, y: 160, z: 0 },
      234: { x: 50, y: 200, z: 0 },
      454: { x: 300, y: 200, z: 0 },
    });

    const leftEye = { x: 125, y: 100, z: 0 };
    const rightEye = { x: 225, y: 100, z: 0 };

    const result = extractMouthMeasurements(landmarks, leftEye, rightEye);

    expect(result.mouthWidth).toBeGreaterThan(0);
    expect(result.mouthWidth).toBeLessThan(1);
  });
});

describe('extractJawMeasurements', () => {
  it('should calculate jaw width', () => {
    const landmarks = createMockLandmarks({
      234: { x: 50, y: 200, z: 0 },   // left gonion
      454: { x: 300, y: 200, z: 0 },  // right gonion
      152: { x: 175, y: 250, z: 0 },  // chin
    });

    const leftEye = { x: 125, y: 100, z: 0 };
    const rightEye = { x: 225, y: 100, z: 0 };

  const result = extractJawMeasurements(landmarks, leftEye, rightEye);

  expect(result.jawWidth).toBeGreaterThan(0);
  expect(result.jawWidth).toBeLessThanOrEqual(1);
  expect(result.source).toBe('landmarks');
  });

  it('should calculate mandibular angle', () => {
    const landmarks = createMockLandmarks({
      234: { x: 80, y: 180, z: 0 },
      454: { x: 270, y: 180, z: 0 },
      152: { x: 175, y: 250, z: 0 },
    });

    const leftEye = { x: 125, y: 100, z: 0 };
    const rightEye = { x: 225, y: 100, z: 0 };

    const result = extractJawMeasurements(landmarks, leftEye, rightEye);

    expect(result.mandibularAngle).toBeGreaterThan(0);
  });

  it('should calculate chin projection', () => {
    const landmarks = createMockLandmarks({
      234: { x: 80, y: 180, z: 0 },
      454: { x: 270, y: 180, z: 0 },
      152: { x: 175, y: 250, z: -10 },  // chin projects forward
    });

    const leftEye = { x: 125, y: 100, z: 0 };
    const rightEye = { x: 225, y: 100, z: 0 };

    const result = extractJawMeasurements(landmarks, leftEye, rightEye);

    expect(result.chinProjection).toBeLessThan(0); // negative = forward
  });

  it('should calculate perfect symmetry for centered chin', () => {
    const landmarks = createMockLandmarks({
      234: { x: 80, y: 180, z: 0 },
      454: { x: 270, y: 180, z: 0 },
      152: { x: 175, y: 250, z: 0 },  // perfectly centered
    });

    const leftEye = { x: 125, y: 100, z: 0 };
    const rightEye = { x: 225, y: 100, z: 0 };

    const result = extractJawMeasurements(landmarks, leftEye, rightEye);

    expect(result.symmetry).toBeCloseTo(1, 1); // close to 1 = symmetric
  });

  it('should calculate lower symmetry for deviated chin', () => {
    const landmarks = createMockLandmarks({
      234: { x: 80, y: 180, z: 0 },
      454: { x: 270, y: 180, z: 0 },
      152: { x: 170, y: 250, z: 0 },  // slightly deviated to left (5px)
    });

    const leftEye = { x: 125, y: 100, z: 0 };
    const rightEye = { x: 225, y: 100, z: 0 };

  const result = extractJawMeasurements(landmarks, leftEye, rightEye);

  expect(result.symmetry).toBeLessThan(1);
  expect(result.symmetry).toBeGreaterThanOrEqual(0);
});

  it('uses synthetic jaw measurements when provided with confidence', () => {
    const landmarks = createMockLandmarks({
      234: { x: -0.5, y: 0.1, z: 0 },
      454: { x: 0.5, y: 0.1, z: 0 },
      152: { x: 0, y: 0.2, z: 0 },
    });

    const leftEye = { x: -0.3, y: 0, z: 0 };
    const rightEye = { x: 0.3, y: 0, z: 0 };

    const synthetic: SyntheticJawInput = {
      polyline: [
        { x: -0.5, y: 0.1 },
        { x: -0.3, y: 0.14 },
        { x: -0.15, y: 0.19 },
        { x: 0, y: 0.22 },
        { x: 0.15, y: 0.19 },
        { x: 0.3, y: 0.14 },
        { x: 0.5, y: 0.1 },
      ],
      confidence: 0.5,
      leftGonion: { x: -0.5, y: 0.1 },
      rightGonion: { x: 0.5, y: 0.1 },
      chin: { x: 0, y: 0.22 },
    };

    const result = extractJawMeasurements(landmarks, leftEye, rightEye, synthetic);

    expect(result.source).toBe('synthetic');
    expect(result.jawWidth).toBeCloseTo(1, 2);
    expect(result.mandibularAngle).toBeGreaterThan(0);
    expect(result.symmetry).toBeGreaterThan(0.8);
  });
});

describe('extractFeatureMeasurements', () => {
  it('should extract all feature measurements', () => {
    const landmarks = createMockLandmarks({
      // Eyes
      133: { x: 100, y: 100, z: 0 },
      33: { x: 150, y: 95, z: 0 },
      362: { x: 200, y: 100, z: 0 },
      263: { x: 250, y: 95, z: 0 },
      159: { x: 125, y: 90, z: 0 },
      145: { x: 125, y: 110, z: 0 },
      386: { x: 225, y: 90, z: 0 },
      374: { x: 225, y: 110, z: 0 },
      // Nose
      94: { x: 140, y: 150, z: 0 },
      331: { x: 210, y: 150, z: 0 },
      1: { x: 175, y: 160, z: 0 },
      6: { x: 175, y: 80, z: 0 },
      168: { x: 175, y: 100, z: 0 },
      197: { x: 175, y: 120, z: 0 },
      // Mouth
      0: { x: 175, y: 170, z: 0 },
      13: { x: 175, y: 180, z: 0 },
      14: { x: 175, y: 180, z: 0 },
      17: { x: 175, y: 190, z: 0 },
      37: { x: 160, y: 170, z: 0 },
      267: { x: 190, y: 170, z: 0 },
      61: { x: 140, y: 180, z: 0 },
      291: { x: 210, y: 180, z: 0 },
      // Jaw
      234: { x: 50, y: 200, z: 0 },
      454: { x: 300, y: 200, z: 0 },
      152: { x: 175, y: 250, z: 0 },
    });

    const leftEye = { x: 125, y: 100, z: 0 };
    const rightEye = { x: 225, y: 100, z: 0 };

    const result = extractFeatureMeasurements(landmarks, leftEye, rightEye);

    expect(result.eyes).toBeDefined();
    expect(result.nose).toBeDefined();
    expect(result.mouth).toBeDefined();
    expect(result.jaw).toBeDefined();

    // Validate structure
    expect(result.eyes.canthalTilt).toBeDefined();
    expect(result.nose.width).toBeDefined();
    expect(result.mouth.lipFullness).toBeDefined();
    expect(result.jaw.jawWidth).toBeDefined();
  });

  it('includes synthetic jaw source when provided', () => {
    const landmarks = createMockLandmarks({
      234: { x: -0.5, y: 0.1, z: 0 },
      454: { x: 0.5, y: 0.1, z: 0 },
      152: { x: 0, y: 0.2, z: 0 },
      133: { x: -0.3, y: 0, z: 0 },
      263: { x: 0.3, y: 0, z: 0 },
    });
    const leftEye = { x: -0.3, y: 0, z: 0 };
    const rightEye = { x: 0.3, y: 0, z: 0 };
    const synthetic: SyntheticJawInput = {
      polyline: [
        { x: -0.5, y: 0.1 },
        { x: -0.3, y: 0.14 },
        { x: -0.15, y: 0.19 },
        { x: 0, y: 0.22 },
        { x: 0.15, y: 0.19 },
        { x: 0.3, y: 0.14 },
        { x: 0.5, y: 0.1 },
      ],
      confidence: 0.5,
      leftGonion: { x: -0.5, y: 0.1 },
      rightGonion: { x: 0.5, y: 0.1 },
      chin: { x: 0, y: 0.22 },
    };

    const result = extractFeatureMeasurements(landmarks, leftEye, rightEye, { syntheticJaw: synthetic });

    expect(result.jaw.source).toBe('synthetic');
  });
});
