import { describe, it, expect } from 'vitest';
import {
  classifyEyes,
  classifyNose,
  classifyMouth,
  classifyJaw,
  classifyFeatures,
  type AxisClassification,
} from '@/lib/axis-classifiers';
import type {
  EyeMeasurements,
  NoseMeasurements,
  MouthMeasurements,
  JawMeasurements,
  FeatureMeasurements,
} from '@/lib/feature-axes';

// Helper to find classification by axis name
function findAxis(classifications: AxisClassification[], axisName: string): AxisClassification | undefined {
  return classifications.find(c => c.axis === axisName);
}

describe('classifyEyes', () => {
  it('should classify positive canthal tilt', () => {
    const measurements: EyeMeasurements = {
      canthalTilt: 5,
      eyeSize: 0.20,
      interocularDistance: 0.40,
    };

    const result = classifyEyes(measurements);
    const tilt = findAxis(result, 'canthal tilt');

    expect(tilt).toBeDefined();
    expect(tilt!.value).toBe('positive');
    expect(tilt!.confidence).toBeGreaterThan(0);
  });

  it('should classify negative canthal tilt', () => {
    const measurements: EyeMeasurements = {
      canthalTilt: -5,
      eyeSize: 0.20,
      interocularDistance: 0.40,
    };

    const result = classifyEyes(measurements);
    const tilt = findAxis(result, 'canthal tilt');

    expect(tilt).toBeDefined();
    expect(tilt!.value).toBe('negative');
  });

  it('should classify neutral canthal tilt', () => {
    const measurements: EyeMeasurements = {
      canthalTilt: 1,
      eyeSize: 0.20,
      interocularDistance: 0.40,
    };

    const result = classifyEyes(measurements);
    const tilt = findAxis(result, 'canthal tilt');

    expect(tilt).toBeDefined();
    expect(tilt!.value).toBe('neutral');
  });

  it('should classify wide eyes', () => {
    const measurements: EyeMeasurements = {
      canthalTilt: 0,
      eyeSize: 0.25,
      interocularDistance: 0.40,
    };

    const result = classifyEyes(measurements);
    const size = findAxis(result, 'eye size');

    expect(size).toBeDefined();
    expect(size!.value).toBe('wide');
  });

  it('should classify narrow eyes', () => {
    const measurements: EyeMeasurements = {
      canthalTilt: 0,
      eyeSize: 0.16,
      interocularDistance: 0.40,
    };

    const result = classifyEyes(measurements);
    const size = findAxis(result, 'eye size');

    expect(size).toBeDefined();
    expect(size!.value).toBe('narrow');
  });

  it('should classify wide-set eyes', () => {
    const measurements: EyeMeasurements = {
      canthalTilt: 0,
      eyeSize: 0.20,
      interocularDistance: 0.45,
    };

    const result = classifyEyes(measurements);
    const ipd = findAxis(result, 'interocular distance');

    expect(ipd).toBeDefined();
    expect(ipd!.value).toBe('wide-set');
  });

  it('should classify close-set eyes', () => {
    const measurements: EyeMeasurements = {
      canthalTilt: 0,
      eyeSize: 0.20,
      interocularDistance: 0.35,
    };

    const result = classifyEyes(measurements);
    const ipd = findAxis(result, 'interocular distance');

    expect(ipd).toBeDefined();
    expect(ipd!.value).toBe('close-set');
  });
});

