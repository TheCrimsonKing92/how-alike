/**
 * Age Estimation using ONNX Runtime
 *
 * Dual-model approach for improved accuracy:
 * 1. Gender prediction: InsightFace genderage.onnx (96x96, fast, 1.3MB)
 * 2. Age prediction: yu4u ResNet50 (224x224, accurate, 90MB, 4.41 MAE on APPA-REAL)
 *
 * InsightFace genderage.onnx:
 * - Source: https://huggingface.co/fofr/comfyui/blob/main/insightface/models/antelopev2/genderage.onnx
 * - Input: 1 × 3 × 96 × 96 (NCHW, RGB, [0, 255])
 * - Output: 1 × 3 [female_score, male_score, age/100] (age output unused)
 *
 * yu4u age_only_resnet50:
 * - Source: https://github.com/yu4u/age-gender-estimation (converted to ONNX)
 * - Input: 1 × 224 × 224 × 3 (NHWC, RGB, [0, 255])
 * - Output: 1 × 101 (softmax probabilities for ages 0-100)
 * - Age = weighted sum: sum(prob[i] * i for i in 0..100)
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

let genderSession: MinimalOrtSession | null = null;  // For gender prediction
let ageSession: MinimalOrtSession | null = null;      // For age prediction
let ort: OrtLike | null = null;
let inferenceQueue: Promise<any> = Promise.resolve();

/**
 * Initialize the age and gender classifier models
 * Call this once during worker initialization
 */
