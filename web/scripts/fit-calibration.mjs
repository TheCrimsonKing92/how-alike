#!/usr/bin/env node

/**
 * Fit calibration curve from browser-pipeline data
 *
 * Tries multiple regression methods and selects the best based on MAE
 */

import fs from 'fs/promises';

async function loadCalibrationData(csvPath) {
  const content = await fs.readFile(csvPath, 'utf-8');
  const lines = content.trim().split('\n').slice(1); // Skip header

  return lines.map(line => {
    const [filename, actualAge, rawPrediction] = line.split(',');
    return {
      filename,
      actual: parseFloat(actualAge),
      raw: parseFloat(rawPrediction)
    };
  });
}

// Simple linear regression: y = mx + b
function fitLinear(data) {
  const n = data.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

  for (const point of data) {
    sumX += point.raw;
    sumY += point.actual;
    sumXY += point.raw * point.actual;
    sumX2 += point.raw * point.raw;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return {
    type: 'linear',
    params: { slope, intercept },
    predict: (x) => slope * x + intercept
  };
}

// Piecewise linear regression with auto-selected threshold
function fitPiecewise(data, threshold) {
  const lowData = data.filter(d => d.raw <= threshold);
  const highData = data.filter(d => d.raw > threshold);

  if (lowData.length < 2 || highData.length < 2) {
    return null; // Not enough data for both segments
  }

  const lowFit = fitLinear(lowData);
  const highFit = fitLinear(highData);

  return {
    type: 'piecewise',
    params: {
      threshold,
      lowSlope: lowFit.params.slope,
      lowIntercept: lowFit.params.intercept,
      highSlope: highFit.params.slope,
      highIntercept: highFit.params.intercept
    },
    predict: (x) => {
      if (x <= threshold) {
        return lowFit.predict(x);
      } else {
        return highFit.predict(x);
      }
    }
  };
}

// Find best threshold for piecewise regression
function findBestPiecewiseThreshold(data) {
  const rawValues = data.map(d => d.raw).sort((a, b) => a - b);
  const minThreshold = rawValues[2]; // At least 3 points in low segment
  const maxThreshold = rawValues[rawValues.length - 3]; // At least 3 points in high segment

  let bestThreshold = null;
  let bestMAE = Infinity;

  // Try thresholds at each data point
  for (let i = 0; i < rawValues.length; i++) {
    const threshold = rawValues[i];
    if (threshold < minThreshold || threshold > maxThreshold) continue;

    const model = fitPiecewise(data, threshold);
    if (!model) continue;

    const mae = calculateMAE(data, model);
    if (mae < bestMAE) {
      bestMAE = mae;
      bestThreshold = threshold;
    }
  }

  return bestThreshold;
}

// 3-segment piecewise linear regression
function fitPiecewise3(data, threshold1, threshold2) {
  const lowData = data.filter(d => d.raw <= threshold1);
  const midData = data.filter(d => d.raw > threshold1 && d.raw <= threshold2);
  const highData = data.filter(d => d.raw > threshold2);

  if (lowData.length < 2 || midData.length < 2 || highData.length < 2) {
    return null; // Not enough data for all segments
  }

  const lowFit = fitLinear(lowData);
  const midFit = fitLinear(midData);
  const highFit = fitLinear(highData);

  return {
    type: 'piecewise3',
    params: {
      threshold1,
      threshold2,
      lowSlope: lowFit.params.slope,
      lowIntercept: lowFit.params.intercept,
      midSlope: midFit.params.slope,
      midIntercept: midFit.params.intercept,
      highSlope: highFit.params.slope,
      highIntercept: highFit.params.intercept
    },
    predict: (x) => {
      if (x <= threshold1) {
        return lowFit.predict(x);
      } else if (x <= threshold2) {
        return midFit.predict(x);
      } else {
        return highFit.predict(x);
      }
    }
  };
}

// Find best thresholds for 3-segment piecewise regression
function findBestPiecewise3Thresholds(data) {
  const rawValues = data.map(d => d.raw).sort((a, b) => a - b);
  const n = rawValues.length;

  // Need at least 10 points per segment minimum
  const minPoints = 10;
  if (n < minPoints * 3) return null;

  let bestThresholds = null;
  let bestMAE = Infinity;

  // Grid search over possible threshold pairs
  // Use percentiles for efficiency
  const percentiles = [0.2, 0.25, 0.3, 0.33, 0.4, 0.45, 0.5, 0.55, 0.6, 0.67, 0.7, 0.75, 0.8];

  for (const p1 of percentiles) {
    for (const p2 of percentiles) {
      if (p2 <= p1 + 0.15) continue; // Ensure reasonable spacing

      const idx1 = Math.floor(n * p1);
      const idx2 = Math.floor(n * p2);

      const threshold1 = rawValues[idx1];
      const threshold2 = rawValues[idx2];

      const model = fitPiecewise3(data, threshold1, threshold2);
      if (!model) continue;

      const mae = calculateMAE(data, model);
      if (mae < bestMAE) {
        bestMAE = mae;
        bestThresholds = { threshold1, threshold2 };
      }
    }
  }

  return bestThresholds;
}

// Polynomial regression: y = a + bx + cx^2
function fitPolynomial(data) {
  const n = data.length;
  let sumX = 0, sumY = 0, sumX2 = 0, sumX3 = 0, sumX4 = 0;
  let sumXY = 0, sumX2Y = 0;

  for (const point of data) {
    const x = point.raw;
    const y = point.actual;
    sumX += x;
    sumY += y;
    sumX2 += x * x;
    sumX3 += x * x * x;
    sumX4 += x * x * x * x;
    sumXY += x * y;
    sumX2Y += x * x * y;
  }

  // Solve system of equations using Cramer's rule
  const det = n * (sumX2 * sumX4 - sumX3 * sumX3)
            - sumX * (sumX * sumX4 - sumX2 * sumX3)
            + sumX2 * (sumX * sumX3 - sumX2 * sumX2);

  const a = (sumY * (sumX2 * sumX4 - sumX3 * sumX3)
           - sumX * (sumXY * sumX4 - sumX2Y * sumX3)
           + sumX2 * (sumXY * sumX3 - sumX2Y * sumX2)) / det;

  const b = (n * (sumXY * sumX4 - sumX2Y * sumX3)
           - sumY * (sumX * sumX4 - sumX2 * sumX3)
           + sumX2 * (sumX * sumX2Y - sumXY * sumX2)) / det;

  const c = (n * (sumX2 * sumX2Y - sumXY * sumX3)
           - sumX * (sumX * sumX2Y - sumXY * sumX2)
           + sumY * (sumX * sumX3 - sumX2 * sumX2)) / det;

  return {
    type: 'polynomial',
    params: { a, b, c },
    predict: (x) => a + b * x + c * x * x
  };
}

function calculateMAE(data, model) {
  const errors = data.map(d => Math.abs(model.predict(d.raw) - d.actual));
  return errors.reduce((sum, e) => sum + e, 0) / errors.length;
}

function calculateRMSE(data, model) {
  const squaredErrors = data.map(d => {
    const error = model.predict(d.raw) - d.actual;
    return error * error;
  });
  return Math.sqrt(squaredErrors.reduce((sum, e) => sum + e, 0) / squaredErrors.length);
}

function evaluateModel(data, model) {
  const mae = calculateMAE(data, model);
  const rmse = calculateRMSE(data, model);

  // Calculate per-age-group errors
  const ageGroups = [
    { name: 'Children (0-12)', min: 0, max: 12 },
    { name: 'Teens (13-19)', min: 13, max: 19 },
    { name: 'Young Adults (20-35)', min: 20, max: 35 },
    { name: 'Middle Age (36-59)', min: 36, max: 59 },
    { name: 'Seniors (60+)', min: 60, max: 120 }
  ];

  const groupErrors = ageGroups.map(group => {
    const groupData = data.filter(d => d.actual >= group.min && d.actual <= group.max);
    if (groupData.length === 0) return { ...group, mae: null, count: 0 };

    const mae = calculateMAE(groupData, model);
    return { ...group, mae, count: groupData.length };
  });

  return { mae, rmse, groupErrors };
}

function printModelEvaluation(name, model, evaluation) {
  console.log(`\n${name}`);
  console.log('='.repeat(name.length));
  console.log(`Overall MAE: ${evaluation.mae.toFixed(2)} years`);
  console.log(`Overall RMSE: ${evaluation.rmse.toFixed(2)} years`);
  console.log('\nPer-age-group MAE:');
  for (const group of evaluation.groupErrors) {
    if (group.count > 0) {
      console.log(`  ${group.name}: ${group.mae.toFixed(2)} years (n=${group.count})`);
    } else {
      console.log(`  ${group.name}: No data`);
    }
  }
}

function generateCode(model) {
  if (model.type === 'linear') {
    const { slope, intercept } = model.params;
    return `
export function calibratePredictedAge(rawAge: number): number {
  const calibrated = ${slope.toFixed(4)} * rawAge + ${intercept.toFixed(4)};
  return clamp(calibrated, 0, 120);
}`;
  } else if (model.type === 'piecewise') {
    const { threshold, lowSlope, lowIntercept, highSlope, highIntercept } = model.params;
    return `
const AGE_CALIBRATION = {
  threshold: ${threshold.toFixed(1)},
  lowSlope: ${lowSlope.toFixed(4)},
  lowIntercept: ${lowIntercept.toFixed(2)},
  highSlope: ${highSlope.toFixed(4)},
  highIntercept: ${highIntercept.toFixed(2)},
  minAge: 0,
  maxAge: 120,
};

export function calibratePredictedAge(rawAge: number): number {
  const { threshold, lowSlope, lowIntercept, highSlope, highIntercept, minAge, maxAge } = AGE_CALIBRATION;
  const calibrated =
    rawAge <= threshold
      ? lowSlope * rawAge + lowIntercept
      : highSlope * rawAge + highIntercept;
  return clamp(calibrated, minAge, maxAge);
}`;
  } else if (model.type === 'piecewise3') {
    const { threshold1, threshold2, lowSlope, lowIntercept, midSlope, midIntercept, highSlope, highIntercept } = model.params;
    return `
const AGE_CALIBRATION = {
  threshold1: ${threshold1.toFixed(1)},
  threshold2: ${threshold2.toFixed(1)},
  lowSlope: ${lowSlope.toFixed(4)},
  lowIntercept: ${lowIntercept.toFixed(2)},
  midSlope: ${midSlope.toFixed(4)},
  midIntercept: ${midIntercept.toFixed(2)},
  highSlope: ${highSlope.toFixed(4)},
  highIntercept: ${highIntercept.toFixed(2)},
  minAge: 0,
  maxAge: 120,
};

export function calibratePredictedAge(rawAge: number): number {
  const { threshold1, threshold2, lowSlope, lowIntercept, midSlope, midIntercept, highSlope, highIntercept, minAge, maxAge } = AGE_CALIBRATION;
  let calibrated;
  if (rawAge <= threshold1) {
    calibrated = lowSlope * rawAge + lowIntercept;
  } else if (rawAge <= threshold2) {
    calibrated = midSlope * rawAge + midIntercept;
  } else {
    calibrated = highSlope * rawAge + highIntercept;
  }
  return clamp(calibrated, minAge, maxAge);
}`;
  } else if (model.type === 'polynomial') {
    const { a, b, c } = model.params;
    return `
export function calibratePredictedAge(rawAge: number): number {
  const calibrated = ${a.toFixed(4)} + ${b.toFixed(4)} * rawAge + ${c.toFixed(6)} * rawAge * rawAge;
  return clamp(calibrated, 0, 120);
}`;
  }
}

async function main() {
  const csvPath = process.argv[2] || 'calibration-data.csv';

  console.log('Loading calibration data...');
  const data = await loadCalibrationData(csvPath);
  console.log(`Loaded ${data.length} data points\n`);

  // Sort by raw prediction for analysis
  data.sort((a, b) => a.raw - b.raw);

  console.log('Raw prediction range:', data[0].raw.toFixed(1), 'to', data[data.length - 1].raw.toFixed(1));
  console.log('Actual age range:', Math.min(...data.map(d => d.actual)), 'to', Math.max(...data.map(d => d.actual)));

  // Fit models
  console.log('\n' + '='.repeat(60));
  console.log('FITTING CALIBRATION MODELS');
  console.log('='.repeat(60));

  const linearModel = fitLinear(data);
  const linearEval = evaluateModel(data, linearModel);
  printModelEvaluation('1. Linear Regression', linearModel, linearEval);

  const bestThreshold = findBestPiecewiseThreshold(data);
  const piecewiseModel = fitPiecewise(data, bestThreshold);
  const piecewiseEval = evaluateModel(data, piecewiseModel);
  printModelEvaluation('2. Piecewise Linear (2 segments, auto threshold)', piecewiseModel, piecewiseEval);

  const bestThresholds3 = findBestPiecewise3Thresholds(data);
  let piecewise3Model = null;
  let piecewise3Eval = null;
  if (bestThresholds3) {
    piecewise3Model = fitPiecewise3(data, bestThresholds3.threshold1, bestThresholds3.threshold2);
    piecewise3Eval = evaluateModel(data, piecewise3Model);
    printModelEvaluation('3. Piecewise Linear (3 segments, auto thresholds)', piecewise3Model, piecewise3Eval);
  } else {
    console.log('\n3. Piecewise Linear (3 segments, auto thresholds)');
    console.log('='.repeat(48));
    console.log('Not enough data for 3-segment fit (need 30+ samples)');
  }

  const polynomialModel = fitPolynomial(data);
  const polynomialEval = evaluateModel(data, polynomialModel);
  printModelEvaluation('4. Polynomial (degree 2)', polynomialModel, polynomialEval);

  // Select best model
  const models = [
    { name: 'Linear', model: linearModel, eval: linearEval },
    { name: 'Piecewise-2', model: piecewiseModel, eval: piecewiseEval },
    { name: 'Polynomial', model: polynomialModel, eval: polynomialEval }
  ];

  if (piecewise3Model) {
    models.push({ name: 'Piecewise-3', model: piecewise3Model, eval: piecewise3Eval });
  }

  models.sort((a, b) => a.eval.mae - b.eval.mae);
  const best = models[0];

  console.log('\n' + '='.repeat(60));
  console.log('RECOMMENDATION');
  console.log('='.repeat(60));
  console.log(`\nBest model: ${best.name} (MAE: ${best.eval.mae.toFixed(2)} years)`);
  console.log('\nGenerated code for age-estimation.ts:');
  console.log(generateCode(best.model));

  // Write results to file
  const results = {
    dataPoints: data.length,
    models: models.map(m => ({
      name: m.name,
      mae: m.eval.mae,
      rmse: m.eval.rmse,
      params: m.model.params
    })),
    recommendation: {
      model: best.name,
      mae: best.eval.mae,
      code: generateCode(best.model)
    }
  };

  await fs.writeFile('calibration-results.json', JSON.stringify(results, null, 2));
  console.log('\n✓ Results saved to calibration-results.json');
}

main().catch(console.error);