describe('classifyNose', () => {
  it('should classify broad nose', () => {
    const measurements: NoseMeasurements = {
      width: 0.35,
      bridgeContour: 0,
      tipProjection: -0.10,
    };

    const result = classifyNose(measurements);
    const width = findAxis(result, 'nose width');

    expect(width).toBeDefined();
    expect(width!.value).toBe('broad');
  });

  it('should classify narrow nose', () => {
    const measurements: NoseMeasurements = {
      width: 0.22,
      bridgeContour: 0,
      tipProjection: -0.10,
    };

    const result = classifyNose(measurements);
    const width = findAxis(result, 'nose width');

    expect(width).toBeDefined();
    expect(width!.value).toBe('narrow');
  });

  it('should classify convex bridge', () => {
    const measurements: NoseMeasurements = {
      width: 0.275,
      bridgeContour: 0.05,
      tipProjection: -0.10,
    };

    const result = classifyNose(measurements);
    const bridge = findAxis(result, 'bridge contour');

    expect(bridge).toBeDefined();
    expect(bridge!.value).toBe('convex');
  });

  it('should classify concave bridge', () => {
    const measurements: NoseMeasurements = {
      width: 0.275,
      bridgeContour: -0.05,
      tipProjection: -0.10,
    };

    const result = classifyNose(measurements);
    const bridge = findAxis(result, 'bridge contour');

    expect(bridge).toBeDefined();
    expect(bridge!.value).toBe('concave');
  });

  it('should classify prominent tip', () => {
    const measurements: NoseMeasurements = {
      width: 0.275,
      bridgeContour: 0,
      tipProjection: -0.25,
    };

    const result = classifyNose(measurements);
    const tip = findAxis(result, 'nasal tip projection');

    expect(tip).toBeDefined();
    expect(tip!.value).toBe('prominent');
  });

  it('should classify retracted tip', () => {
    const measurements: NoseMeasurements = {
      width: 0.275,
      bridgeContour: 0,
      tipProjection: 0.05,
    };

    const result = classifyNose(measurements);
    const tip = findAxis(result, 'nasal tip projection');

    expect(tip).toBeDefined();
    expect(tip!.value).toBe('retracted');
  });
});

