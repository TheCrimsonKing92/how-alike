/**
 * Age Estimation using ONNX Runtime
 *
 * Uses InsightFace genderage.onnx model to predict age from face images.
 * This replaces the unreliable landmark-based maturity heuristics.
 *
 * Model: InsightFace Antelopev2 Gender-Age Classifier
 * - Source: https://huggingface.co/fofr/comfyui/blob/main/insightface/models/antelopev2/genderage.onnx
 * - Input: 1 × 3 × 96 × 96 (NCHW, RGB, [0, 255] range - NO normalization)
 * - Output: 1 × 3 [female_score, male_score, age/100]
 * - Model specs: input_mean=0.0, input_std=1.0 (per InsightFace Attribute class)
 *
 * ⚠️ PREPROCESSING NOTE: This model requires RGB in [0, 255] range (no normalization).
 * Age output must be multiplied by 100 to get years.
 * See inline comments in estimateAge() for details.
 */

import type * as ORT from 'onnxruntime-web';
import { clamp, computeLandmarkCenter, distance } from '@/lib/utils';

export interface AgeEstimate {
  age: number;         // Calibrated age (continuous value)
  confidence: number;  // Confidence in prediction (0-1) - derived from gender certainty
  gender: 'male' | 'female';  // Predicted gender
  genderConfidence: number;   // Gender prediction confidence
  rawAge?: number;     // Uncalibrated model output (age/100 * 100)
}

type MinimalOrtSession = {
  inputNames: string[];
  outputNames: string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, unknown>>;
};

type OrtLike = {
  InferenceSession: { create: (url: string | ArrayBuffer, opts?: Record<string, unknown>) => Promise<MinimalOrtSession> };
  Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
  env: {
    wasm: { wasmPaths?: string | Record<string, string>; [k: string]: unknown };
    webgl?: any;
  };
};

let ageSession: MinimalOrtSession | null = null;
let ort: OrtLike | null = null;
let inferenceQueue: Promise<any> = Promise.resolve();

/**
 * Initialize the age classifier model
 * Call this once during worker initialization
 */
export async function initAgeClassifier(): Promise<void> {
  if (ageSession) return;

  console.info('[age-estimation] Loading InsightFace genderage.onnx...');
  const start = performance.now();

  try {
    // Import ONNX Runtime
    const ortMod = (await import('onnxruntime-web').catch(() => null)) as unknown;
    if (!ortMod) {
      throw new Error('ONNX Runtime not available');
    }
    ort = ortMod as OrtLike;

    // Configure ONNX Runtime (same as parsing model)
    if (typeof ort.env.webgl !== 'undefined') {
      const webgl = ort.env.webgl as any;
      webgl.contextAttributes = { alpha: true, depth: false, stencil: false };
      webgl.pack = true;
    }

    if (!ort.env.wasm.wasmPaths) {
      ort.env.wasm.wasmPaths = {
        'ort-wasm-simd-threaded.jsep.mjs': '/ort/ort.wasm.min.mjs',
        'ort-wasm-simd-threaded.wasm': '/ort/ort-wasm-simd-threaded.wasm',
        'ort-wasm-simd-threaded.jsep.wasm': '/ort/ort-wasm-simd-threaded.wasm',
        'ort-wasm.wasm': '/ort/ort-wasm.wasm',
        'ort-wasm-threaded.wasm': '/ort/ort-wasm-threaded.wasm',
        'ort-wasm-simd.wasm': '/ort/ort-wasm-simd.wasm',
      } as Record<string, string>;
    }

    // Load model
    const modelUrl = '/models/age-gender/genderage.onnx';
    const response = await fetch(modelUrl);
    if (!response.ok) throw new Error(`Failed to fetch model: ${response.status}`);
    const modelBuffer = await response.arrayBuffer();

    if (process.env.NODE_ENV !== 'production') {
      console.info('[age-estimation] loaded model buffer:', (modelBuffer.byteLength / (1024 * 1024)).toFixed(2), 'MB');
    }

    // Create session with WebGL/WASM
    ageSession = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: ['webgl', 'wasm'],
      graphOptimizationLevel: 'disabled',
      enableCpuMemArena: false,
    });

    const elapsed = performance.now() - start;
    console.info(`[age-estimation] Model loaded successfully in ${elapsed.toFixed(0)}ms`);

    if (process.env.NODE_ENV !== 'production') {
      console.info('[age-estimation] Input names:', ageSession.inputNames);
      console.info('[age-estimation] Output names:', ageSession.outputNames);
    }
  } catch (error) {
    console.error('[age-estimation] Failed to load age classifier:', error);
    ageSession = null;
    ort = null;
    // Don't throw - allow app to continue without age estimation
  }
}

