import { describe, it, expect } from 'vitest';
import {
  compareFeatures,
  dimensionalComparison,
  morphologicalCongruence,
  sharedAxisValues,
  featureAgreementSummary,
  performComparison,
  type AxisComparison,
} from '@/lib/feature-comparisons';
import type { FeatureClassifications } from '@/lib/axis-classifiers';
import type { FeatureMeasurements } from '@/lib/feature-axes';

describe('compareFeatures', () => {
  it('should detect axis agreement when categories match', () => {
    const classificationsA: FeatureClassifications = {
      eyes: [
        { axis: 'canthal tilt', value: 'positive', confidence: 0.8, rawMeasurement: 5 },
        { axis: 'eye size', value: 'average', confidence: 0.9, rawMeasurement: 0.20 },
        { axis: 'interocular distance', value: 'balanced', confidence: 0.85, rawMeasurement: 0.40 },
      ],
      brows: [],
      nose: [],
      mouth: [],
      cheeks: [],
      jaw: [],
      forehead: [],
      faceShape: [],
    };

    const classificationsB: FeatureClassifications = {
      eyes: [
        { axis: 'canthal tilt', value: 'positive', confidence: 0.75, rawMeasurement: 4.5 },
        { axis: 'eye size', value: 'average', confidence: 0.88, rawMeasurement: 0.21 },
        { axis: 'interocular distance', value: 'balanced', confidence: 0.82, rawMeasurement: 0.39 },
      ],
      brows: [],
      nose: [],
      mouth: [],
      cheeks: [],
      jaw: [],
      forehead: [],
      faceShape: [],
    };

    const result = compareFeatures(classificationsA, classificationsB);

    expect(result[0].feature).toBe('eyes');
    expect(result[0].axes.length).toBe(3);
    expect(result[0].axes.every(a => a.agreement)).toBe(true);
    expect(result[0].overallAgreement).toBe(1.0);
  });

  it('should detect axis disagreement when categories differ', () => {
    const classificationsA: FeatureClassifications = {
      eyes: [
        { axis: 'canthal tilt', value: 'positive', confidence: 0.8, rawMeasurement: 5 },
      ],
      brows: [],
      nose: [],
      mouth: [],
      cheeks: [],
      jaw: [],
      forehead: [],
      faceShape: [],
    };

    const classificationsB: FeatureClassifications = {
      eyes: [
        { axis: 'canthal tilt', value: 'neutral', confidence: 0.75, rawMeasurement: 1 },
      ],
      brows: [],
      nose: [],
      mouth: [],
      cheeks: [],
      jaw: [],
      forehead: [],
      faceShape: [],
    };

    const result = compareFeatures(classificationsA, classificationsB);

    expect(result[0].axes[0].agreement).toBe(false);
    expect(result[0].axes[0].valueA).toBe('positive');
    expect(result[0].axes[0].valueB).toBe('neutral');
  });

  it('should calculate similarity based on raw measurements', () => {
    const classificationsA: FeatureClassifications = {
      eyes: [
        { axis: 'canthal tilt', value: 'positive', confidence: 0.8, rawMeasurement: 5 },
      ],
      brows: [],
      nose: [],
      mouth: [],
      cheeks: [],
      jaw: [],
      forehead: [],
      faceShape: [],
    };

    const classificationsB: FeatureClassifications = {
      eyes: [
        { axis: 'canthal tilt', value: 'positive', confidence: 0.75, rawMeasurement: 5.5 },
      ],
      brows: [],
      nose: [],
      mouth: [],
      cheeks: [],
      jaw: [],
      forehead: [],
      faceShape: [],
    };

    const result = compareFeatures(classificationsA, classificationsB);

    // Very close raw measurements should have high similarity
    expect(result[0].axes[0].similarity).toBeGreaterThan(0.9);
  });

  it('should calculate percentage difference', () => {
    const classificationsA: FeatureClassifications = {
      eyes: [],
      brows: [],
      nose: [
        { axis: 'nose width', value: 'average', confidence: 0.8, rawMeasurement: 0.30 },
      ],
      mouth: [],
      cheeks: [],
      jaw: [],
      forehead: [],
      faceShape: [],
    };

    const classificationsB: FeatureClassifications = {
      eyes: [],
      brows: [],
      nose: [
        { axis: 'nose width', value: 'average', confidence: 0.75, rawMeasurement: 0.27 },
      ],
      mouth: [],
      cheeks: [],
      jaw: [],
      forehead: [],
      faceShape: [],
    };

    const result = compareFeatures(classificationsA, classificationsB);

    expect(result[2].axes[0].percentDiff).toBeDefined();
    expect(result[2].axes[0].percentDiff).toBeGreaterThan(0);
    expect(result[2].axes[0].percentDiff).toBeLessThan(15);
  });

  it('should determine direction (higher/lower)', () => {
    const classificationsA: FeatureClassifications = {
      eyes: [],
      brows: [],
      nose: [],
      mouth: [
        { axis: 'lip fullness', value: 'full', confidence: 0.8, rawMeasurement: 0.19 },
      ],
      cheeks: [],
      jaw: [],
      forehead: [],
      faceShape: [],
    };

    const classificationsB: FeatureClassifications = {
      eyes: [],
      brows: [],
      nose: [],
      mouth: [
        { axis: 'lip fullness', value: 'average', confidence: 0.75, rawMeasurement: 0.15 },
      ],
      cheeks: [],
      jaw: [],
      forehead: [],
      faceShape: [],
    };

    const result = compareFeatures(classificationsA, classificationsB);

    expect(result[3].axes[0].direction).toBe('higher');
  });

  it('should calculate overall agreement for mixed results', () => {
    const classificationsA: FeatureClassifications = {
      eyes: [
        { axis: 'canthal tilt', value: 'positive', confidence: 0.8, rawMeasurement: 5 },
        { axis: 'eye size', value: 'average', confidence: 0.9, rawMeasurement: 0.20 },
        { axis: 'interocular distance', value: 'wide-set', confidence: 0.85, rawMeasurement: 0.45 },
      ],
      brows: [],
      nose: [],
      mouth: [],
      cheeks: [],
      jaw: [],
      forehead: [],
      faceShape: [],
    };

    const classificationsB: FeatureClassifications = {
      eyes: [
        { axis: 'canthal tilt', value: 'positive', confidence: 0.75, rawMeasurement: 4.5 },
        { axis: 'eye size', value: 'narrow', confidence: 0.88, rawMeasurement: 0.17 },
        { axis: 'interocular distance', value: 'balanced', confidence: 0.82, rawMeasurement: 0.39 },
      ],
      brows: [],
      nose: [],
      mouth: [],
      cheeks: [],
      jaw: [],
      forehead: [],
      faceShape: [],
    };

    const result = compareFeatures(classificationsA, classificationsB);

    // 1 out of 3 axes agree
    expect(result[0].overallAgreement).toBeCloseTo(1 / 3, 2);
  });
});

