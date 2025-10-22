#!/usr/bin/env node

/**
 * Evaluate the age estimation pipeline against annotated fixtures.
 *
 * Usage:
 *   node scripts/evaluate-age-estimator.mjs
 *
 * Optional flags:
 *   --metadata <path>   Path to metadata.json (default: src/__tests__/fixtures/age-calibration/metadata.json)
 *   --images <dir>      Directory containing images (default: same directory as metadata)
 *   --model <path>      Path to genderage.onnx (default: public/models/age-gender/genderage.onnx)
 *   --output <path>     Path to write detailed JSON report (default: fixtures/age-calibration/results.json)
 */

import fs from "fs/promises";
import path from "path";
import * as ort from "onnxruntime-node";
import { env, RawImage } from "@xenova/transformers";
import { computeAgeStats, decadeStats } from "./age-metrics.mjs";

const args = process.argv.slice(2);

function parseArgs() {
  const defaults = {
    metadata: path.resolve("src/__tests__/fixtures/age-calibration/metadata.json"),
    images: null,
    model: path.resolve("public/models/age-gender/genderage.onnx"),
    output: path.resolve("src/__tests__/fixtures/age-calibration/results.json"),
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--metadata") {
      defaults.metadata = path.resolve(args[++i]);
    } else if (arg === "--images") {
      defaults.images = path.resolve(args[++i]);
    } else if (arg === "--model") {
      defaults.model = path.resolve(args[++i]);
    } else if (arg === "--output") {
      defaults.output = path.resolve(args[++i]);
    }
  }

  if (!defaults.images) {
    defaults.images = path.dirname(defaults.metadata);
  }

  return defaults;
}

async function ensureExists(filePath, kind) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`Cannot access ${kind} at ${filePath}`);
  }
}

function formatDecade(decade) {
  return decade >= 110 ? "110+" : `${decade}s`;
}

