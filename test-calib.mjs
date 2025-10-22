const AGE_CALIBRATION = {
  threshold: 27.8,
  lowSlope: 9.0829,
  lowIntercept: -186.41,
  highSlope: 1.5323,
  highIntercept: -36.26,
};

function calibrateAge(rawAge) {
  const { threshold, lowSlope, lowIntercept, highSlope, highIntercept } = AGE_CALIBRATION;
  return rawAge <= threshold
    ? lowSlope * rawAge + lowIntercept
    : highSlope * rawAge + highIntercept;
}

// Test with actual calibration data points (from browser pipeline)
const tests = [
  { actual: 10, raw: 35.7 },
  { actual: 26, raw: 33.1 },
  { actual: 29, raw: 38.2 },
  { actual: 35, raw: 53.2 },
  { actual: 39, raw: 38.1 },
  { actual: 46, raw: 25.2 },
  { actual: 59, raw: 27.8 },
  { actual: 66, raw: 58.7 },
];

console.log('Actual | Raw  | Calibrated | Error');
console.log('-------|------|------------|------');
for (const t of tests) {
  const cal = calibrateAge(t.raw);
  const err = cal - t.actual;
  const actualStr = t.actual.toString().padStart(6);
  const rawStr = t.raw.toString().padStart(5);
  const calStr = cal.toFixed(1).padStart(10);
  const errStr = err.toFixed(1).padStart(6);
  console.log(`${actualStr} | ${rawStr} | ${calStr} | ${errStr}`);
}