export async function initAgeClassifier(): Promise<void> {
  if (genderSession && ageSession) return;

  console.info('[age-estimation] Loading gender and age models...');
  const start = performance.now();

  try {
    // Import ONNX Runtime
    const ortMod = (await import('onnxruntime-web').catch(() => null)) as unknown;
    if (!ortMod) {
      throw new Error('ONNX Runtime not available');
    }
    ort = ortMod as OrtLike;

    // Configure ONNX Runtime
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

    // Load gender model (InsightFace, 1.3MB, fast)
    const genderModelUrl = '/models/age-gender/genderage.onnx';
    const genderResponse = await fetch(genderModelUrl);
    if (!genderResponse.ok) throw new Error(`Failed to fetch gender model: ${genderResponse.status}`);
    const genderModelBuffer = await genderResponse.arrayBuffer();

    if (process.env.NODE_ENV !== 'production') {
      console.info('[age-estimation] Gender model size:', (genderModelBuffer.byteLength / (1024 * 1024)).toFixed(2), 'MB');
    }

    genderSession = await ort.InferenceSession.create(genderModelBuffer, {
      executionProviders: ['webgl', 'wasm'],
      graphOptimizationLevel: 'disabled',
      enableCpuMemArena: false,
    });

    // Load age model (yu4u ResNet50, 90MB, accurate)
    const ageModelUrl = '/models/age-gender/yu4u_age_resnet50.onnx';
    const ageResponse = await fetch(ageModelUrl);
    if (!ageResponse.ok) throw new Error(`Failed to fetch age model: ${ageResponse.status}`);
    const ageModelBuffer = await ageResponse.arrayBuffer();

    if (process.env.NODE_ENV !== 'production') {
      console.info('[age-estimation] Age model size:', (ageModelBuffer.byteLength / (1024 * 1024)).toFixed(2), 'MB');
    }

    ageSession = await ort.InferenceSession.create(ageModelBuffer, {
      executionProviders: ['webgl', 'wasm'],
      graphOptimizationLevel: 'disabled',
      enableCpuMemArena: false,
    });

    const elapsed = performance.now() - start;
    console.info(`[age-estimation] Models loaded successfully in ${elapsed.toFixed(0)}ms`);

    if (process.env.NODE_ENV !== 'production') {
      console.info('[age-estimation] Gender model:', { inputs: genderSession.inputNames, outputs: genderSession.outputNames });
      console.info('[age-estimation] Age model:', { inputs: ageSession.inputNames, outputs: ageSession.outputNames });
    }
  } catch (error) {
    console.error('[age-estimation] Failed to load classifiers:', error);
    genderSession = null;
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
  if (!genderSession || !ageSession || !ort) {
    throw new Error('Age classifier not initialized. Call initAgeClassifier() first.');
  }

  // Queue inference to avoid "Session already started" error with concurrent calls
  const inferenceId = ++inferenceCounter;
  const result = await (inferenceQueue = inferenceQueue.then(async () => {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[age-estimation #${inferenceId}] starting dual-model inference`);
    }

    // ===== GENDER PREDICTION (96x96, NCHW, BGR) =====
    const GENDER_SIZE = 96;
    const genderCanvas = new OffscreenCanvas(GENDER_SIZE, GENDER_SIZE);
    const genderCtx = genderCanvas.getContext('2d');
    if (!genderCtx) throw new Error('Cannot get 2d context for gender');

    genderCtx.drawImage(image as any, 0, 0, GENDER_SIZE, GENDER_SIZE);
    const genderImageData = genderCtx.getImageData(0, 0, GENDER_SIZE, GENDER_SIZE);
    const genderRgba = genderImageData.data;

    // Convert to NCHW format: [1, 3, 96, 96] (BGR channels)
    const genderData = new Float32Array(1 * 3 * GENDER_SIZE * GENDER_SIZE);
    for (let y = 0; y < GENDER_SIZE; y++) {
      for (let x = 0; x < GENDER_SIZE; x++) {
        const idx = (y * GENDER_SIZE + x) * 4;
        const baseIdx = y * GENDER_SIZE + x;
        genderData[0 * GENDER_SIZE * GENDER_SIZE + baseIdx] = genderRgba[idx + 2]; // B
        genderData[1 * GENDER_SIZE * GENDER_SIZE + baseIdx] = genderRgba[idx + 1]; // G
        genderData[2 * GENDER_SIZE * GENDER_SIZE + baseIdx] = genderRgba[idx];     // R
      }
    }

    // Run gender inference
    const genderInputName = genderSession!.inputNames[0];
    const genderTensor = new ort!.Tensor('float32', genderData, [1, 3, GENDER_SIZE, GENDER_SIZE]);
    const genderOutputs = await genderSession!.run({ [genderInputName]: genderTensor });
    const genderOutputData = (genderOutputs[genderSession!.outputNames[0]] as any).data as Float32Array;

    const femaleScore = genderOutputData[0];
    const maleScore = genderOutputData[1];
    const gender = maleScore > femaleScore ? 'male' : 'female';
    const genderConfidence = Math.abs(maleScore - femaleScore);

    if (process.env.NODE_ENV !== 'production') {
      console.info(`[age-estimation #${inferenceId}] gender prediction:`, {
        gender,
        femaleScore: femaleScore.toFixed(3),
        maleScore: maleScore.toFixed(3),
        confidence: genderConfidence.toFixed(3)
      });
    }

    // ===== AGE PREDICTION (224x224, NHWC, RGB) =====
    const AGE_SIZE = 224;
    const ageCanvas = new OffscreenCanvas(AGE_SIZE, AGE_SIZE);
    const ageCtx = ageCanvas.getContext('2d');
    if (!ageCtx) throw new Error('Cannot get 2d context for age');

    ageCtx.drawImage(image as any, 0, 0, AGE_SIZE, AGE_SIZE);
    const ageImageData = ageCtx.getImageData(0, 0, AGE_SIZE, AGE_SIZE);
    const ageRgba = ageImageData.data;

    // Convert to NHWC format: [1, 224, 224, 3]
    // yu4u model was trained with raw BGR images [0, 255] - NO normalization!
    // See age-gender-estimation/age_estimation/generator.py:61-62
    // They use cv2.imread (BGR) with dtype=np.uint8, no preprocessing
    const ageData = new Float32Array(1 * AGE_SIZE * AGE_SIZE * 3);
    for (let y = 0; y < AGE_SIZE; y++) {
      for (let x = 0; x < AGE_SIZE; x++) {
        const rgbaIdx = (y * AGE_SIZE + x) * 4;
        const baseIdx = (y * AGE_SIZE + x) * 3;

        // BGR format [0, 255] - CRITICAL: B, G, R order, not R, G, B!
        ageData[baseIdx + 0] = ageRgba[rgbaIdx + 2]; // B (from RGBA blue channel)
        ageData[baseIdx + 1] = ageRgba[rgbaIdx + 1]; // G
        ageData[baseIdx + 2] = ageRgba[rgbaIdx + 0]; // R (from RGBA red channel)
      }
    }

    // Run age inference
    const ageInputName = ageSession!.inputNames[0];
    const ageTensor = new ort!.Tensor('float32', ageData, [1, AGE_SIZE, AGE_SIZE, 3]);
    const ageOutputs = await ageSession!.run({ [ageInputName]: ageTensor });
    const ageOutputData = (ageOutputs[ageSession!.outputNames[0]] as any).data as Float32Array;

    // Age output is 101-class probability distribution (ages 0-100)
    // Calculate expected value: sum(prob[i] * i for i in 0..100)
    let rawAge = 0;
    for (let i = 0; i < 101; i++) {
      rawAge += ageOutputData[i] * i;
    }

    if (process.env.NODE_ENV !== 'production') {
      // Find top 3 predicted ages
      const probs = Array.from(ageOutputData);
      const topIndices = probs
        .map((p, i) => ({ age: i, prob: p }))
        .sort((a, b) => b.prob - a.prob)
        .slice(0, 3);

      console.info(`[age-estimation #${inferenceId}] age prediction:`, {
        rawAge: rawAge.toFixed(1),
        top3: topIndices.map(t => `${t.age}y (${(t.prob * 100).toFixed(1)}%)`).join(', ')
      });
    }

    // Use gender confidence as overall confidence
    const confidence = Math.min(1, Math.max(0, genderConfidence / 3));

    return {
      age: calibratePredictedAge(rawAge, gender, genderConfidence),
      confidence,
      gender,
      genderConfidence,
      rawAge
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