describe('classifyMouth', () => {
  it('should classify full lips', () => {
    const measurements: MouthMeasurements = {
      lipFullness: 0.19,
      cupidsBowDefinition: 0.03,
      lipCornerOrientation: 0,
      philtrumLength: 0.20,
      mouthWidth: 0.285,
    };

    const result = classifyMouth(measurements);
    const fullness = findAxis(result, 'lip fullness');

    expect(fullness).toBeDefined();
    expect(fullness!.value).toBe('full');
  });

  it('should classify thin lips', () => {
    const measurements: MouthMeasurements = {
      lipFullness: 0.11,
      cupidsBowDefinition: 0.03,
      lipCornerOrientation: 0,
      philtrumLength: 0.20,
      mouthWidth: 0.285,
    };

    const result = classifyMouth(measurements);
    const fullness = findAxis(result, 'lip fullness');

    expect(fullness).toBeDefined();
    expect(fullness!.value).toBe('thin');
  });

  it('should classify pronounced cupid\'s bow', () => {
    const measurements: MouthMeasurements = {
      lipFullness: 0.15,
      cupidsBowDefinition: 0.06,
      lipCornerOrientation: 0,
      philtrumLength: 0.20,
      mouthWidth: 0.285,
    };

    const result = classifyMouth(measurements);
    const bow = findAxis(result, "cupid's bow definition");

    expect(bow).toBeDefined();
    expect(bow!.value).toBe('pronounced');
  });

  it('should classify subtle cupid\'s bow', () => {
    const measurements: MouthMeasurements = {
      lipFullness: 0.15,
      cupidsBowDefinition: 0.01,
      lipCornerOrientation: 0,
      philtrumLength: 0.20,
      mouthWidth: 0.285,
    };

    const result = classifyMouth(measurements);
    const bow = findAxis(result, "cupid's bow definition");

    expect(bow).toBeDefined();
    expect(bow!.value).toBe('subtle');
  });

  it('should classify upturned lip corners', () => {
    const measurements: MouthMeasurements = {
      lipFullness: 0.15,
      cupidsBowDefinition: 0.03,
      lipCornerOrientation: 8,
      philtrumLength: 0.20,
      mouthWidth: 0.285,
    };

    const result = classifyMouth(measurements);
    const corners = findAxis(result, 'lip corner orientation');

    expect(corners).toBeDefined();
    expect(corners!.value).toBe('upturned');
  });

  it('should classify downturned lip corners', () => {
    const measurements: MouthMeasurements = {
      lipFullness: 0.15,
      cupidsBowDefinition: 0.03,
      lipCornerOrientation: -8,
      philtrumLength: 0.20,
      mouthWidth: 0.285,
    };

    const result = classifyMouth(measurements);
    const corners = findAxis(result, 'lip corner orientation');

    expect(corners).toBeDefined();
    expect(corners!.value).toBe('downturned');
  });

  it('should classify long philtrum', () => {
    const measurements: MouthMeasurements = {
      lipFullness: 0.15,
      cupidsBowDefinition: 0.03,
      lipCornerOrientation: 0,
      philtrumLength: 0.30,
      mouthWidth: 0.285,
    };

    const result = classifyMouth(measurements);
    const philtrum = findAxis(result, 'philtrum length');

    expect(philtrum).toBeDefined();
    expect(philtrum!.value).toBe('long');
  });

  it('should classify short philtrum', () => {
    const measurements: MouthMeasurements = {
      lipFullness: 0.15,
      cupidsBowDefinition: 0.03,
      lipCornerOrientation: 0,
      philtrumLength: 0.12,
      mouthWidth: 0.285,
    };

    const result = classifyMouth(measurements);
    const philtrum = findAxis(result, 'philtrum length');

    expect(philtrum).toBeDefined();
    expect(philtrum!.value).toBe('short');
  });

  it('should classify wide mouth', () => {
    const measurements: MouthMeasurements = {
      lipFullness: 0.15,
      cupidsBowDefinition: 0.03,
      lipCornerOrientation: 0,
      philtrumLength: 0.20,
      mouthWidth: 0.35,
    };

    const result = classifyMouth(measurements);
    const width = findAxis(result, 'mouth width');

    expect(width).toBeDefined();
    expect(width!.value).toBe('wide');
  });

  it('should classify narrow mouth', () => {
    const measurements: MouthMeasurements = {
      lipFullness: 0.15,
      cupidsBowDefinition: 0.03,
      lipCornerOrientation: 0,
      philtrumLength: 0.20,
      mouthWidth: 0.22,
    };

    const result = classifyMouth(measurements);
    const width = findAxis(result, 'mouth width');

    expect(width).toBeDefined();
    expect(width!.value).toBe('narrow');
  });
});

