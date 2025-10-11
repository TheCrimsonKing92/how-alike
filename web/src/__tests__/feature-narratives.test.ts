import { describe, it, expect } from 'vitest';
import {
  narrativeForAxis,
  narrativeForFeature,
  detailedNarrativeForFeature,
  overallNarrative,
  sharedCharacteristicsNarrative,
  contrastNarrative,
  dimensionalNarrative,
  generateNarrative,
} from '@/lib/feature-narratives';
import type { AxisComparison, FeatureComparison } from '@/lib/feature-comparisons';

describe('narrativeForAxis', () => {
  it('should generate agreement narrative for matching categories', () => {
    const comparison: AxisComparison = {
      axis: 'canthal tilt',
      valueA: 'positive',
      valueB: 'positive',
      agreement: true,
      similarity: 0.95,
      percentDiff: 2,
    };

    const result = narrativeForAxis(comparison);

    expect(result).toContain('Both have positive canthal tilt');
  });

  it('should generate subtle difference narrative for small disagreements', () => {
    const comparison: AxisComparison = {
      axis: 'eye size',
      valueA: 'average',
      valueB: 'wide',
      agreement: false,
      similarity: 0.88,
      percentDiff: 4,
    };

    const result = narrativeForAxis(comparison);

    expect(result).toContain('subtle difference');
  });

  it('should generate difference narrative for moderate disagreements', () => {
    const comparison: AxisComparison = {
      axis: 'nose width',
      valueA: 'narrow',
      valueB: 'broad',
      agreement: false,
      similarity: 0.60,
      percentDiff: 12,
    };

    const result = narrativeForAxis(comparison);

    expect(result).toContain('narrow vs broad');
  });

  it('should emphasize contrast for large differences', () => {
    const comparison: AxisComparison = {
      axis: 'jaw width',
      valueA: 'narrow',
      valueB: 'wide',
      agreement: false,
      similarity: 0.30,
      percentDiff: 25,
    };

    const result = narrativeForAxis(comparison);

    expect(result).toContain('differs');
    expect(result).toContain('narrow vs wide');
  });
});

describe('narrativeForFeature', () => {
  it('should generate high similarity narrative for strong agreement', () => {
    const comparison: FeatureComparison = {
      feature: 'eyes',
      axes: [
        { axis: 'canthal tilt', valueA: 'positive', valueB: 'positive', agreement: true, similarity: 0.95 },
        { axis: 'eye size', valueA: 'average', valueB: 'average', agreement: true, similarity: 0.98 },
        { axis: 'interocular distance', valueA: 'balanced', valueB: 'balanced', agreement: true, similarity: 0.92 },
      ],
      overallAgreement: 1.0,
    };

    const result = narrativeForFeature(comparison);

    expect(result).toContain('Eyes are highly similar');
    expect(result).toContain('positive');
    expect(result).toContain('average');
  });

  it('should generate difference narrative for low agreement', () => {
    const comparison: FeatureComparison = {
      feature: 'nose',
      axes: [
        { axis: 'nose width', valueA: 'narrow', valueB: 'broad', agreement: false, similarity: 0.40 },
        { axis: 'bridge contour', valueA: 'convex', valueB: 'concave', agreement: false, similarity: 0.30 },
      ],
      overallAgreement: 0.0,
    };

    const result = narrativeForFeature(comparison);

    expect(result).toContain('Nose differ');
    expect(result).toContain('nose width');
  });

  it('should generate mixed narrative for partial agreement', () => {
    const comparison: FeatureComparison = {
      feature: 'mouth',
      axes: [
        { axis: 'lip fullness', valueA: 'full', valueB: 'full', agreement: true, similarity: 0.92 },
        { axis: 'cupid\'s bow definition', valueA: 'pronounced', valueB: 'subtle', agreement: false, similarity: 0.50 },
      ],
      overallAgreement: 0.5,
    };

    const result = narrativeForFeature(comparison);

    expect(result).toContain('Mouth partially match');
    expect(result).toContain('lip fullness');
    expect(result).toContain('cupid\'s bow definition');
  });
});

