#!/usr/bin/env node

/**
 * Shared utilities for evaluating age estimation results.
 *
 * These helpers run in both Node.js scripts and Vitest environments.
 */

/**
 * Compute aggregate metrics for a list of predictions.
 *
 * @param {Array<{
 *   trueAge: number;
 *   predictedAge: number;
 *   confidence?: number;
 *   genderCorrect?: boolean;
 * }>} predictions
 * @returns {{ count: number; mae: number; rmse: number; bias: number; medianAbsError: number;
 *   genderAccuracy: number; meanConfidence: number; }}
 */
export function computeAgeStats(predictions) {
  const count = predictions.length;
  if (count === 0) {
    return {
      count: 0,
      mae: 0,
      rmse: 0,
      bias: 0,
      medianAbsError: 0,
      genderAccuracy: 0,
      meanConfidence: 0,
    };
  }

  let sumAbs = 0;
  let sumSquared = 0;
  let sumBias = 0;
  let sumConfidence = 0;
  let genderCorrect = 0;
  const absErrors = [];

  for (const item of predictions) {
    const error = item.predictedAge - item.trueAge;
    const absError = Math.abs(error);

    sumAbs += absError;
    sumSquared += error * error;
    sumBias += error;
    absErrors.push(absError);

    if (typeof item.confidence === "number") {
      sumConfidence += item.confidence;
    }
    if (item.genderCorrect === true) {
      genderCorrect += 1;
    }
  }

  absErrors.sort((a, b) => a - b);
  const medianAbsError =
    absErrors.length % 2 === 1
      ? absErrors[(absErrors.length - 1) / 2]
      : (absErrors[absErrors.length / 2 - 1] + absErrors[absErrors.length / 2]) / 2;

  return {
    count,
    mae: sumAbs / count,
    rmse: Math.sqrt(sumSquared / count),
    bias: sumBias / count,
    medianAbsError,
    genderAccuracy: count > 0 ? genderCorrect / count : 0,
    meanConfidence: count > 0 ? sumConfidence / count : 0,
  };
}

/**
 * Group predictions by age decade (0s, 10s, ..., 110s).
 *
 * @param {Array<{ trueAge: number }>} predictions
 * @returns {Array<{ decade: number; items: any[] }>}
 */
export function bucketByDecade(predictions) {
  const map = new Map();
  for (const item of predictions) {
    const decade = Math.min(Math.floor(item.trueAge / 10) * 10, 110);
    if (!map.has(decade)) {
      map.set(decade, []);
    }
    map.get(decade).push(item);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([decade, items]) => ({ decade, items }));
}

/**
 * Compute stats for each decade bucket.
 *
 * @param {Array<{ trueAge: number; predictedAge: number; confidence?: number; genderCorrect?: boolean }>} predictions
 * @returns {Array<{ decade: number; stats: ReturnType<typeof computeAgeStats> }>}
 */
export function decadeStats(predictions) {
  return bucketByDecade(predictions).map(({ decade, items }) => ({
    decade,
    stats: computeAgeStats(items),
  }));
}
