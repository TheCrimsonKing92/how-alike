import { describe, it, expect } from 'vitest';
import {
  extractEyeMeasurements,
  extractNoseMeasurements,
  extractMouthMeasurements,
  extractJawMeasurements,
  extractFeatureMeasurements,
  type Point,
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
      133: { x: 100, y: 100, z: 0 }, // left inner
      33: { x: 150, y: 95, z: 0 },   // left outer (higher = upward tilt)
      362: { x: 200, y: 100, z: 0 }, // right inner
      263: { x: 250, y: 95, z: 0 },  // right outer
      159: { x: 125, y: 90, z: 0 },  // left top
      145: { x: 125, y: 110, z: 0 }, // left bottom
      386: { x: 225, y: 90, z: 0 },  // right top
      374: { x: 225, y: 110, z: 0 }, // right bottom
      234: { x: 50, y: 200, z: 0 },  // left gonion
      454: { x: 300, y: 200, z: 0 }, // right gonion
    });

    const leftEye = { x: 125, y: 100, z: 0 };
    const rightEye = { x: 225, y: 100, z: 0 };

    const result = extractEyeMeasurements(landmarks, leftEye, rightEye);

    // Positive tilt means outer corners are higher than inner
    expect(result.canthalTilt).toBeGreaterThan(0);
    expect(result.eyeSize).toBeGreaterThan(0);
    expect(result.interocularDistance).toBeGreaterThan(0);
    expect(result.interocularDistance).toBeLessThan(1);
  });

  it('should calculate negative canthal tilt for downward-slanting eyes', () => {
    const landmarks = createMockLandmarks({
      133: { x: 100, y: 100, z: 0 }, // left inner
      33: { x: 150, y: 105, z: 0 },  // left outer (lower = downward tilt)
      362: { x: 200, y: 100, z: 0 }, // right inner
      263: { x: 250, y: 105, z: 0 }, // right outer
      159: { x: 125, y: 90, z: 0 },
      145: { x: 125, y: 110, z: 0 },
      386: { x: 225, y: 90, z: 0 },
      374: { x: 225, y: 110, z: 0 },
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
      133: { x: 100, y: 100, z: 0 },
      33: { x: 150, y: 100, z: 0 },
      362: { x: 200, y: 100, z: 0 },
      263: { x: 250, y: 100, z: 0 },
      159: { x: 125, y: 80, z: 0 },  // large vertical aperture
      145: { x: 125, y: 120, z: 0 },
      386: { x: 225, y: 80, z: 0 },
      374: { x: 225, y: 120, z: 0 },
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
      133: { x: 100, y: 100, z: 0 },
      33: { x: 150, y: 100, z: 0 },
      362: { x: 200, y: 100, z: 0 },
      263: { x: 250, y: 100, z: 0 },
      159: { x: 125, y: 90, z: 0 },
      145: { x: 125, y: 110, z: 0 },
      386: { x: 225, y: 90, z: 0 },
      374: { x: 225, y: 110, z: 0 },
      234: { x: 50, y: 200, z: 0 },   // narrow face width
      454: { x: 300, y: 200, z: 0 },
    });

    const leftEye = { x: 100, y: 100, z: 0 };  // wide IPD
    const rightEye = { x: 250, y: 100, z: 0 };

    const result = extractEyeMeasurements(landmarks, leftEye, rightEye);

    expect(result.interocularDistance).toBeGreaterThan(0.5);
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
});