describe('detailedNarrativeForFeature', () => {
  it('should organize narratives by shared and distinctive characteristics', () => {
    const comparison: FeatureComparison = {
      feature: 'eyes',
      axes: [
        { axis: 'canthal tilt', valueA: 'positive', valueB: 'positive', agreement: true, similarity: 0.95 },
        { axis: 'eye size', valueA: 'average', valueB: 'wide', agreement: false, similarity: 0.75 },
      ],
      overallAgreement: 0.5,
    };

    const result = detailedNarrativeForFeature(comparison);

    expect(result.shared).toHaveLength(1);
    expect(result.shared[0]).toContain('canthal tilt');
    expect(result.imageA).toHaveLength(1);
    expect(result.imageA[0]).toContain('Eye size: average');
    expect(result.imageB).toHaveLength(1);
    expect(result.imageB[0]).toContain('Eye size: wide');
  });
});

describe('overallNarrative', () => {
  it('should generate high congruence narrative', () => {
    const comparisons: FeatureComparison[] = [
      { feature: 'eyes', axes: [], overallAgreement: 0.9 },
      { feature: 'nose', axes: [], overallAgreement: 0.85 },
    ];

    const result = overallNarrative(comparisons, 0.88);

    expect(result).toContain('High morphological congruence');
  });

  it('should generate moderate similarity narrative', () => {
    const comparisons: FeatureComparison[] = [
      { feature: 'eyes', axes: [], overallAgreement: 0.6 },
      { feature: 'nose', axes: [], overallAgreement: 0.4 },
    ];

    const result = overallNarrative(comparisons, 0.55);

    expect(result).toContain('Moderate morphological similarity');
  });

  it('should generate distinct features narrative for low scores', () => {
    const comparisons: FeatureComparison[] = [
      { feature: 'eyes', axes: [], overallAgreement: 0.2 },
      { feature: 'nose', axes: [], overallAgreement: 0.1 },
    ];

    const result = overallNarrative(comparisons, 0.25);

    expect(result).toContain('Distinct morphological features');
  });

  it('should include feature-specific details for high agreement', () => {
    const comparisons: FeatureComparison[] = [
      { feature: 'eyes', axes: [], overallAgreement: 0.85 },
      { feature: 'nose', axes: [], overallAgreement: 0.25 },
    ];

    const result = overallNarrative(comparisons, 0.60);

    expect(result).toContain('Similar eyes');
    expect(result).toContain('different nose');
  });
});

describe('sharedCharacteristicsNarrative', () => {
  it('should handle no shared characteristics', () => {
    const result = sharedCharacteristicsNarrative([]);

    expect(result).toContain('No shared');
  });

  it('should handle single shared characteristic', () => {
    const result = sharedCharacteristicsNarrative(['Both share positive canthal tilt']);

    expect(result).toBe('Both share positive canthal tilt');
  });

  it('should handle few shared characteristics', () => {
    const result = sharedCharacteristicsNarrative([
      'Both share positive canthal tilt',
      'Both share average eye size',
    ]);

    expect(result).toContain('positive canthal tilt');
    expect(result).toContain('average eye size');
  });

  it('should summarize many shared characteristics', () => {
    const shared = [
      'Both share positive canthal tilt',
      'Both share average eye size',
      'Both share balanced interocular distance',
      'Both share average nose width',
      'Both share full lips',
    ];

    const result = sharedCharacteristicsNarrative(shared);

    expect(result).toContain('3 other shared characteristics');
  });
});

describe('contrastNarrative', () => {
  it('should generate agreement narrative', () => {
    const comparison: AxisComparison = {
      axis: 'canthal tilt',
      valueA: 'positive',
      valueB: 'positive',
      agreement: true,
      similarity: 0.95,
    };

    const result = contrastNarrative(comparison, 'Alice', 'Bob');

    expect(result).toContain('Both subjects');
    expect(result).toContain('positive canthal tilt');
  });

  it('should generate minor difference narrative', () => {
    const comparison: AxisComparison = {
      axis: 'eye size',
      valueA: 'average',
      valueB: 'wide',
      agreement: false,
      similarity: 0.88,
      percentDiff: 5,
    };

    const result = contrastNarrative(comparison, 'Alice', 'Bob');

    expect(result).toContain('Alice');
    expect(result).toContain('Bob');
    expect(result).toContain('average');
    expect(result).toContain('wide');
    expect(result).toContain('minor difference');
  });

  it('should generate contrast narrative without minor qualifier', () => {
    const comparison: AxisComparison = {
      axis: 'nose width',
      valueA: 'narrow',
      valueB: 'broad',
      agreement: false,
      similarity: 0.60,
      percentDiff: 15,
    };

    const result = contrastNarrative(comparison, 'Alice', 'Bob');

    expect(result).toContain('Alice');
    expect(result).toContain('Bob');
    expect(result).toContain('narrow');
    expect(result).toContain('broad');
    expect(result).not.toContain('minor');
  });
});

