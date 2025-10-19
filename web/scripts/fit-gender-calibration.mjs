#!/usr/bin/env node

/**
 * Fit gender-specific calibration curves from browser-pipeline data
 *
 * Fits separate 3-segment piecewise linear regressions for male and female predictions
 * to reduce systematic gender-based errors in age estimation.
 */

import fs from 'fs/promises';

async function loadCalibrationData(csvPath) {
  const content = await fs.readFile(csvPath, 'utf-8');
  const lines = content.trim().split('\n').slice(1); // Skip header

  return lines.map(line => {
    const [filename, actualAge, rawPrediction, calibratedPrediction, error, gender] = line.split(',');
    return {
      filename,
      actual: parseFloat(actualAge),
      raw: parseFloat(rawPrediction),
      gender: gender?.trim()
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

  // Need at least 5 points per segment for gender-specific data (smaller subsets)
  const minPoints = 5;
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

function generateGenderSpecificCode(maleModel, femaleModel) {
  const mp = maleModel.params;
  const fp = femaleModel.params;

  return `
const AGE_CALIBRATION_MALE = {
  threshold1: ${mp.threshold1.toFixed(1)},
  threshold2: ${mp.threshold2.toFixed(1)},
  lowSlope: ${mp.lowSlope.toFixed(4)},
  lowIntercept: ${mp.lowIntercept.toFixed(2)},
  midSlope: ${mp.midSlope.toFixed(4)},
  midIntercept: ${mp.midIntercept.toFixed(2)},
  highSlope: ${mp.highSlope.toFixed(4)},
  highIntercept: ${mp.highIntercept.toFixed(2)},
  minAge: 0,
  maxAge: 120,
} as const;

const AGE_CALIBRATION_FEMALE = {
  threshold1: ${fp.threshold1.toFixed(1)},
  threshold2: ${fp.threshold2.toFixed(1)},
  lowSlope: ${fp.lowSlope.toFixed(4)},
  lowIntercept: ${fp.lowIntercept.toFixed(2)},
  midSlope: ${fp.midSlope.toFixed(4)},
  midIntercept: ${fp.midIntercept.toFixed(2)},
  highSlope: ${fp.highSlope.toFixed(4)},
  highIntercept: ${fp.highIntercept.toFixed(2)},
  minAge: 0,
  maxAge: 120,
} as const;

export function calibratePredictedAge(predictedAge: number, gender: 'male' | 'female'): number {
  const cal = gender === 'male' ? AGE_CALIBRATION_MALE : AGE_CALIBRATION_FEMALE;
  const { threshold1, threshold2, lowSlope, lowIntercept, midSlope, midIntercept, highSlope, highIntercept, minAge, maxAge } = cal;

  let age;
  if (predictedAge <= threshold1) {
    age = lowSlope * predictedAge + lowIntercept;
  } else if (predictedAge <= threshold2) {
    age = midSlope * predictedAge + midIntercept;
  } else {
    age = highSlope * predictedAge + highIntercept;
  }
  return clamp(age, minAge, maxAge);
}`;
}

async function main() {
  const csvPath = process.argv[2] || '../calibration-data-all.csv';

  console.log('Loading calibration data...');
  const data = await loadCalibrationData(csvPath);
  console.log(`Loaded ${data.length} data points\n`);

  // Split by gender
  const maleData = data.filter(d => d.gender === 'male');
  const femaleData = data.filter(d => d.gender === 'female');

  console.log(`Male samples: ${maleData.length}`);
  console.log(`Female samples: ${femaleData.length}\n`);

  // Sort by raw prediction for analysis
  maleData.sort((a, b) => a.raw - b.raw);
  femaleData.sort((a, b) => a.raw - b.raw);

  console.log('='.repeat(60));
  console.log('FITTING GENDER-SPECIFIC CALIBRATION MODELS');
  console.log('='.repeat(60));

  // Fit male calibration
  console.log('\n--- MALE CALIBRATION ---');
  const maleThresholds = findBestPiecewise3Thresholds(maleData);
  if (!maleThresholds) {
    console.error('ERROR: Not enough male data for 3-segment fit');
    process.exit(1);
  }

  const maleModel = fitPiecewise3(maleData, maleThresholds.threshold1, maleThresholds.threshold2);
  const maleEval = evaluateModel(maleData, maleModel);
  printModelEvaluation('Male 3-Segment Piecewise', maleModel, maleEval);

  // Fit female calibration
  console.log('\n--- FEMALE CALIBRATION ---');
  const femaleThresholds = findBestPiecewise3Thresholds(femaleData);
  if (!femaleThresholds) {
    console.error('ERROR: Not enough female data for 3-segment fit');
    process.exit(1);
  }

  const femaleModel = fitPiecewise3(femaleData, femaleThresholds.threshold1, femaleThresholds.threshold2);
  const femaleEval = evaluateModel(femaleData, femaleModel);
  printModelEvaluation('Female 3-Segment Piecewise', femaleModel, femaleEval);

  // Combined evaluation using gender-specific models
  console.log('\n--- COMBINED EVALUATION (Gender-Specific Models) ---');
  const combinedErrors = data.map(d => {
    const model = d.gender === 'male' ? maleModel : femaleModel;
    return Math.abs(model.predict(d.raw) - d.actual);
  });
  const combinedMAE = combinedErrors.reduce((sum, e) => sum + e, 0) / combinedErrors.length;
  const combinedRMSE = Math.sqrt(
    combinedErrors.reduce((sum, e) => sum + e * e, 0) / combinedErrors.length
  );

  console.log(`Combined MAE: ${combinedMAE.toFixed(2)} years`);
  console.log(`Combined RMSE: ${combinedRMSE.toFixed(2)} years`);

  // For comparison, fit single unified model on all data
  console.log('\n--- UNIFIED CALIBRATION (for comparison) ---');
  const allData = [...data].sort((a, b) => a.raw - b.raw);
  const unifiedThresholds = findBestPiecewise3Thresholds(allData);
  const unifiedModel = fitPiecewise3(allData, unifiedThresholds.threshold1, unifiedThresholds.threshold2);
  const unifiedEval = evaluateModel(allData, unifiedModel);
  printModelEvaluation('Unified 3-Segment Piecewise', unifiedModel, unifiedEval);

  console.log('\n' + '='.repeat(60));
  console.log('RECOMMENDATION');
  console.log('='.repeat(60));
  console.log(`\nGender-specific MAE: ${combinedMAE.toFixed(2)} years`);
  console.log(`Unified model MAE: ${unifiedEval.mae.toFixed(2)} years`);

  const improvement = unifiedEval.mae - combinedMAE;
  const improvementPct = (improvement / unifiedEval.mae) * 100;

  if (improvement > 0) {
    console.log(`\n✓ Gender-specific calibration improves MAE by ${improvement.toFixed(2)} years (${improvementPct.toFixed(1)}%)`);
  } else {
    console.log(`\n✗ Gender-specific calibration does not improve MAE (worse by ${Math.abs(improvement).toFixed(2)} years)`);
  }

  console.log('\nGenerated code for age-estimation.ts:');
  console.log(generateGenderSpecificCode(maleModel, femaleModel));

  // Write results to file
  const results = {
    dataPoints: {
      total: data.length,
      male: maleData.length,
      female: femaleData.length
    },
    genderSpecific: {
      male: {
        mae: maleEval.mae,
        rmse: maleEval.rmse,
        params: maleModel.params
      },
      female: {
        mae: femaleEval.mae,
        rmse: femaleEval.rmse,
        params: femaleModel.params
      },
      combined: {
        mae: combinedMAE,
        rmse: combinedRMSE
      }
    },
    unified: {
      mae: unifiedEval.mae,
      rmse: unifiedEval.rmse,
      params: unifiedModel.params
    },
    improvement: {
      mae: improvement,
      percentage: improvementPct
    },
    code: generateGenderSpecificCode(maleModel, femaleModel)
  };

  await fs.writeFile('gender-calibration-results.json', JSON.stringify(results, null, 2));
  console.log('\n✓ Results saved to gender-calibration-results.json');
}

main().catch(console.error);