describe('classifyJaw', () => {
  it('should classify wide jaw', () => {
    const measurements: JawMeasurements = {
      jawWidth: 1.10,
      mandibularAngle: 105,
      chinProjection: -0.05,
      chinWidth: 1.10,
      symmetry: 0.95,
    };

    const result = classifyJaw(measurements);
    const width = findAxis(result, 'jaw width');

    expect(width).toBeDefined();
    expect(width!.value).toBe('wide');
  });

  it('should classify narrow jaw', () => {
    const measurements: JawMeasurements = {
      jawWidth: 0.90,
      mandibularAngle: 105,
      chinProjection: -0.05,
      chinWidth: 0.90,
      symmetry: 0.95,
    };

    const result = classifyJaw(measurements);
    const width = findAxis(result, 'jaw width');

    expect(width).toBeDefined();
    expect(width!.value).toBe('narrow');
  });

  it('should classify steep mandibular angle', () => {
    const measurements: JawMeasurements = {
      jawWidth: 1.0,
      mandibularAngle: 120,
      chinProjection: -0.05,
      chinWidth: 1.0,
      symmetry: 0.95,
    };

    const result = classifyJaw(measurements);
    const angle = findAxis(result, 'mandibular angle');

    expect(angle).toBeDefined();
    expect(angle!.value).toBe('steep');
  });

  it('should classify square mandibular angle', () => {
    const measurements: JawMeasurements = {
      jawWidth: 1.0,
      mandibularAngle: 90,
      chinProjection: -0.05,
      chinWidth: 1.0,
      symmetry: 0.95,
    };

    const result = classifyJaw(measurements);
    const angle = findAxis(result, 'mandibular angle');

    expect(angle).toBeDefined();
    expect(angle!.value).toBe('square');
  });

  it('should classify prominent chin', () => {
    const measurements: JawMeasurements = {
      jawWidth: 1.0,
      mandibularAngle: 105,
      chinProjection: -0.20,
      chinWidth: 1.0,
      symmetry: 0.95,
    };

    const result = classifyJaw(measurements);
    const chin = findAxis(result, 'chin projection');

    expect(chin).toBeDefined();
    expect(chin!.value).toBe('prominent');
  });

  it('should classify recessed chin', () => {
    const measurements: JawMeasurements = {
      jawWidth: 1.0,
      mandibularAngle: 105,
      chinProjection: 0.10,
      chinWidth: 1.0,
      symmetry: 0.95,
    };

    const result = classifyJaw(measurements);
    const chin = findAxis(result, 'chin projection');

    expect(chin).toBeDefined();
    expect(chin!.value).toBe('recessed');
  });

  it('should classify centered symmetry', () => {
    const measurements: JawMeasurements = {
      jawWidth: 1.0,
      mandibularAngle: 105,
      chinProjection: -0.05,
      chinWidth: 1.0,
      symmetry: 0.95,
    };

    const result = classifyJaw(measurements);
    const sym = findAxis(result, 'symmetry');

    expect(sym).toBeDefined();
    expect(sym!.value).toBe('centered');
  });

  it('should classify slight deviation', () => {
    const measurements: JawMeasurements = {
      jawWidth: 1.0,
      mandibularAngle: 105,
      chinProjection: -0.05,
      chinWidth: 1.0,
      symmetry: 0.80,
    };

    const result = classifyJaw(measurements);
    const sym = findAxis(result, 'symmetry');

    expect(sym).toBeDefined();
    expect(sym!.value).toBe('slight deviation');
  });

  it('should classify noticeable deviation', () => {
    const measurements: JawMeasurements = {
      jawWidth: 1.0,
      mandibularAngle: 105,
      chinProjection: -0.05,
      chinWidth: 1.0,
      symmetry: 0.60,
    };

    const result = classifyJaw(measurements);
    const sym = findAxis(result, 'symmetry');

    expect(sym).toBeDefined();
    expect(sym!.value).toBe('noticeable deviation');
  });
});

