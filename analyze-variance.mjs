#!/usr/bin/env node

/**
 * Analyze raw prediction variance by age group to determine if
 * poor child predictions are due to model limitations or calibration issues
 */

import fs from 'fs/promises';

const csv = await fs.readFile('calibration-data-all.csv', 'utf-8');
const lines = csv.trim().split('\n').slice(1); // Skip header

// Group samples by age
const byAge = {};
for (const line of lines) {
  if (!line.trim()) continue;
  const [filename, actualAge, rawPrediction] = line.split(',');
  const age = parseInt(actualAge);
  const raw = parseFloat(rawPrediction);

  if (!byAge[age]) byAge[age] = [];
  byAge[age].push(raw);
}

// Compute statistics per age
const stats = [];
for (const [age, rawPreds] of Object.entries(byAge)) {
  const n = rawPreds.length;
  const mean = rawPreds.reduce((a, b) => a + b, 0) / n;
  const stdDev = Math.sqrt(rawPreds.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const min = Math.min(...rawPreds);
  const max = Math.max(...rawPreds);
  const range = max - min;
  const cv = (stdDev / mean) * 100; // Coefficient of variation (%)

  stats.push({
    age: parseInt(age),
    n,
    mean,
    stdDev,
    min,
    max,
    range,
    cv
  });
}

// Sort by age
stats.sort((a, b) => a.age - b.age);

// Group into age ranges
const ageGroups = {
  'Children (0-12)': stats.filter(s => s.age <= 12),
  'Teens (13-19)': stats.filter(s => s.age >= 13 && s.age <= 19),
  'Young Adults (20-35)': stats.filter(s => s.age >= 20 && s.age <= 35),
  'Middle Age (36-59)': stats.filter(s => s.age >= 36 && s.age <= 59),
  'Seniors (60+)': stats.filter(s => s.age >= 60)
};

console.log('RAW PREDICTION VARIANCE ANALYSIS');
console.log('='.repeat(80));
console.log('');
console.log('Key question: Are poor child predictions due to model limitations or fixable?');
console.log('');
console.log('If the model produces consistent raw predictions for children, it\'s a');
console.log('calibration issue (fixable). If raw predictions vary wildly for the same age,');
console.log('it\'s a model limitation (not fixable with calibration).');
console.log('');
console.log('='.repeat(80));
console.log('');

for (const [groupName, groupStats] of Object.entries(ageGroups)) {
  if (groupStats.length === 0) continue;

  console.log(`\n${groupName}`);
  console.log('-'.repeat(40));

  // Compute group-level statistics
  const avgCV = groupStats.reduce((sum, s) => sum + s.cv, 0) / groupStats.length;
  const avgRange = groupStats.reduce((sum, s) => sum + s.range, 0) / groupStats.length;
  const totalSamples = groupStats.reduce((sum, s) => sum + s.n, 0);

  console.log(`Samples: ${totalSamples}`);
  console.log(`Average CV (coefficient of variation): ${avgCV.toFixed(1)}%`);
  console.log(`Average range: ${avgRange.toFixed(1)} years`);
  console.log('');

  // Show ages with multiple samples
  const multiSample = groupStats.filter(s => s.n > 1);
  if (multiSample.length > 0) {
    console.log('Raw prediction variance for ages with multiple samples:');
    for (const s of multiSample.slice(0, 8)) {
      console.log(`  Age ${s.age} (n=${s.n}): range ${s.min.toFixed(1)}-${s.max.toFixed(1)} (spread ${s.range.toFixed(1)}, CV ${s.cv.toFixed(1)}%)`);
    }
  }
}

console.log('\n' + '='.repeat(80));
console.log('INTERPRETATION GUIDE');
console.log('='.repeat(80));
console.log('');
console.log('Coefficient of Variation (CV):');
console.log('  <10%  = Very consistent (model working well)');
console.log('  10-20% = Moderate variance (calibration can help)');
console.log('  20-30% = High variance (model struggling)');
console.log('  >30%  = Very high variance (likely model limitation)');
console.log('');
console.log('Range (spread of raw predictions for same age):');
console.log('  <10 years = Good consistency');
console.log('  10-20 years = Moderate inconsistency');
console.log('  >20 years = Poor model performance for that age');