describe('dimensionalComparison', () => {
  it('should describe very similar measurements', () => {
    const result = dimensionalComparison(0.20, 0.205, 'eye size');

    expect(result).toContain('very similar');
  });

  it('should describe larger measurement correctly', () => {
    const result = dimensionalComparison(0.30, 0.25, 'nose width', 'Alice', 'Bob');

    expect(result).toContain('Alice');
    expect(result).toContain('larger');
  });

  it('should describe smaller measurement correctly', () => {
    const result = dimensionalComparison(0.15, 0.20, 'lip fullness', 'Alice', 'Bob');

    expect(result).toContain('Bob');
    expect(result).toContain('smaller');
  });

  it('should include percentage in description', () => {
    const result = dimensionalComparison(0.30, 0.25, 'nose width');

    expect(result).toMatch(/\d+\.\d+%/);
  });
});

describe('morphologicalCongruence', () => {
  it('should return 1.0 for identical classifications', () => {
    const comparisons = [
      {
        feature: 'eyes',
        axes: [
          { axis: 'canthal tilt', valueA: 'positive', valueB: 'positive', agreement: true, similarity: 1.0 },
          { axis: 'eye size', valueA: 'average', valueB: 'average', agreement: true, similarity: 1.0 },
        ],
        overallAgreement: 1.0,
      },
    ];

    const result = morphologicalCongruence(comparisons);

    expect(result).toBe(1.0);
  });

  it('should return lower score for mixed similarity', () => {
    const comparisons = [
      {
        feature: 'eyes',
        axes: [
          { axis: 'canthal tilt', valueA: 'positive', valueB: 'positive', agreement: true, similarity: 0.9 },
          { axis: 'eye size', valueA: 'wide', valueB: 'narrow', agreement: false, similarity: 0.4 },
        ],
        overallAgreement: 0.5,
      },
    ];

    const result = morphologicalCongruence(comparisons);

    expect(result).toBeCloseTo(0.65, 2);
  });

  it('should handle multiple features', () => {
    const comparisons = [
      {
        feature: 'eyes',
        axes: [
          { axis: 'canthal tilt', valueA: 'positive', valueB: 'positive', agreement: true, similarity: 1.0 },
        ],
        overallAgreement: 1.0,
      },
      {
        feature: 'nose',
        axes: [
          { axis: 'nose width', valueA: 'broad', valueB: 'narrow', agreement: false, similarity: 0.3 },
        ],
        overallAgreement: 0.0,
      },
    ];

    const result = morphologicalCongruence(comparisons);

    expect(result).toBeCloseTo(0.65, 2);
  });
});