describe('classifyFeatures', () => {
  it('should classify all features', () => {
    const measurements: FeatureMeasurements = {
      eyes: {
        canthalTilt: 2,
        eyeSize: 0.20,
        interocularDistance: 0.40,
      },
      brows: {
        shape: 0.12,
        position: 0.16,
        length: 1.05,
      },
      nose: {
        width: 0.275,
        bridgeContour: 0.01,
        tipProjection: -0.10,
      },
      mouth: {
        lipFullness: 0.15,
        cupidsBowDefinition: 0.03,
        lipCornerOrientation: 0,
        philtrumLength: 0.20,
        mouthWidth: 0.285,
      },
      cheeks: {
        prominence: 0.06,
        nasolabialDepth: 0.05,
        height: 0.38,
      },
      jaw: {
        jawWidth: 1.0,
        mandibularAngle: 105,
        chinProjection: -0.05,
        chinWidth: 1.0,
        symmetry: 0.95,
      },
      forehead: {
        height: 1.00,
        contour: 0.02,
      },
      faceShape: {
        lengthWidthRatio: 1.5,
        facialThirds: 0.88,
      },
    };

    const result = classifyFeatures(measurements);

    expect(result.eyes).toBeDefined();
    expect(result.eyes.length).toBe(3);
    expect(result.brows).toBeDefined();
    expect(result.brows.length).toBe(3);
    expect(result.nose).toBeDefined();
    expect(result.nose.length).toBe(3);
    expect(result.mouth).toBeDefined();
    expect(result.mouth.length).toBe(5);
    expect(result.cheeks).toBeDefined();
    expect(result.cheeks.length).toBe(3);
    expect(result.jaw).toBeDefined();
    expect(result.jaw.length).toBe(5);
    expect(result.forehead).toBeDefined();
    expect(result.forehead.length).toBe(2);
    expect(result.faceShape).toBeDefined();
    expect(result.faceShape.length).toBe(2);
  });

  it('should include raw measurements in all classifications', () => {
    const measurements: FeatureMeasurements = {
      eyes: {
        canthalTilt: 5,
        eyeSize: 0.20,
        interocularDistance: 0.40,
      },
      brows: {
        shape: 0.12,
        position: 0.16,
        length: 1.05,
      },
      nose: {
        width: 0.275,
        bridgeContour: 0.01,
        tipProjection: -0.10,
      },
      mouth: {
        lipFullness: 0.15,
        cupidsBowDefinition: 0.03,
        lipCornerOrientation: 0,
        philtrumLength: 0.20,
        mouthWidth: 0.285,
      },
      cheeks: {
        prominence: 0.06,
        nasolabialDepth: 0.05,
        height: 0.38,
      },
      jaw: {
        jawWidth: 1.0,
        mandibularAngle: 105,
        chinProjection: -0.05,
        chinWidth: 1.0,
        symmetry: 0.95,
      },
      forehead: {
        height: 1.00,
        contour: 0.02,
      },
      faceShape: {
        lengthWidthRatio: 1.5,
        facialThirds: 0.88,
      },
    };

    const result = classifyFeatures(measurements);

    // Check all classifications have raw measurements
    [
      ...result.eyes,
      ...result.brows,
      ...result.nose,
      ...result.mouth,
      ...result.cheeks,
      ...result.jaw,
      ...result.forehead,
      ...result.faceShape,
    ].forEach(classification => {
      expect(classification.rawMeasurement).toBeDefined();
      expect(typeof classification.rawMeasurement).toBe('number');
    });
  });

  it('should include confidence scores in all classifications', () => {
    const measurements: FeatureMeasurements = {
      eyes: {
        canthalTilt: 5,
        eyeSize: 0.20,
        interocularDistance: 0.40,
      },
      brows: {
        shape: 0.12,
        position: 0.16,
        length: 1.05,
      },
      nose: {
        width: 0.275,
        bridgeContour: 0.01,
        tipProjection: -0.10,
      },
      mouth: {
        lipFullness: 0.15,
        cupidsBowDefinition: 0.03,
        lipCornerOrientation: 0,
        philtrumLength: 0.20,
        mouthWidth: 0.285,
      },
      cheeks: {
        prominence: 0.06,
        nasolabialDepth: 0.05,
        height: 0.38,
      },
      jaw: {
        jawWidth: 1.0,
        mandibularAngle: 105,
        chinProjection: -0.05,
        chinWidth: 1.0,
        symmetry: 0.95,
      },
      forehead: {
        height: 1.00,
        contour: 0.02,
      },
      faceShape: {
        lengthWidthRatio: 1.5,
        facialThirds: 0.88,
      },
    };

    const result = classifyFeatures(measurements);

    // Check all classifications have confidence in [0, 1]
    [
      ...result.eyes,
      ...result.brows,
      ...result.nose,
      ...result.mouth,
      ...result.cheeks,
      ...result.jaw,
      ...result.forehead,
      ...result.faceShape,
    ].forEach(classification => {
      expect(classification.confidence).toBeDefined();
      expect(classification.confidence).toBeGreaterThanOrEqual(0);
      expect(classification.confidence).toBeLessThanOrEqual(1);
    });
  });
});