async function main() {
  const { metadata, images, model, output } = parseArgs();

  await Promise.all([ensureExists(metadata, "metadata"), ensureExists(model, "ONNX model")]);

  env.allowLocalModels = true;
  env.useFS = true;

  const session = await ort.InferenceSession.create(model);
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];

  const rawMetadata = await fs.readFile(metadata, "utf8");
  /** @type {Array<{file:string; age:number; gender:string; race?:string}>} */
  const entries = JSON.parse(rawMetadata);

  const predictions = [];

  for (const entry of entries) {
    const imagePath = path.join(images, entry.file);
    await ensureExists(imagePath, "image");

    const rawImage = await RawImage.read(imagePath);
    const resized = await rawImage.resize(96, 96);
    resized.convert(3);

    const pixels = resized.data;
    const planeSize = 96 * 96;
    const tensorData = new Float32Array(3 * planeSize);

    for (let idx = 0; idx < planeSize; idx += 1) {
      const base = idx * 3;
      const r = pixels[base];
      const g = pixels[base + 1];
      const b = pixels[base + 2];

      tensorData[idx] = b;
      tensorData[planeSize + idx] = g;
      tensorData[planeSize * 2 + idx] = r;
    }

    const feeds = {
      [inputName]: new ort.Tensor("float32", tensorData, [1, 3, 96, 96]),
    };
    const outputs = await session.run(feeds);
    const outputTensor = outputs[outputName];
    const data = outputTensor.data;

    const femaleScore = data[0];
    const maleScore = data[1];
    const predictedAge = data[2] * 100;

    const predictedGender = maleScore > femaleScore ? "male" : "female";
    const genderDelta = Math.abs(maleScore - femaleScore);
    const confidence = Math.min(1, Math.max(0, genderDelta / 3));

    predictions.push({
      file: entry.file,
      trueAge: entry.age,
      predictedAge,
      error: predictedAge - entry.age,
      absError: Math.abs(predictedAge - entry.age),
      predictedGender,
      trueGender: entry.gender,
      genderCorrect: predictedGender === entry.gender,
      confidence,
      genderConfidence: genderDelta,
      race: entry.race ?? "unknown",
    });
  }

  const overall = computeAgeStats(predictions);
  const perDecade = decadeStats(predictions);

  function computeLinearCalibration(data) {
    const n = data.length;
    const meanPred = data.reduce((sum, item) => sum + item.predictedAge, 0) / n;
    const meanTrue = data.reduce((sum, item) => sum + item.trueAge, 0) / n;
    let cov = 0;
    let varPred = 0;
    for (const item of data) {
      const dx = item.predictedAge - meanPred;
      cov += dx * (item.trueAge - meanTrue);
      varPred += dx * dx;
    }
    const slope = varPred === 0 ? 1 : cov / varPred;
    const intercept = meanTrue - slope * meanPred;
    return { slope, intercept };
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  const calibration = computeLinearCalibration(predictions);
  const applyCalibration = (age) => clamp(calibration.slope * age + calibration.intercept, 0, 120);
  const calibratedPredictions = predictions.map((item) => {
    const calibratedAge = applyCalibration(item.predictedAge);
    const calibratedError = calibratedAge - item.trueAge;
    return {
      ...item,
      calibratedAge,
      calibratedError,
      calibratedAbsError: Math.abs(calibratedError),
    };
  });

  const calibratedStats = computeAgeStats(
    calibratedPredictions.map((item) => ({
      trueAge: item.trueAge,
      predictedAge: item.calibratedAge,
      confidence: item.confidence,
      genderCorrect: item.genderCorrect,
    })),
  );
  const calibratedPerDecade = decadeStats(
    calibratedPredictions.map((item) => ({
      trueAge: item.trueAge,
      predictedAge: item.calibratedAge,
      confidence: item.confidence,
      genderCorrect: item.genderCorrect,
    })),
  );

  function computeQuadraticCalibration(data) {
    const n = data.length;
    let sumX = 0;
    let sumX2 = 0;
    let sumX3 = 0;
    let sumX4 = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2Y = 0;
    for (const item of data) {
      const x = item.predictedAge;
      const y = item.trueAge;
      const x2 = x * x;
      const x3 = x2 * x;
      const x4 = x2 * x2;
      sumX += x;
      sumX2 += x2;
      sumX3 += x3;
      sumX4 += x4;
      sumY += y;
      sumXY += x * y;
      sumX2Y += x2 * y;
    }

    // Solve linear system for coefficients of y = ax^2 + bx + c
    const m00 = n;
    const m01 = sumX;
    const m02 = sumX2;
    const m10 = sumX;
    const m11 = sumX2;
    const m12 = sumX3;
    const m20 = sumX2;
    const m21 = sumX3;
    const m22 = sumX4;
    const v0 = sumY;
    const v1 = sumXY;
    const v2 = sumX2Y;

    // Gaussian elimination for 3x3
    const det =
      m00 * (m11 * m22 - m12 * m21) - m01 * (m10 * m22 - m12 * m20) + m02 * (m10 * m21 - m11 * m20);

    if (Math.abs(det) < 1e-9) {
      return { a: 0, b: calibration.slope, c: calibration.intercept };
    }

    const inv = [
      [(m11 * m22 - m12 * m21) / det, (m02 * m21 - m01 * m22) / det, (m01 * m12 - m02 * m11) / det],
      [(m12 * m20 - m10 * m22) / det, (m00 * m22 - m02 * m20) / det, (m02 * m10 - m00 * m12) / det],
      [(m10 * m21 - m11 * m20) / det, (m01 * m20 - m00 * m21) / det, (m00 * m11 - m01 * m10) / det],
    ];

    const c = inv[0][0] * v0 + inv[0][1] * v1 + inv[0][2] * v2;
    const b = inv[1][0] * v0 + inv[1][1] * v1 + inv[1][2] * v2;
    const a = inv[2][0] * v0 + inv[2][1] * v1 + inv[2][2] * v2;

    return { a, b, c };
  }

  const quadCalibration = computeQuadraticCalibration(predictions);
  const applyQuadratic = (age) =>
    clamp(quadCalibration.a * age * age + quadCalibration.b * age + quadCalibration.c, 0, 120);

  const quadraticPredictions = predictions.map((item) => {
    const calibratedAge = applyQuadratic(item.predictedAge);
    const calibratedError = calibratedAge - item.trueAge;
    return {
      ...item,
      calibratedAge,
      calibratedError,
      calibratedAbsError: Math.abs(calibratedError),
    };
  });

  const quadraticStats = computeAgeStats(
    quadraticPredictions.map((item) => ({
      trueAge: item.trueAge,
      predictedAge: item.calibratedAge,
      confidence: item.confidence,
      genderCorrect: item.genderCorrect,
    })),
  );
  const quadraticPerDecade = decadeStats(
    quadraticPredictions.map((item) => ({
      trueAge: item.trueAge,
      predictedAge: item.calibratedAge,
      confidence: item.confidence,
      genderCorrect: item.genderCorrect,
    })),
  );

  function segmentedLinearCalibration(data, minThreshold = 30, maxThreshold = 70, step = 2) {
    let best = {
      threshold: 45,
      low: { slope: 1, intercept: 0 },
      high: { slope: 1, intercept: 0 },
      stats: null,
    };

    function regress(subset) {
      if (subset.length === 0) {
        return { slope: 0, intercept: 0 };
      }
      const meanPred = subset.reduce((sum, item) => sum + item.predictedAge, 0) / subset.length;
      const meanTrue = subset.reduce((sum, item) => sum + item.trueAge, 0) / subset.length;
      let cov = 0;
      let varPred = 0;
      for (const item of subset) {
        const dx = item.predictedAge - meanPred;
        cov += dx * (item.trueAge - meanTrue);
        varPred += dx * dx;
      }
      const slope = varPred === 0 ? 0 : cov / varPred;
      const intercept = meanTrue - slope * meanPred;
      return { slope, intercept };
    }

    for (let threshold = minThreshold; threshold <= maxThreshold; threshold += step) {
      const low = data.filter((item) => item.predictedAge <= threshold);
      const high = data.filter((item) => item.predictedAge > threshold);
      if (low.length < 4 || high.length < 4) continue;
      const lowParams = regress(low);
      const highParams = regress(high);
      const apply = (age) =>
        age <= threshold
          ? clamp(lowParams.slope * age + lowParams.intercept, 0, 120)
          : clamp(highParams.slope * age + highParams.intercept, 0, 120);
      const calibrated = data.map((item) => ({
        ...item,
        calibratedAge: apply(item.predictedAge),
      }));
      const stats = computeAgeStats(
        calibrated.map((item) => ({
          trueAge: item.trueAge,
          predictedAge: item.calibratedAge,
          confidence: item.confidence,
          genderCorrect: item.genderCorrect,
        })),
      );
      if (!best.stats || stats.mae < best.stats.mae) {
        best = {
          threshold,
          low: lowParams,
          high: highParams,
          stats,
        };
      }
    }
    return best;
  }

  const segmented = segmentedLinearCalibration(predictions, 30, 70, 1);
  const applySegmented = (age) =>
    age <= segmented.threshold
      ? clamp(segmented.low.slope * age + segmented.low.intercept, 0, 120)
      : clamp(segmented.high.slope * age + segmented.high.intercept, 0, 120);
  const segmentedPredictions = predictions.map((item) => {
    const calibratedAge = applySegmented(item.predictedAge);
    const calibratedError = calibratedAge - item.trueAge;
    return {
      ...item,
      calibratedAge,
      calibratedError,
      calibratedAbsError: Math.abs(calibratedError),
    };
  });
  const segmentedStats = computeAgeStats(
    segmentedPredictions.map((item) => ({
      trueAge: item.trueAge,
      predictedAge: item.calibratedAge,
      confidence: item.confidence,
      genderCorrect: item.genderCorrect,
    })),
  );
  const segmentedPerDecade = decadeStats(
    segmentedPredictions.map((item) => ({
      trueAge: item.trueAge,
      predictedAge: item.calibratedAge,
      confidence: item.confidence,
      genderCorrect: item.genderCorrect,
    })),
  );

  function buildAnchors(data, bucketCount = 10) {
    const sorted = [...data].sort((a, b) => a.predictedAge - b.predictedAge);
    const buckets = [];
    const size = Math.ceil(sorted.length / bucketCount);
    for (let i = 0; i < sorted.length; i += size) {
      const chunk = sorted.slice(i, i + size);
      if (chunk.length === 0) continue;
      const avgPred = chunk.reduce((sum, item) => sum + item.predictedAge, 0) / chunk.length;
      const avgTrue = chunk.reduce((sum, item) => sum + item.trueAge, 0) / chunk.length;
      buckets.push({ predicted: avgPred, actual: avgTrue });
    }
    // Ensure first and last anchors cover bounds
    if (buckets.length > 0) {
      const first = buckets[0];
      const last = buckets[buckets.length - 1];
      if (first.predicted > 0) {
        buckets.unshift({ predicted: 0, actual: first.actual });
      }
      if (last.predicted < 120) {
        buckets.push({ predicted: 120, actual: last.actual });
      }
    }
    return buckets;
  }

  function applyAnchors(age, anchors) {
    if (anchors.length === 0) return age;
    if (age <= anchors[0].predicted) return anchors[0].actual;
    if (age >= anchors[anchors.length - 1].predicted) return anchors[anchors.length - 1].actual;
    for (let i = 0; i < anchors.length - 1; i++) {
      const left = anchors[i];
      const right = anchors[i + 1];
      if (age >= left.predicted && age <= right.predicted) {
        const t = (age - left.predicted) / (right.predicted - left.predicted || 1);
        const interpolated = left.actual + t * (right.actual - left.actual);
        return interpolated;
      }
    }
    return anchors[anchors.length - 1].actual;
  }

  function monotonizeAnchors(anchors) {
    if (anchors.length === 0) return anchors;
    const blocks = anchors.map((anchor, index) => ({
      start: index,
      end: index,
      sum: anchor.actual,
      count: 1,
      predictedStart: anchor.predicted,
      predictedEnd: anchor.predicted,
    }));

    for (let i = 0; i < blocks.length; i++) {
      let j = i;
      while (j > 0) {
        const curr = blocks[j];
        const prev = blocks[j - 1];
        const currAvg = curr.sum / curr.count;
        const prevAvg = prev.sum / prev.count;
        if (prevAvg <= currAvg) break;
        // Merge prev and curr
        const merged = {
          start: prev.start,
          end: curr.end,
          sum: prev.sum + curr.sum,
          count: prev.count + curr.count,
          predictedStart: prev.predictedStart,
          predictedEnd: curr.predictedEnd,
        };
        blocks.splice(j - 1, 2, merged);
        j -= 1;
        i = Math.max(i - 1, j);
      }
    }

    const adjusted = anchors.map((anchor) => ({ ...anchor }));
    for (const block of blocks) {
      const avg = block.sum / block.count;
      for (let idx = block.start; idx <= block.end; idx++) {
        adjusted[idx].actual = avg;
      }
    }
    return adjusted;
  }

  const anchors = monotonizeAnchors(buildAnchors(predictions, 12));
  const anchorCalibratedPredictions = predictions.map((item) => {
    const calibratedAge = clamp(applyAnchors(item.predictedAge, anchors), 0, 120);
    const calibratedError = calibratedAge - item.trueAge;
    return {
      ...item,
      calibratedAge,
      calibratedError,
      calibratedAbsError: Math.abs(calibratedError),
    };
  });

  const anchorStats = computeAgeStats(
    anchorCalibratedPredictions.map((item) => ({
      trueAge: item.trueAge,
      predictedAge: item.calibratedAge,
      confidence: item.confidence,
      genderCorrect: item.genderCorrect,
    })),
  );
  const anchorPerDecade = decadeStats(
    anchorCalibratedPredictions.map((item) => ({
      trueAge: item.trueAge,
      predictedAge: item.calibratedAge,
      confidence: item.confidence,
      genderCorrect: item.genderCorrect,
    })),
  );

  console.log("\nAge Estimation Evaluation");
  console.log("Samples:", overall.count);
  console.log(`MAE: ${overall.mae.toFixed(2)} years`);
  console.log(`RMSE: ${overall.rmse.toFixed(2)} years`);
  console.log(`Bias: ${overall.bias.toFixed(2)} years`);
  console.log(`Median abs error: ${overall.medianAbsError.toFixed(2)} years`);
  console.log(`Gender accuracy: ${(overall.genderAccuracy * 100).toFixed(1)}%`);
  console.log(`Mean confidence: ${overall.meanConfidence.toFixed(2)}`);

  console.log("\nPer-decade breakdown:");
  for (const bucket of perDecade) {
    const stats = bucket.stats;
    console.log(
      `${formatDecade(bucket.decade)} -> n=${
        stats.count
      } | MAE=${stats.mae.toFixed(2)} | Bias=${stats.bias.toFixed(2)} | GenderAcc=${(stats.genderAccuracy * 100).toFixed(1)}%`,
    );
  }

  console.log("\nLinear calibration (true ≈ slope * predicted + intercept)");
  console.log(
    ` slope=${calibration.slope.toFixed(4)}, intercept=${calibration.intercept.toFixed(2)}`,
  );
  console.log(
    `Calibrated MAE: ${calibratedStats.mae.toFixed(2)} | RMSE: ${calibratedStats.rmse.toFixed(2)} | Bias: ${calibratedStats.bias.toFixed(2)}`,
  );
  console.log(
    `Calibrated gender accuracy (unchanged): ${(calibratedStats.genderAccuracy * 100).toFixed(1)}%`,
  );
  console.log("\nPer-decade after calibration:");
  for (const bucket of calibratedPerDecade) {
    const stats = bucket.stats;
    console.log(
      `${formatDecade(bucket.decade)} -> n=${
        stats.count
      } | MAE=${stats.mae.toFixed(2)} | Bias=${stats.bias.toFixed(2)}`,
    );
  }

  console.log("\nQuadratic calibration (true ≈ ax^2 + bx + c)");
  console.log(
    ` a=${quadCalibration.a.toFixed(6)}, b=${quadCalibration.b.toFixed(4)}, c=${quadCalibration.c.toFixed(2)}`,
  );
  console.log(
    `Quadratic MAE: ${quadraticStats.mae.toFixed(2)} | RMSE: ${quadraticStats.rmse.toFixed(2)} | Bias: ${quadraticStats.bias.toFixed(2)}`,
  );
  console.log("\nPer-decade after quadratic calibration:");
  for (const bucket of quadraticPerDecade) {
    const stats = bucket.stats;
    console.log(
      `${formatDecade(bucket.decade)} -> n=${
        stats.count
      } | MAE=${stats.mae.toFixed(2)} | Bias=${stats.bias.toFixed(2)}`,
    );
  }

  console.log("\nAnchored calibration (piecewise linear)");
  console.log(
    ` MAE: ${anchorStats.mae.toFixed(2)} | RMSE: ${anchorStats.rmse.toFixed(2)} | Bias: ${anchorStats.bias.toFixed(2)}`,
  );
  console.log(
    " Anchors:",
    anchors.map((a) => `[${a.predicted.toFixed(1)}→${a.actual.toFixed(1)}]`).join(" "),
  );
  console.log("\nPer-decade after anchored calibration:");
  for (const bucket of anchorPerDecade) {
    const stats = bucket.stats;
    console.log(
      `${formatDecade(bucket.decade)} -> n=${
        stats.count
      } | MAE=${stats.mae.toFixed(2)} | Bias=${stats.bias.toFixed(2)}`,
    );
  }

  console.log("\nSegmented calibration (two linear pieces)");
  console.log(
    ` threshold=${segmented.threshold.toFixed(1)}, ` +
      `low: slope=${segmented.low.slope.toFixed(4)}, intercept=${segmented.low.intercept.toFixed(2)}, ` +
      `high: slope=${segmented.high.slope.toFixed(4)}, intercept=${segmented.high.intercept.toFixed(2)}`,
  );
  console.log(
    ` MAE: ${segmentedStats.mae.toFixed(2)} | RMSE: ${segmentedStats.rmse.toFixed(2)} | Bias: ${segmentedStats.bias.toFixed(2)}`,
  );
  console.log("\nPer-decade after segmented calibration:");
  for (const bucket of segmentedPerDecade) {
    const stats = bucket.stats;
    console.log(
      `${formatDecade(bucket.decade)} -> n=${
        stats.count
      } | MAE=${stats.mae.toFixed(2)} | Bias=${stats.bias.toFixed(2)}`,
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    model: path.relative(process.cwd(), model),
    fixtures: {
      metadata: path.relative(process.cwd(), metadata),
      images: path.relative(process.cwd(), images),
    },
    overall,
    perDecade,
    calibration: {
      slope: calibration.slope,
      intercept: calibration.intercept,
      overall: calibratedStats,
      perDecade: calibratedPerDecade,
    },
    quadraticCalibration: {
      a: quadCalibration.a,
      b: quadCalibration.b,
      c: quadCalibration.c,
      overall: quadraticStats,
      perDecade: quadraticPerDecade,
    },
    anchorCalibration: {
      anchors,
      overall: anchorStats,
      perDecade: anchorPerDecade,
    },
    segmentedCalibration: {
      threshold: segmented.threshold,
      low: segmented.low,
      high: segmented.high,
      overall: segmentedStats,
      perDecade: segmentedPerDecade,
    },
    predictions,
  };

  await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nDetailed results written to ${path.relative(process.cwd(), output)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