describe('sharedAxisValues', () => {
  it('should list all shared axis values', () => {
    const comparisons = [
      {
        feature: 'eyes',
        axes: [
          { axis: 'canthal tilt', valueA: 'positive', valueB: 'positive', agreement: true, similarity: 1.0 },
          { axis: 'eye size', valueA: 'average', valueB: 'average', agreement: true, similarity: 1.0 },
        ],
        overallAgreement: 1.0,
      },
    ];

    const result = sharedAxisValues(comparisons);

    expect(result).toHaveLength(2);
    expect(result[0]).toContain('positive canthal tilt');
    expect(result[1]).toContain('average eye size');
  });

  it('should return empty array when no axes agree', () => {
    const comparisons = [
      {
        feature: 'eyes',
        axes: [
          { axis: 'canthal tilt', valueA: 'positive', valueB: 'negative', agreement: false, similarity: 0.4 },
        ],
        overallAgreement: 0.0,
      },
    ];

    const result = sharedAxisValues(comparisons);

    expect(result).toHaveLength(0);
  });
});

describe('featureAgreementSummary', () => {
  it('should identify similar features', () => {
    const comparisons = [
      { feature: 'eyes', axes: [], overallAgreement: 0.8 },
      { feature: 'nose', axes: [], overallAgreement: 0.9 },
      { feature: 'mouth', axes: [], overallAgreement: 0.3 },
      { feature: 'jaw', axes: [], overallAgreement: 0.25 },
    ];

    const result = featureAgreementSummary(comparisons);

    expect(result).toContain('eyes and nose');
    expect(result).toContain('similar');
  });

  it('should identify different features', () => {
    const comparisons = [
      { feature: 'eyes', axes: [], overallAgreement: 0.1 },
      { feature: 'nose', axes: [], overallAgreement: 0.2 },
      { feature: 'mouth', axes: [], overallAgreement: 0.8 },
      { feature: 'jaw', axes: [], overallAgreement: 0.9 },
    ];

    const result = featureAgreementSummary(comparisons);

    expect(result).toContain('eyes and nose');
    expect(result).toContain('differ');
  });

  it('should handle mixed results', () => {
    const comparisons = [
      { feature: 'eyes', axes: [], overallAgreement: 0.8 },
      { feature: 'nose', axes: [], overallAgreement: 0.2 },
      { feature: 'mouth', axes: [], overallAgreement: 0.5 },
      { feature: 'jaw', axes: [], overallAgreement: 0.4 },
    ];

    const result = featureAgreementSummary(comparisons);

    expect(result).toBeTruthy();
  });
});