/**
 * Estimate age from a face image
 *
 * @param image - ImageBitmap, Canvas, or OffscreenCanvas of the face crop
 * @returns Age estimate with continuous age value
 */
let inferenceCounter = 0;

export async function estimateAge(
  image: ImageBitmap | HTMLCanvasElement | OffscreenCanvas
): Promise<AgeEstimate> {
  if (!ageSession || !ort) {
    throw new Error('Age classifier not initialized. Call initAgeClassifier() first.');
  }

  // Queue inference to avoid "Session already started" error with concurrent calls
  const inferenceId = ++inferenceCounter;
  const result = await (inferenceQueue = inferenceQueue.then(async () => {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[age-estimation #${inferenceId}] starting inference`);
    }
    // Resize to 96x96
    const SIZE = 96;
    const canvas = new OffscreenCanvas(SIZE, SIZE);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Cannot get 2d context');

    ctx.drawImage(image as any, 0, 0, SIZE, SIZE);
    const imageData = ctx.getImageData(0, 0, SIZE, SIZE);
    const rgba = imageData.data;

    if (process.env.NODE_ENV !== 'production') {
      // Sample center pixel values for debugging
      const centerIdx = (SIZE / 2 * SIZE + SIZE / 2) * 4;
      console.info(`[age-estimation #${inferenceId}] center pixel (RGBA):`, [
        rgba[centerIdx],
        rgba[centerIdx + 1],
        rgba[centerIdx + 2],
        rgba[centerIdx + 3]
      ]);
    }

    // Convert to NCHW format: [1, 3, 96, 96]
    //
    // Empirical testing results (with IPD-based crop, no alignment):
    // - RGB [0, 1]: Both → 0.4 years (broken)
    // - RGB [0, 255]: Adult 73.6, Child 52.5 (BEST: shows difference, ~3x overestimate)
    // - RGB [-1, 1]: Both → 35 years (no difference)
    // - BGR [0, 255]: Adult 64, Child 33 (shows difference, ~2-3x overestimate)
    // - BGR [-1, 1]: Both → 35 years (no difference)
    //
    // Using BGR [0, 255] as it shows age differences with reasonable overestimation
    //
    const data = new Float32Array(1 * 3 * SIZE * SIZE);

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const idx = (y * SIZE + x) * 4;
        const baseIdx = y * SIZE + x;

        // BGR channels in [0, 255] range (no normalization)
        data[0 * SIZE * SIZE + baseIdx] = rgba[idx + 2]; // B
        data[1 * SIZE * SIZE + baseIdx] = rgba[idx + 1]; // G
        data[2 * SIZE * SIZE + baseIdx] = rgba[idx];     // R
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      // Sample normalized values
      const sampleIdx = SIZE / 2 * SIZE + SIZE / 2;
      console.info(`[age-estimation #${inferenceId}] normalized center (RGB):`, [
        data[0 * SIZE * SIZE + sampleIdx].toFixed(3),
        data[1 * SIZE * SIZE + sampleIdx].toFixed(3),
        data[2 * SIZE * SIZE + sampleIdx].toFixed(3)
      ]);
    }

    // Create tensor and run inference
    const inputName = ageSession!.inputNames[0];
    const tensor = new ort!.Tensor('float32', data, [1, 3, SIZE, SIZE]);
    const feeds = { [inputName]: tensor };
    const outputs = await ageSession!.run(feeds);

    // Extract output: [female_score, male_score, age]
    const outputName = ageSession!.outputNames[0];
    const outputTensor = outputs[outputName] as any;
    const outputData = outputTensor.data as Float32Array;

    if (process.env.NODE_ENV !== 'production') {
      console.info(`[age-estimation #${inferenceId}] raw output tensor:`, {
        length: outputData.length,
        values: Array.from(outputData.slice(0, 10)),
        shape: outputTensor.dims
      });
    }

    const femaleScore = outputData[0];
    const maleScore = outputData[1];
    // Age output is normalized [0, 1] representing age/100
    // Multiply by 100 to get actual age in years
    const age = outputData[2] * 100;

    // Determine gender from scores
    const gender = maleScore > femaleScore ? 'male' : 'female';
    const genderConfidence = Math.abs(maleScore - femaleScore);

    // Use gender confidence as overall confidence (higher separation = more confident)
    // Normalize to [0, 1] range (sigmoid-like scores typically range from -3 to 3)
    const confidence = Math.min(1, Math.max(0, genderConfidence / 3));

    if (process.env.NODE_ENV !== 'production') {
      console.info(`[age-estimation #${inferenceId}] prediction:`, {
        age: age.toFixed(1),
        gender,
        femaleScore: femaleScore.toFixed(3),
        maleScore: maleScore.toFixed(3),
        confidence: confidence.toFixed(2)
      });
    }

    return {
      age: calibratePredictedAge(age, gender, genderConfidence),
      confidence,
      gender,
      genderConfidence,
      rawAge: age
    };
  }));

  return result;
}

