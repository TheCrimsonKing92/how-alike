import { describe, expect, it } from 'vitest';

// Import shared metrics helpers from scripts directory
import { computeAgeStats, bucketByDecade, decadeStats } from '../../scripts/age-metrics.mjs';

describe('Age metrics utilities', () => {
  const sample = [
    { trueAge: 10, predictedAge: 12, confidence: 0.8, genderCorrect: true },
    { trueAge: 20, predictedAge: 35, confidence: 0.6, genderCorrect: false },
    { trueAge: 25, predictedAge: 21, confidence: 0.7, genderCorrect: true },
    { trueAge: 40, predictedAge: 50, confidence: 0.5, genderCorrect: false },
  ];

  it('computes aggregate stats', () => {
    const stats = computeAgeStats(sample);

    expect(stats.count).toBe(4);
    expect(stats.mae).toBeCloseTo((2 + 15 + 4 + 10) / 4, 5);
    const bias = ((12 - 10) + (35 - 20) + (21 - 25) + (50 - 40)) / 4;
    expect(stats.bias).toBeCloseTo(bias, 5);
    const rmse = Math.sqrt(((4 + 225 + 16 + 100) / 4));
    expect(stats.rmse).toBeCloseTo(rmse, 5);
    expect(stats.medianAbsError).toBe(7); // sorted abs errors: [2,4,10,15] -> median = (4+10)/2
    expect(stats.genderAccuracy).toBeCloseTo(0.5, 5);
    expect(stats.meanConfidence).toBeCloseTo((0.8 + 0.6 + 0.7 + 0.5) / 4, 5);
  });

  it('groups by decade', () => {
    const buckets = bucketByDecade(sample);
    expect(buckets.map((b) => b.decade)).toEqual([10, 20, 40]);
    expect(buckets.find((b) => b.decade === 20)?.items.length).toBe(2);
  });

  it('computes decade stats', () => {
    const stats = decadeStats(sample);
    const twenties = stats.find((entry) => entry.decade === 20);
    expect(twenties).toBeDefined();
    expect(twenties?.stats.count).toBe(2);
  });
});