describe('dimensionalNarrative', () => {
  it('should describe nearly identical measurements', () => {
    const comparison: AxisComparison = {
      axis: 'lip fullness',
      valueA: 'average',
      valueB: 'average',
      agreement: true,
      similarity: 0.98,
      percentDiff: 1.5,
      direction: 'higher',
    };

    const result = dimensionalNarrative(comparison, 'Alice', 'Bob');

    expect(result).toContain('nearly identical');
  });

  it('should describe larger measurement', () => {
    const comparison: AxisComparison = {
      axis: 'nose width',
      valueA: 'broad',
      valueB: 'average',
      agreement: false,
      similarity: 0.75,
      percentDiff: 12,
      direction: 'higher',
    };

    const result = dimensionalNarrative(comparison, 'Alice', 'Bob');

    expect(result).toContain('Alice');
    expect(result).toContain('12.0%');
    expect(result).toContain('larger');
  });

  it('should describe smaller measurement', () => {
    const comparison: AxisComparison = {
      axis: 'jaw width',
      valueA: 'narrow',
      valueB: 'wide',
      agreement: false,
      similarity: 0.55,
      percentDiff: 18,
      direction: 'lower',
    };

    const result = dimensionalNarrative(comparison, 'Alice', 'Bob');

    expect(result).toContain('Bob');
    expect(result).toContain('18.0%');
    expect(result).toContain('smaller');
  });
});

describe('generateNarrative', () => {
  it('should generate complete narrative result', () => {
    const comparisons: FeatureComparison[] = [
      {
        feature: 'eyes',
        axes: [
          { axis: 'canthal tilt', valueA: 'positive', valueB: 'positive', agreement: true, similarity: 0.95 },
          { axis: 'eye size', valueA: 'average', valueB: 'average', agreement: true, similarity: 0.98 },
        ],
        overallAgreement: 1.0,
      },
      {
        feature: 'nose',
        axes: [
          { axis: 'nose width', valueA: 'average', valueB: 'broad', agreement: false, similarity: 0.70 },
        ],
        overallAgreement: 0.0,
      },
    ];

    const sharedAxes = ['Both share positive canthal tilt', 'Both share average eye size'];

    const result = generateNarrative(comparisons, sharedAxes, 0.88);

    expect(result.overall).toBeTruthy();
    expect(result.overall).toContain('morphological');
    expect(result.featureSummaries).toBeDefined();
    expect(result.featureSummaries['eyes']).toBeTruthy();
    expect(result.featureSummaries['nose']).toBeTruthy();
    expect(result.axisDetails).toBeDefined();
    expect(result.axisDetails['eyes']).toBeDefined();
    expect(result.axisDetails['eyes'].shared.length + result.axisDetails['eyes'].imageA.length + result.axisDetails['eyes'].imageB.length).toBe(2);
    expect(result.axisDetails['nose']).toBeDefined();
    expect(result.sharedCharacteristics).toBeTruthy();
  });

  it('should handle low similarity scenario', () => {
    const comparisons: FeatureComparison[] = [
      {
        feature: 'eyes',
        axes: [
          { axis: 'canthal tilt', valueA: 'positive', valueB: 'negative', agreement: false, similarity: 0.30 },
        ],
        overallAgreement: 0.0,
      },
      {
        feature: 'nose',
        axes: [
          { axis: 'nose width', valueA: 'narrow', valueB: 'broad', agreement: false, similarity: 0.25 },
        ],
        overallAgreement: 0.0,
      },
    ];

    const result = generateNarrative(comparisons, [], 0.28);

    expect(result.overall).toContain('Distinct');
    expect(result.sharedCharacteristics).toContain('No shared');
  });

  it('should include all feature summaries', () => {
    const comparisons: FeatureComparison[] = [
      { feature: 'eyes', axes: [], overallAgreement: 0.9 },
      { feature: 'nose', axes: [], overallAgreement: 0.5 },
      { feature: 'mouth', axes: [], overallAgreement: 0.2 },
      { feature: 'jaw', axes: [], overallAgreement: 0.8 },
    ];

    const result = generateNarrative(comparisons, [], 0.60);

    expect(Object.keys(result.featureSummaries)).toEqual(['eyes', 'nose', 'mouth', 'jaw']);
  });
});