describe('performComparison', () => {
  it('should return complete comparison result', () => {
    const measurementsA: FeatureMeasurements = {
      eyes: { canthalTilt: 5, eyeSize: 0.20, interocularDistance: 0.40 },
      brows: { shape: 0.12, position: 0.16, length: 1.05 },
      nose: { width: 0.30, bridgeContour: 0.01, tipProjection: -0.10 },
      mouth: { lipFullness: 0.15, cupidsBowDefinition: 0.03, lipCornerOrientation: 0, philtrumLength: 0.20, mouthWidth: 0.285 },
      cheeks: { prominence: 0.06, nasolabialDepth: 0.05, height: 0.38 },
      jaw: { jawWidth: 1.0, mandibularAngle: 105, chinProjection: -0.05, chinWidth: 1.0, symmetry: 0.95 },
      forehead: { height: 1.00, contour: 0.02 },
      faceShape: { lengthWidthRatio: 1.5, facialThirds: 0.88 },
    };

    const measurementsB: FeatureMeasurements = {
      eyes: { canthalTilt: 4.5, eyeSize: 0.21, interocularDistance: 0.39 },
      brows: { shape: 0.11, position: 0.15, length: 1.03 },
      nose: { width: 0.28, bridgeContour: 0.02, tipProjection: -0.12 },
      mouth: { lipFullness: 0.16, cupidsBowDefinition: 0.04, lipCornerOrientation: 2, philtrumLength: 0.19, mouthWidth: 0.290 },
      cheeks: { prominence: 0.07, nasolabialDepth: 0.04, height: 0.39 },
      jaw: { jawWidth: 1.02, mandibularAngle: 107, chinProjection: -0.06, chinWidth: 1.02, symmetry: 0.93 },
      forehead: { height: 0.98, contour: 0.03 },
      faceShape: { lengthWidthRatio: 1.52, facialThirds: 0.86 },
    };

    const classificationsA: FeatureClassifications = {
      eyes: [
        { axis: 'canthal tilt', value: 'positive', confidence: 0.8, rawMeasurement: 5 },
        { axis: 'eye size', value: 'average', confidence: 0.9, rawMeasurement: 0.20 },
        { axis: 'interocular distance', value: 'balanced', confidence: 0.85, rawMeasurement: 0.40 },
      ],
      brows: [],
      nose: [
        { axis: 'nose width', value: 'average', confidence: 0.8, rawMeasurement: 0.30 },
      ],
      mouth: [
        { axis: 'lip fullness', value: 'average', confidence: 0.8, rawMeasurement: 0.15 },
      ],
      cheeks: [],
      jaw: [
        { axis: 'jaw width', value: 'balanced', confidence: 0.9, rawMeasurement: 1.0 },
      ],
      forehead: [],
      faceShape: [],
    };

    const classificationsB: FeatureClassifications = {
      eyes: [
        { axis: 'canthal tilt', value: 'positive', confidence: 0.75, rawMeasurement: 4.5 },
        { axis: 'eye size', value: 'average', confidence: 0.88, rawMeasurement: 0.21 },
        { axis: 'interocular distance', value: 'balanced', confidence: 0.82, rawMeasurement: 0.39 },
      ],
      brows: [],
      nose: [
        { axis: 'nose width', value: 'average', confidence: 0.75, rawMeasurement: 0.28 },
      ],
      mouth: [
        { axis: 'lip fullness', value: 'average', confidence: 0.77, rawMeasurement: 0.16 },
      ],
      cheeks: [],
      jaw: [
        { axis: 'jaw width', value: 'balanced', confidence: 0.88, rawMeasurement: 1.02 },
      ],
      forehead: [],
      faceShape: [],
    };

    const result = performComparison(measurementsA, measurementsB, classificationsA, classificationsB);

    expect(result.comparisons).toBeDefined();
    expect(result.comparisons.length).toBe(8);
    expect(result.sharedAxes).toBeDefined();
    expect(result.congruenceScore).toBeGreaterThan(0);
    expect(result.congruenceScore).toBeLessThanOrEqual(1);
    expect(result.agreementSummary).toBeTruthy();
  });
});
