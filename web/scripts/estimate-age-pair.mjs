#!/usr/bin/env node

/**
 * Quick age estimation utility for two images.
 *
 * Usage:
 *   node scripts/estimate-age-pair.mjs --imageA <path/to/imgA> --imageB <path/to/imgB>
 * Optional:
 *   --ageA <years>  Expected age for image A (for error report)
 *   --ageB <years>  Expected age for image B
 *   --model <path/to/genderage.onnx>  (defaults to public/models/age-gender/genderage.onnx)
 *
 * Output includes raw model age, calibrated age (matching runtime pipeline),
 * predicted gender, and confidence for each image along with the calibrated gap.
 */

import fs from "fs/promises";
import path from "path";
import * as ort from "onnxruntime-node";
import { env, RawImage } from "@xenova/transformers";

const args = process.argv.slice(2);

function parseArgs() {
  const params = {
    imageA: null,
    imageB: null,
    ageA: null,
    ageB: null,
    model: path.resolve("public/models/age-gender/genderage.onnx"),
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--imageA") {
      params.imageA = path.resolve(args[++i] ?? "");
    } else if (arg === "--imageB") {
      params.imageB = path.resolve(args[++i] ?? "");
    } else if (arg === "--ageA") {
      params.ageA = Number(args[++i]);
    } else if (arg === "--ageB") {
      params.ageB = Number(args[++i]);
    } else if (arg === "--model") {
      params.model = path.resolve(args[++i] ?? "");
    }
  }

  if (!params.imageA || !params.imageB) {
    throw new Error("Please provide --imageA and --imageB");
  }

  return params;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Calibration fitted from browser-pipeline data (face detection + IPD crop)
// Based on 97 UTKFace uncropped images processed through actual runtime pipeline
// Piecewise linear regression: MAE 13.69 years overall
// Per-age-group MAE: Children 24.2y, Teens 13.1y, Young Adults 3.8y, Middle Age 15.3y, Seniors 25.4y
const AGE_CALIBRATION = {
  threshold: 68.0,
  lowSlope: 0.3139,
  lowIntercept: 16.54,
  highSlope: 2.2571,
  highIntercept: -87.92,
  minAge: 0,
  maxAge: 120,
};

function calibrateAge(rawAge) {
  const { threshold, lowSlope, lowIntercept, highSlope, highIntercept, minAge, maxAge } =
    AGE_CALIBRATION;
  const calibrated =
    rawAge <= threshold ? lowSlope * rawAge + lowIntercept : highSlope * rawAge + highIntercept;
  return clamp(calibrated, minAge, maxAge);
}

async function ensureFile(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`Cannot read image at ${filePath}`);
  }
}

async function loadImageData(imagePath) {
  const rawImage = await RawImage.read(imagePath);
  const resized = await rawImage.resize(96, 96);
  resized.convert(3);

  const pixels = resized.data;
  const planeSize = 96 * 96;
  const data = new Float32Array(3 * planeSize);

  for (let idx = 0; idx < planeSize; idx++) {
    const base = idx * 3;
    const r = pixels[base];
    const g = pixels[base + 1];
    const b = pixels[base + 2];

    data[idx] = b;
    data[planeSize + idx] = g;
    data[planeSize * 2 + idx] = r;
  }

  return data;
}

async function runInference(session, imagePath, inputName, outputName) {
  const tensorData = await loadImageData(imagePath);
  const feeds = {
    [inputName]: new ort.Tensor("float32", tensorData, [1, 3, 96, 96]),
  };
  const outputs = await session.run(feeds);
  const outputTensor = outputs[outputName];
  const data = outputTensor.data;

  const femaleScore = data[0];
  const maleScore = data[1];
  const rawAge = data[2] * 100;
  const gender = maleScore > femaleScore ? "male" : "female";
  const genderDelta = Math.abs(maleScore - femaleScore);
  const confidence = Math.min(1, Math.max(0, genderDelta / 3));

  return {
    rawAge,
    age: calibrateAge(rawAge),
    gender,
    genderConfidence: genderDelta,
    confidence,
  };
}

function printResult(label, result, expectedAge) {
  console.log(`\n${label}`);
  console.log(`  Calibrated age : ${result.age.toFixed(2)} years`);
  console.log(`  Raw age (model): ${result.rawAge.toFixed(2)} years`);
  console.log(
    `  Gender         : ${result.gender} (confidence ${result.genderConfidence.toFixed(3)}, normalized ${result.confidence.toFixed(2)})`,
  );
  if (typeof expectedAge === "number" && !Number.isNaN(expectedAge)) {
    const err = result.age - expectedAge;
    console.log(`  Expected age   : ${expectedAge.toFixed(2)} (error ${err.toFixed(2)} years)`);
  }
}

async function main() {
  const params = parseArgs();
  await ensureFile(params.imageA);
  await ensureFile(params.imageB);
  await ensureFile(params.model);

  env.allowLocalModels = true;
  env.useFS = true;

  const session = await ort.InferenceSession.create(params.model);
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];

  const [resultA, resultB] = await Promise.all([
    runInference(session, params.imageA, inputName, outputName),
    runInference(session, params.imageB, inputName, outputName),
  ]);

  printResult("Image A", resultA, params.ageA);
  printResult("Image B", resultB, params.ageB);

  const gap = Math.abs(resultA.age - resultB.age);
  console.log(`\nCalibrated age gap: ${gap.toFixed(2)} years`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