/**
 * Compute age penalty for cross-age comparisons
 *
 * Applies increasing penalty based on age gap:
 * - 0-5 years: no penalty
 * - 5-10 years: 5% penalty
 * - 10-20 years: 10-20% penalty
 * - 20-30 years: 20-30% penalty
 * - 30+ years: 30% penalty (max)
 */
export function computeAgePenalty(ageA: AgeEstimate, ageB: AgeEstimate): {
  penalty: number;
  ageGap: number;
  warning?: string;
} {
  const ageGap = Math.abs(ageA.age - ageB.age);
  const minConfidence = Math.min(ageA.confidence, ageB.confidence);

  // Only apply penalty if we're confident in both predictions
  if (minConfidence < 0.4) {
    return { penalty: 0, ageGap };
  }

  let penalty = 0;
  let warning: string | undefined;

  if (ageGap >= 5) {
    // Scale penalty: 5-10 years = 5%, 10-20 = 10-20%, 20-30 = 20-30%, 30+ = 30%
    if (ageGap < 10) {
      penalty = 0.05;
    } else if (ageGap < 20) {
      penalty = 0.10 + (ageGap - 10) * 0.01; // 10-20%
    } else if (ageGap < 30) {
      penalty = 0.20 + (ageGap - 20) * 0.01; // 20-30%
    } else {
      penalty = 0.30; // Max 30%
    }

    // Generate warning message
    const stageA = getAgeStage(ageA.age);
    const stageB = getAgeStage(ageB.age);
    warning = `Cross-age comparison: ${stageA} (~${Math.round(ageA.age)}) vs ${stageB} (~${Math.round(ageB.age)}). Similarity may be less meaningful.`;
  }

  return { penalty, ageGap, warning };
}

/**
 * Get descriptive age stage
 */
function getAgeStage(age: number): string {
  if (age < 3) return 'Infant';
  if (age < 10) return 'Child';
  if (age < 20) return 'Adolescent';
  if (age < 30) return 'Young Adult';
  if (age < 50) return 'Adult';
  if (age < 70) return 'Middle-Aged Adult';
  return 'Senior';
}

// MediaPipe landmark indices for 5-point face alignment
const LEFT_EYE_INDICES = [33, 133, 160, 159, 158, 157, 173];
const RIGHT_EYE_INDICES = [362, 263, 387, 386, 385, 384, 398];
const NOSE_TIP_INDEX = 1;
const LEFT_MOUTH_INDEX = 61;
const RIGHT_MOUTH_INDEX = 291;

// Standard reference positions for InsightFace models (scaled for 96x96 from 112x112 arcface_dst)
// Original 112x112: [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]]
const REFERENCE_POINTS_96 = [
  [32.8, 44.3],  // left eye
  [63.1, 44.3],  // right eye
  [48.0, 61.5],  // nose
  [35.6, 79.2],  // left mouth
  [60.6, 79.1]   // right mouth
];

/**
 * Compute similarity transform matrix from source points to destination points
 * Returns [a, b, tx, ty] where transform is: x' = a*x - b*y + tx, y' = b*x + a*y + ty
 */
function computeSimilarityTransform(
  src: number[][],
  dst: number[][]
): { a: number; b: number; tx: number; ty: number } {
  // Use least squares to solve for similarity transform
  // Based on Umeyama algorithm for point set alignment
  const n = src.length;

  // Compute centroids
  let srcCx = 0, srcCy = 0, dstCx = 0, dstCy = 0;
  for (let i = 0; i < n; i++) {
    srcCx += src[i][0];
    srcCy += src[i][1];
    dstCx += dst[i][0];
    dstCy += dst[i][1];
  }
  srcCx /= n; srcCy /= n;
  dstCx /= n; dstCy /= n;

  // Center the points
  const srcCentered: number[][] = [];
  const dstCentered: number[][] = [];
  for (let i = 0; i < n; i++) {
    srcCentered.push([src[i][0] - srcCx, src[i][1] - srcCy]);
    dstCentered.push([dst[i][0] - dstCx, dst[i][1] - dstCy]);
  }

  // Compute scale
  let srcScale = 0, dstScale = 0;
  for (let i = 0; i < n; i++) {
    srcScale += srcCentered[i][0] ** 2 + srcCentered[i][1] ** 2;
    dstScale += dstCentered[i][0] ** 2 + dstCentered[i][1] ** 2;
  }
  srcScale = Math.sqrt(srcScale / n);
  dstScale = Math.sqrt(dstScale / n);
  const scale = dstScale / srcScale;

  // Compute rotation
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += dstCentered[i][0] * srcCentered[i][1] - dstCentered[i][1] * srcCentered[i][0];
    den += dstCentered[i][0] * srcCentered[i][0] + dstCentered[i][1] * srcCentered[i][1];
  }
  const angle = Math.atan2(num, den);

  const a = scale * Math.cos(angle);
  const b = scale * Math.sin(angle);
  const tx = dstCx - a * srcCx + b * srcCy;
  const ty = dstCy - b * srcCx - a * srcCy;

  return { a, b, tx, ty };
}

