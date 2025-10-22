import fs from 'fs/promises';

const AGE_CALIBRATION = {
  threshold: 27.8,
  lowSlope: 9.0829,
  lowIntercept: -186.41,
  highSlope: 1.5323,
  highIntercept: -36.26,
};

function calibrateAge(rawAge) {
  const { threshold, lowSlope, lowIntercept, highSlope, highIntercept } = AGE_CALIBRATION;
  const calibrated = rawAge <= threshold
    ? lowSlope * rawAge + lowIntercept
    : highSlope * rawAge + highIntercept;
  return Math.max(0, Math.min(120, calibrated));
}

// Load calibration data
const csv = await fs.readFile('calibration-data.csv', 'utf-8');
const lines = csv.trim().split('\n').slice(1); // Skip header

const results = [];
for (const line of lines) {
  if (!line.trim()) continue;
  const [filename, actualAge, rawPrediction] = line.split(',');
  const actual = parseFloat(actualAge);
  const raw = parseFloat(rawPrediction);
  const calibrated = calibrateAge(raw);
  const error = calibrated - actual;
  results.push({ actual, raw, calibrated, error });
}

// Sort by actual age for readability
results.sort((a, b) => a.actual - b.actual);

console.log('Actual | Raw  | Calibrated | Error | AbsErr');
console.log('-------|------|------------|-------|-------');
let sumAbsErr = 0;
for (const r of results) {
  const absErr = Math.abs(r.error);
  sumAbsErr += absErr;
  console.log(
    `${r.actual.toString().padStart(6)} | ` +
    `${r.raw.toFixed(1).padStart(5)} | ` +
    `${r.calibrated.toFixed(1).padStart(10)} | ` +
    `${r.error.toFixed(1).padStart(6)} | ` +
    `${absErr.toFixed(1).padStart(6)}`
  );
}

const mae = sumAbsErr / results.length;
console.log('\n' + '='.repeat(50));
console.log(`MAE: ${mae.toFixed(2)} years (expected 11.73 from fit-calibration.mjs)`);