/**
 * Extract face crop for age estimation
 *
 * Simple IPD-based crop without alignment. Alignment attempts produced worse results.
 * Current approach: crop based on interpupillary distance, centered on face.
 *
 * Known issue: Absolute ages are overestimated (~3x too high), but relative differences
 * are detected correctly. This is sufficient for age-penalty scoring.
 */
export function extractFaceCrop(
  canvas: OffscreenCanvas,
  landmarks: { x: number; y: number }[]
): OffscreenCanvas {
  const leftEye = computeLandmarkCenter(landmarks, LEFT_EYE_INDICES);
  const rightEye = computeLandmarkCenter(landmarks, RIGHT_EYE_INDICES);

  // Face center is midpoint between eyes
  const faceCenterX = (leftEye.x + rightEye.x) / 2;
  const faceCenterY = (leftEye.y + rightEye.y) / 2;

  // Interpupillary distance
  const ipd = distance(leftEye, rightEye);

  // Crop size: 2.8× IPD
  const cropSize = ipd * 2.8;

  // Crop square centered on face
  const cropX = faceCenterX - cropSize / 2;
  const cropY = faceCenterY - cropSize / 2;

  // Clamp to canvas bounds
  const finalX = clamp(cropX, 0, canvas.width - cropSize);
  const finalY = clamp(cropY, 0, canvas.height - cropSize);
  const finalSize = Math.min(cropSize, canvas.width - finalX, canvas.height - finalY);

  // Create 96x96 crop
  const SIZE = 96;
  const cropCanvas = new OffscreenCanvas(SIZE, SIZE);
  const ctx = cropCanvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get 2d context');

  ctx.drawImage(
    canvas,
    finalX, finalY, finalSize, finalSize,
    0, 0, SIZE, SIZE
  );

  return cropCanvas;
}
// Gender-specific calibration fitted from browser-pipeline data (face detection + IPD crop)
// Based on 144 UTKFace uncropped images processed through actual runtime pipeline
// 3-segment piecewise linear regression per gender: Combined MAE 13.15 years (9.9% improvement over unified)
// Male MAE: 11.66 years, Female MAE: 14.09 years
const AGE_CALIBRATION_MALE = {
  threshold1: 29.7,
  threshold2: 44.3,
  lowSlope: 2.2367,
  lowIntercept: -33.98,
  midSlope: 0.6491,
  midIntercept: -4.26,
  highSlope: 1.0622,
  highIntercept: -38.51,
  minAge: 0,
  maxAge: 120,
} as const;

const AGE_CALIBRATION_FEMALE = {
  threshold1: 49.7,
  threshold2: 54.8,
  lowSlope: 0.0741,
  lowIntercept: 11.59,
  midSlope: -1.7985,
  midIntercept: 135.88,
  highSlope: 2.3083,
  highIntercept: -103.98,
  minAge: 0,
  maxAge: 120,
} as const;

// Unified fallback calibration (used when gender confidence is low)
// Same as original 3-segment fit on all 144 samples
const AGE_CALIBRATION_UNIFIED = {
  threshold1: 30.6,
  threshold2: 49.7,
  lowSlope: 1.0902,
  lowIntercept: -8.90,
  midSlope: 0.0247,
  midIntercept: 15.55,
  highSlope: 0.8301,
  highIntercept: -11.39,
  minAge: 0,
  maxAge: 120,
} as const;

// Minimum gender confidence required to use gender-specific calibration
// Below this threshold, use unified calibration to avoid errors from gender misclassification
const GENDER_CONFIDENCE_THRESHOLD = 1.0;

export function calibratePredictedAge(
  predictedAge: number,
  gender: 'male' | 'female',
  genderConfidence?: number
): number {
  // Use gender-specific calibration only when confidence is high
  // Otherwise fall back to unified calibration to avoid errors from misclassification
  const useGenderSpecific = genderConfidence !== undefined && genderConfidence >= GENDER_CONFIDENCE_THRESHOLD;

  const cal = useGenderSpecific
    ? (gender === 'male' ? AGE_CALIBRATION_MALE : AGE_CALIBRATION_FEMALE)
    : AGE_CALIBRATION_UNIFIED;

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
}
