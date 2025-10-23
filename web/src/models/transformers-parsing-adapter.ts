"use client";
/**
 * Face Parsing Adapter using Transformers.js (Xenova/face-parsing)
 *
 * This adapter uses the browser-compatible Transformers.js library with the
 * Xenova/face-parsing model (SegFormer fine-tuned on CelebAMask-HQ).
 *
 * Unlike ONNX Runtime Web, Transformers.js works reliably in browsers.
 */

import type {
  DetectorAdapter,
  Detection,
  RegionHintsArray,
  DetectorImage,
  RegionHint,
  RegionMaskDebug,
} from './detector-types';
import type { Pt } from '@/lib/hints';
import { deriveRegionHints } from '@/lib/hints';
import { maskToOutline } from '@/lib/mask';
import { computeFaceCrop } from './parsing-utils';
import { FEATURE_OUTLINES } from '@/lib/regions';
import { PARSING_NECK_GUARD, PARSING_TRACE_LOGS } from './parsing-config';
import type { FaceLandmarksDetectorInput, MediaPipeFaceMeshTfjsEstimationConfig, Face, Keypoint } from '@tensorflow-models/face-landmarks-detection';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';

let detectorPromise: ReturnType<typeof import('@tensorflow-models/face-landmarks-detection').createDetector> | null = null;

// Class ID mapping for transformers.js output labels
// Maps from transformers.js label names to our internal class IDs (CelebAMask-HQ compatible)
const LABEL_TO_CLASS_ID: Record<string, number> = {
  'background': 0,
  'skin': 1,
  'nose': 2,
  'l_eye': 4,
  'r_eye': 5,
  'l_brow': 6,
  'r_brow': 7,
  'l_ear': 8,
  'r_ear': 9,
  'ear_r': 9, // duplicate label for r_ear
  'mouth': 10,
  'u_lip': 11,
  'l_lip': 12,
  'hair': 13,
  'necklace': 16,
  'neck': 17,
  'cloth': 18,
  // eyeglasses (3) not provided by this model
  // hat (14), earring (15), necklace (16), cloth (18) also not provided
};

const NECK_CLASS_ID = LABEL_TO_CLASS_ID['neck'];
const SKIN_CLASS_ID = LABEL_TO_CLASS_ID['skin'];
const NECK_ALIAS_CLASS_IDS = [
  LABEL_TO_CLASS_ID['necklace'],
  LABEL_TO_CLASS_ID['cloth'],
].filter((id): id is number => typeof id === 'number');
const NECK_LIKE_CLASS_IDS = [NECK_CLASS_ID, ...NECK_ALIAS_CLASS_IDS].filter(
  (id, idx, arr) => typeof id === 'number' && id >= 0 && arr.indexOf(id) === idx
);
const LARGE_NECK_PENALTY = 1e6;

type Landmark2D = { x: number; y: number };

interface NeckGuardDebug {
  clampedPixels: number;
  clampedByClass: Record<number, number>;
  suppressedPixels: number;
  suppressedByClass: Record<number, number>;
  suppressedMinMargin: number;
  suppressedMaxEntropy: number;
  keptPixels: number;
  keptByClass: Record<number, number>;
  keptMinMargin: number;
  keptMaxEntropy: number;
  componentsBefore: Record<number, number[]>;
  componentsRemoved: Record<number, number[]>;
  componentsKept: Record<number, number[]>;
  remainingPixels: Record<number, number>;
  distanceRaw: Record<number, DistanceStat>;
  distancePost: Record<number, DistanceStat>;
}

interface NeckClampInfo {
  jawLine: Float32Array;
  insideMargin: number;
  guardBand: number;
  faceHeight: number;
  width: number;
  height: number;
}

interface DistanceStat {
  count: number;
  min: number;
  max: number;
  sum: number;
  above: number;
  below: number;
  bandHist: Record<string, number>;
}

function createNeckGuardDebug(): NeckGuardDebug {
  return {
    clampedPixels: 0,
    clampedByClass: {},
    suppressedPixels: 0,
    suppressedByClass: {},
    suppressedMinMargin: Number.POSITIVE_INFINITY,
    suppressedMaxEntropy: 0,
    keptPixels: 0,
    keptByClass: {},
    keptMinMargin: Number.POSITIVE_INFINITY,
    keptMaxEntropy: 0,
    componentsBefore: {},
    componentsRemoved: {},
    componentsKept: {},
    remainingPixels: {},
    distanceRaw: {},
    distancePost: {},
  };
}

interface FaceBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ensureDistanceStat(store: Record<number, DistanceStat>, cls: number): DistanceStat {
  let stat = store[cls];
  if (!stat) {
    stat = store[cls] = {
      count: 0,
      min: Number.POSITIVE_INFINITY,
      max: Number.NEGATIVE_INFINITY,
      sum: 0,
      above: 0,
      below: 0,
      bandHist: {},
    };
  }
  return stat;
}

function summarizeDistanceStats(source: Record<number, DistanceStat>): Record<number, unknown> {
  const summary: Record<number, unknown> = {};
  for (const [key, stat] of Object.entries(source)) {
    if (!stat.count) continue;
    const sortedBands = Object.entries(stat.bandHist)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .slice(0, 8);
    summary[Number(key)] = {
      count: stat.count,
      mean: stat.sum / stat.count,
      min: stat.min,
      max: stat.max,
      above: stat.above,
      below: stat.below,
      bands: sortedBands,
    };
  }
  return summary;
}

function accumulateDistanceStats(
  labels: Uint8Array | null,
  clamp: NeckClampInfo | null,
  classes: number[],
  store: Record<number, DistanceStat>
) {
  if (!labels || !clamp) return;
  const { jawLine, faceHeight, width, height } = clamp;
  if (!faceHeight || !width || !height) return;
  const classSet = new Set(classes.filter(id => id >= 0));
  if (!classSet.size) return;
  const step = 0.05; // normalized distance per bin
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const cls = labels[rowOffset + x];
      if (!classSet.has(cls)) continue;
      const jaw = jawLine[x];
      if (!Number.isFinite(jaw)) continue;
      const distPx = y - jaw;
      const distNorm = distPx / faceHeight;
      const stat = ensureDistanceStat(store, cls);
      stat.count += 1;
      stat.sum += distNorm;
      if (distNorm < stat.min) stat.min = distNorm;
      if (distNorm > stat.max) stat.max = distNorm;
      if (distPx <= 0) stat.above += 1; else stat.below += 1;
      const band = Math.floor(distNorm / step) * step;
      const bandKey = band.toFixed(2);
      stat.bandHist[bandKey] = (stat.bandHist[bandKey] || 0) + 1;
    }
  }
}

function computeFaceBounds(points: Landmark2D[]): FaceBounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const pt of points) {
    if (!pt) continue;
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function scaleJawPoints(
  outline: number[] | undefined,
  points: Landmark2D[],
  scaleX: number,
  scaleY: number,
  width: number,
  height: number
): Landmark2D[] {
  if (!outline) return [];
  const scaled: Landmark2D[] = [];
  const maxX = Math.max(0, width - 1);
  const maxY = Math.max(0, height - 1);
  for (const idx of outline) {
    const src = points[idx];
    if (!src) continue;
    if (!Number.isFinite(src.x) || !Number.isFinite(src.y)) continue;
    scaled.push({
      x: clamp(src.x * scaleX, 0, maxX),
      y: clamp(src.y * scaleY, 0, maxY),
    });
  }
  return scaled;
}

function computeJawLine(width: number, height: number, jawPoints: Landmark2D[]): Float32Array {
  const line = new Float32Array(width);
  line.fill(Number.NaN);
  if (!jawPoints.length) return line;
  for (let i = 1; i < jawPoints.length; i++) {
    const prev = jawPoints[i - 1];
    const curr = jawPoints[i];
    const x0 = Math.round(prev.x);
    const x1 = Math.round(curr.x);
    const steps = Math.max(1, Math.abs(x1 - x0));
    for (let s = 0; s <= steps; s++) {
      const t = steps === 0 ? 0 : s / steps;
      const x = clamp(Math.round(prev.x + (curr.x - prev.x) * t), 0, Math.max(0, width - 1));
      const y = clamp(prev.y + (curr.y - prev.y) * t, 0, Math.max(0, height - 1));
      const current = line[x];
      if (Number.isNaN(current) || y > current) {
        line[x] = y;
      }
    }
  }

  // Forward fill gaps
  let last = Number.NaN;
  for (let x = 0; x < width; x++) {
    const val = line[x];
    if (Number.isNaN(val)) {
      if (!Number.isNaN(last)) {
        line[x] = last;
      }
    } else {
      last = val;
    }
  }

  // Backward fill remaining gaps
  last = Number.NaN;
  for (let x = width - 1; x >= 0; x--) {
    const val = line[x];
    if (Number.isNaN(val)) {
      if (!Number.isNaN(last)) {
        line[x] = last;
      }
    } else {
      last = val;
    }
  }

  // Replace any remaining NaNs with max observed value
  let fallback = 0;
  for (let x = 0; x < width; x++) {
    const val = line[x];
    if (!Number.isNaN(val)) fallback = Math.max(fallback, val);
  }
  for (let x = 0; x < width; x++) {
    if (Number.isNaN(line[x])) line[x] = fallback;
  }

  return line;
}

function applyNeckGuardsToLogits(
  logits: { dims: number[]; data: Float32Array | Uint8Array | number[] },
  points: Landmark2D[],
  imageWidth: number,
  imageHeight: number,
  debug?: NeckGuardDebug
): NeckClampInfo | null {
  if (!PARSING_NECK_GUARD) return null;
  if (!Array.isArray(points) || points.length === 0) return null;
  const bounds = computeFaceBounds(points);
  if (!bounds) return null;
  const dims = logits.dims;
  if (dims.length !== 4) return null;
  const numClasses = dims[1];
  const outHeight = dims[2];
  const outWidth = dims[3];
  if (outWidth <= 0 || outHeight <= 0) return null;
  if (!NECK_LIKE_CLASS_IDS.some(id => id < numClasses)) return null;

  const data = logits.data;
  if (!(data instanceof Float32Array)) return null;

  const planeSize = outWidth * outHeight;
  if (planeSize <= 0) return null;

  const scaleX = imageWidth > 0 ? outWidth / imageWidth : 1;
  const scaleY = imageHeight > 0 ? outHeight / imageHeight : 1;
  const jawOutline = FEATURE_OUTLINES.jaw?.[0];
  const jawPoints = scaleJawPoints(jawOutline, points, scaleX, scaleY, outWidth, outHeight);
  if (jawPoints.length < 3) return null;

  const jawLine = computeJawLine(outWidth, outHeight, jawPoints);
  const faceHeight = bounds.height * scaleY;
  const insideMargin = Math.max(1, faceHeight * 0.12);
  const guardBand = Math.max(2, faceHeight * 0.06);
  const skinOffset = SKIN_CLASS_ID < numClasses && SKIN_CLASS_ID >= 0 ? SKIN_CLASS_ID * planeSize : -1;
  const entropyThreshold = 1.0;
  const marginThreshold = 0.85;

  for (const targetClass of NECK_LIKE_CLASS_IDS) {
    if (targetClass < 0 || targetClass >= numClasses) continue;
    const offset = targetClass * planeSize;

    for (let x = 0; x < outWidth; x++) {
      const jaw = jawLine[x];
      if (!Number.isFinite(jaw)) continue;
      const clampY = Math.max(0, Math.floor(jaw - insideMargin));
      for (let y = 0; y <= clampY; y++) {
        const pos = y * outWidth + x;
        data[offset + pos] = -LARGE_NECK_PENALTY;
        if (debug) {
          debug.clampedPixels += 1;
          debug.clampedByClass[targetClass] = (debug.clampedByClass[targetClass] || 0) + 1;
        }
      }
    }

    if (targetClass !== NECK_CLASS_ID) {
      continue;
    }

    const tmpLogits = new Float32Array(numClasses);
    const tmpExp = new Float32Array(numClasses);

    for (let y = 0; y < outHeight; y++) {
      for (let x = 0; x < outWidth; x++) {
        const pos = y * outWidth + x;
        const jaw = jawLine[x];
        if (!Number.isFinite(jaw)) continue;
        if (y < jaw - insideMargin) continue;
        if (y > Math.min(outHeight - 1, jaw + guardBand)) continue;

        let bestClass = -1;
        let bestLogit = -Infinity;
        let secondLogit = -Infinity;
        for (let c = 0; c < numClasses; c++) {
          const val = data[c * planeSize + pos];
          tmpLogits[c] = val;
          if (val > bestLogit) {
            secondLogit = bestLogit;
            bestLogit = val;
            bestClass = c;
          } else if (val > secondLogit) {
            secondLogit = val;
          }
        }

        if (bestClass !== targetClass) continue;

        let competitor = secondLogit;
        if (skinOffset >= 0) {
          const skinLogit = data[skinOffset + pos];
          competitor = Math.max(competitor, skinLogit);
        }

        const margin = bestLogit - competitor;

        const top = bestLogit;
        let sumExp = 0;
        for (let c = 0; c < numClasses; c++) {
          const e = Math.exp(tmpLogits[c] - top);
          tmpExp[c] = e;
          sumExp += e;
        }
        const inv = sumExp > 0 ? 1 / sumExp : 0;
        let entropy = 0;
        for (let c = 0; c < numClasses; c++) {
          const p = tmpExp[c] * inv;
          if (p > 1e-6) {
            entropy -= p * Math.log(p);
          }
        }

        if (margin < marginThreshold || entropy > entropyThreshold) {
          data[offset + pos] = competitor - 0.01;
          if (debug) {
            debug.suppressedPixels += 1;
            debug.suppressedByClass[targetClass] = (debug.suppressedByClass[targetClass] || 0) + 1;
            if (margin < debug.suppressedMinMargin) debug.suppressedMinMargin = margin;
            if (entropy > debug.suppressedMaxEntropy) debug.suppressedMaxEntropy = entropy;
          }
        } else if (debug) {
          debug.keptPixels += 1;
          debug.keptByClass[targetClass] = (debug.keptByClass[targetClass] || 0) + 1;
          if (margin < debug.keptMinMargin) debug.keptMinMargin = margin;
          if (entropy > debug.keptMaxEntropy) debug.keptMaxEntropy = entropy;
        }
      }
    }
  }

  return { jawLine, insideMargin, guardBand, faceHeight, width: outWidth, height: outHeight };
}

function removeSmallNeckIslands(
  labels: Uint8Array,
  width: number,
  height: number,
  bounds: FaceBounds | null,
  replacementClass: number,
  targetClasses: number[],
  debug?: NeckGuardDebug
) {
  if (!PARSING_NECK_GUARD) return;
  if (labels.length !== width * height) return;
  if (!targetClasses.length) return;
  const minArea = (() => {
    if (!bounds) return Math.max(8, Math.round(width * height * 0.002));
    const faceArea = bounds.width * bounds.height;
    return Math.max(16, Math.round(faceArea * 0.005));
  })();

  const total = labels.length;
  const stack = new Int32Array(total);
  const component: number[] = [];
  const fallbackClass = replacementClass >= 0 ? replacementClass : 1;

  for (const targetClass of targetClasses) {
    if (targetClass < 0) continue;
    component.length = 0;
    const visited = new Uint8Array(total);
    for (let idx = 0; idx < total; idx++) {
      if (labels[idx] !== targetClass || visited[idx]) continue;
      component.length = 0;
      let top = 0;
      stack[top++] = idx;
      visited[idx] = 1;

      while (top > 0) {
        const current = stack[--top];
        component.push(current);
        const x = current % width;
        const y = (current / width) | 0;

        if (x > 0) {
          const next = current - 1;
          if (!visited[next] && labels[next] === targetClass) {
            visited[next] = 1;
            stack[top++] = next;
          }
        }
        if (x + 1 < width) {
          const next = current + 1;
          if (!visited[next] && labels[next] === targetClass) {
            visited[next] = 1;
            stack[top++] = next;
          }
        }
        if (y > 0) {
          const next = current - width;
          if (!visited[next] && labels[next] === targetClass) {
            visited[next] = 1;
            stack[top++] = next;
          }
        }
        if (y + 1 < height) {
          const next = current + width;
          if (!visited[next] && labels[next] === targetClass) {
            visited[next] = 1;
            stack[top++] = next;
          }
        }
      }

      if (debug) {
        (debug.componentsBefore[targetClass] ||= []).push(component.length);
      }

      if (component.length < minArea) {
        for (const pos of component) {
          labels[pos] = fallbackClass;
        }
        if (debug) {
          (debug.componentsRemoved[targetClass] ||= []).push(component.length);
        }
      } else if (debug) {
        (debug.componentsKept[targetClass] ||= []).push(component.length);
      }
    }
  }
}

function clampAliasLabelsToSkin(
  labels: Uint8Array,
  clamp: NeckClampInfo | null,
  aliasClasses: number[],
  fallbackClass: number,
  debug?: NeckGuardDebug
) {
  if (!PARSING_NECK_GUARD) return;
  if (!clamp) return;
  if (!aliasClasses.length) return;
  const { jawLine, guardBand, faceHeight, width, height } = clamp;
  const aliasSet = new Set(aliasClasses.filter(id => id >= 0));
  if (!aliasSet.size) return;
  const neckSlack = Math.max(1, faceHeight * 0.15);
  const aliasFallback = fallbackClass;

  for (let x = 0; x < width; x++) {
    const jaw = jawLine[x];
    if (!Number.isFinite(jaw)) continue;
    const limit = Math.min(height - 1, Math.floor(jaw + Math.min(guardBand, faceHeight * 0.06)));
    for (let y = 0; y <= limit; y++) {
      const idx = y * width + x;
      const cls = labels[idx];
      const nearNeck = cls === NECK_CLASS_ID && y <= jaw + neckSlack;
      if (aliasSet.has(cls)) {
        labels[idx] = aliasFallback;
        if (debug) {
          debug.suppressedPixels += 1;
          debug.suppressedByClass[cls] = (debug.suppressedByClass[cls] || 0) + 1;
        }
      } else if (nearNeck) {
        labels[idx] = fallbackClass;
        if (debug) {
          debug.suppressedPixels += 1;
          debug.suppressedByClass[cls] = (debug.suppressedByClass[cls] || 0) + 1;
        }
      }
    }
  }
}

async function coreDetector() {
  if (!detectorPromise) {
    await (async () => {
      try { await tf.setBackend('webgl'); } catch { await tf.setBackend('cpu'); }
      await tf.ready();
    })();
    const face = await import('@tensorflow-models/face-landmarks-detection');
    const model = face.SupportedModels.MediaPipeFaceMesh;
    detectorPromise = face.createDetector(model, { runtime: 'tfjs', refineLandmarks: true });
  }
  return await detectorPromise;
}

export const transformersParsingAdapter: DetectorAdapter = {
  async getDetector() {
    return coreDetector();
  },

  async detect(image: HTMLImageElement | HTMLCanvasElement | ImageBitmap): Promise<Detection | null> {
    const det = await coreDetector();
    const input = image as unknown as FaceLandmarksDetectorInput;
    const est: MediaPipeFaceMeshTfjsEstimationConfig = { flipHorizontal: false, staticImageMode: true } as MediaPipeFaceMeshTfjsEstimationConfig;
    const faces = (await det.estimateFaces(input, est)) as Face[];
    if (!faces?.length) return null;
    type FaceLike = { keypoints?: Keypoint[]; scaledMesh?: Array<[number, number, number?]>; annotations?: Record<string, Keypoint[]> };
    const f = faces[0] as unknown as FaceLike;
    const keypoints: Keypoint[] = f.keypoints ?? (f.scaledMesh ?? []).map(p => ({ x: p[0], y: p[1], z: p[2] } as Keypoint));
    return { keypoints, annotations: f.annotations };
  },

  async hintsFrom(
    image: DetectorImage | null,
    points: { x: number; y: number }[],
    eyeLeft,
    eyeRight
  ) {
    // Use landmark-based extraction as fallback
    const landmarkHints = deriveRegionHints(points as Pt[]);
    const faceBounds = computeFaceBounds(points as Landmark2D[]);
    const neckDebug = (PARSING_NECK_GUARD && process.env.NODE_ENV !== 'production') ? createNeckGuardDebug() : undefined;
    let clampInfo: NeckClampInfo | null = null;

    if (!image) {
      const arr = landmarkHints as RegionHintsArray;
      arr.__source = 'landmarks';
      return arr;
    }

    try {
      // Dynamically import transformers.js (browser-compatible)
      const transformersModule = await import('@xenova/transformers').catch(() => null);

      if (!transformersModule) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[transformers-parsing] @xenova/transformers not available');
        }
        const fb = landmarkHints as RegionHintsArray;
        fb.__source = 'landmarks';
        fb.__transformers = 'missing';
        return fb;
      }

      const { AutoModel, AutoProcessor, env, RawImage, Tensor } = transformersModule;

      // Allow remote models (HuggingFace Hub)
      env.allowLocalModels = false;

      // Cache the model and processor globally
      const modelKey = '__transformersParsingModel__';
      const processorKey = '__transformersParsingProcessor__';
      const store = globalThis as Record<string, unknown>;

      type TensorLike = { dims: number[]; data: Float32Array | Uint8Array };
      type ModelInputs = { pixel_values: TensorLike };
      type ModelOutputs = { logits: TensorLike };
      type ProcessedOutputs = Array<{ segmentation: TensorLike }>;
      type ModelType = {
        (inputs: ModelInputs): Promise<ModelOutputs>;
        generate?: (inputs: ModelInputs) => Promise<ModelOutputs>;
      };
      type ProcessorType = {
        (images: unknown): Promise<ModelInputs>;
        feature_extractor?: {
          post_process_semantic_segmentation: (outputs: ModelOutputs, sizes: number[][]) => ProcessedOutputs;
        };
      };

      let model = store[modelKey] as ModelType | undefined;
      let processor = store[processorKey] as ProcessorType | undefined;

      if (!model || !processor) {
        if (process.env.NODE_ENV !== 'production') {
          console.info('[transformers-parsing] loading jonathandinu/face-parsing model directly...');
        }

        // Load model and processor directly (not through pipeline)
        [processor, model] = await Promise.all([
          AutoProcessor.from_pretrained('jonathandinu/face-parsing'),
          AutoModel.from_pretrained('jonathandinu/face-parsing')
        ]);

        store[modelKey] = model;
        store[processorKey] = processor;

        if (process.env.NODE_ENV !== 'production') {
          console.info('[transformers-parsing] model and processor loaded successfully');
        }
      }

      // Use full image - the model needs complete context for proper segmentation
      const size = image as { width: number; height: number };
      const iw = size.width;
      const ih = size.height;

      if (PARSING_TRACE_LOGS && process.env.NODE_ENV !== 'production') {
        console.info('[transformers-parsing] image type:', image?.constructor?.name, 'size:', iw, 'x', ih);
      }

      // Convert full image to RawImage for model input
      const canvas = new OffscreenCanvas(iw, ih);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2D context not available');

      ctx.drawImage(
        image as HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas,
        0, 0, iw, ih
      );

      const imageData = ctx.getImageData(0, 0, iw, ih);
      const rawImage = new RawImage(imageData.data, iw, ih, 4); // RGBA

      if (PARSING_TRACE_LOGS && process.env.NODE_ENV !== 'production') {
        console.info('[transformers-parsing] running direct model inference on full image:', iw, 'x', ih);
        console.info('[transformers-parsing] RawImage created:', rawImage.width, 'x', rawImage.height, 'channels:', rawImage.channels);
        const sampleIdx = Math.floor((iw * ih) / 2) * 4;
        console.info('[transformers-parsing] sample pixel RGBA:',
          imageData.data[sampleIdx], imageData.data[sampleIdx+1],
          imageData.data[sampleIdx+2], imageData.data[sampleIdx+3]);
      }

      const startTime = Date.now();

      // Preprocess image
      const inputs = await processor(rawImage);

      // Debug: check input tensor shape
      if (PARSING_TRACE_LOGS && process.env.NODE_ENV !== 'production') {
        console.info('[transformers-parsing] input pixel_values shape:', inputs.pixel_values.dims);
      }

      // Run model
      const outputs = await model(inputs);

      const inferenceTime = Date.now() - startTime;

      if (PARSING_TRACE_LOGS && process.env.NODE_ENV !== 'production') {
        console.info('[transformers-parsing] inference completed in', inferenceTime, 'ms');
        console.info('[transformers-parsing] output keys:', Object.keys(outputs));
      }

      // Get logits (raw model output) - shape should be [1, num_classes, height, width]
      const logits = outputs.logits;

      if (!logits) {
        throw new Error('Model output missing logits');
      }

      const [batch, numClasses, outHeight, outWidth] = logits.dims;

      if (PARSING_NECK_GUARD && numClasses > NECK_CLASS_ID) {
        clampInfo = applyNeckGuardsToLogits(
          logits,
          points as Landmark2D[],
          iw,
          ih,
          neckDebug
        );
      }

      if (PARSING_TRACE_LOGS && process.env.NODE_ENV !== 'production') {
        console.info('[transformers-parsing] logits shape:', logits.dims, 'classes:', numClasses);
        console.info('[transformers-parsing] will upsample from', outHeight, 'x', outWidth, 'to', ih, 'x', iw);

        // Sample logits at center pixel to check if model is producing varied outputs
        const centerH = Math.floor(outHeight / 2);
        const centerW = Math.floor(outWidth / 2);
        const centerPixelLogits = [];
        for (let c = 0; c < Math.min(numClasses, 5); c++) {
          const idx = c * outHeight * outWidth + centerH * outWidth + centerW;
          centerPixelLogits.push(logits.data[idx].toFixed(2));
        }
        console.info('[transformers-parsing] center pixel logits (first 5 classes):', centerPixelLogits.join(', '));
      }

      // Use the documented post-processing method to upsample and apply argmax
      // This handles bilinear interpolation and argmax internally
      const processed = processor.feature_extractor?.post_process_semantic_segmentation(
        outputs,
        [[ih, iw]] // Array of target sizes (one per batch item) - full image size
      );

      if (!processed) {
        throw new Error('Processor missing feature_extractor.post_process_semantic_segmentation method');
      }

      // Extract the segmentation tensor (already upsampled and argmax'd)
      const segmentationTensor = processed[0].segmentation;
      const labels = new Uint8Array(segmentationTensor.data);
      const [segHeight, segWidth] = segmentationTensor.dims;
      const labelsSnapshot = neckDebug ? labels.slice() : null;

      if (neckDebug) {
        accumulateDistanceStats(labelsSnapshot, clampInfo, NECK_LIKE_CLASS_IDS, neckDebug.distanceRaw);
      }

      if (PARSING_NECK_GUARD) {
        removeSmallNeckIslands(labels, segWidth, segHeight, faceBounds, SKIN_CLASS_ID, NECK_LIKE_CLASS_IDS, neckDebug);
        clampAliasLabelsToSkin(labels, clampInfo, NECK_ALIAS_CLASS_IDS, SKIN_CLASS_ID, neckDebug);
        if (neckDebug) {
          accumulateDistanceStats(labels, clampInfo, NECK_LIKE_CLASS_IDS, neckDebug.distancePost);
          for (const cls of NECK_LIKE_CLASS_IDS) {
            let remaining = 0;
            for (let i = 0; i < labels.length; i++) {
              if (labels[i] === cls) remaining += 1;
            }
            neckDebug.remainingPixels[cls] = remaining;
          }
          if (PARSING_TRACE_LOGS && process.env.NODE_ENV !== 'production') {
            const stats = {
              clamped: neckDebug.clampedPixels,
              clampedByClass: neckDebug.clampedByClass,
              suppressed: neckDebug.suppressedPixels,
              suppressedByClass: neckDebug.suppressedByClass,
              suppressedMinMargin: Number.isFinite(neckDebug.suppressedMinMargin) ? neckDebug.suppressedMinMargin : null,
              suppressedMaxEntropy: neckDebug.suppressedMaxEntropy || null,
              kept: neckDebug.keptPixels,
              keptByClass: neckDebug.keptByClass,
              keptMinMargin: Number.isFinite(neckDebug.keptMinMargin) ? neckDebug.keptMinMargin : null,
              keptMaxEntropy: neckDebug.keptMaxEntropy || null,
              componentsBefore: neckDebug.componentsBefore,
              componentsRemoved: neckDebug.componentsRemoved,
              componentsKept: neckDebug.componentsKept,
              remainingPixels: neckDebug.remainingPixels,
              distanceRaw: summarizeDistanceStats(neckDebug.distanceRaw),
              distancePost: summarizeDistanceStats(neckDebug.distancePost),
            };
            console.info('[transformers-parsing] neck guard debug', stats);
          }
        }
      }

      if (PARSING_TRACE_LOGS && process.env.NODE_ENV !== 'production') {
        const hist = new Map<number, number>();
        for (let i = 0; i < labels.length; i++) {
          const classId = labels[i];
          hist.set(classId, (hist.get(classId) || 0) + 1);
        }
        const top = Array.from(hist.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10);
        console.info('[transformers-parsing] class distribution:', top.map(([k, v]) => `${k}:${v}`).join(', '));
      }

      // Create debug mask (full image, no crop)
      const debugMask: RegionMaskDebug = {
        width: segWidth,
        height: segHeight,
        labels: labels.slice(),
        crop: { sx: 0, sy: 0, sw: iw, sh: ih },
      };

      // Generate region hints from segmentation masks
      const hints: RegionHint[] = [];

      // Define regions to extract - process each class separately to avoid merging
      const regionClasses: { region: string; classId: number; open?: boolean }[] = [
        { region: 'brows', classId: 6, open: true },  // l_brow
        { region: 'brows', classId: 7, open: true },  // r_brow
        { region: 'nose', classId: 2, open: true },    // nose
        { region: 'eyes', classId: 4 },                // l_eye
        { region: 'eyes', classId: 5 },                // r_eye
        { region: 'mouth', classId: 10 },              // mouth
        { region: 'mouth', classId: 11 },              // u_lip
        { region: 'mouth', classId: 12 },              // l_lip
      ];

      for (const { region, classId, open } of regionClasses) {
        // Create binary mask for this specific class (not merged)
        const classMask = new Uint8Array(labels.length);
        for (let i = 0; i < labels.length; i++) {
          classMask[i] = labels[i] === classId ? 1 : 0;
        }

        // Check if this class has any pixels
        const pixelCount = classMask.reduce((sum, v) => sum + v, 0);
        if (pixelCount === 0) continue;

        if (PARSING_TRACE_LOGS && process.env.NODE_ENV !== 'production') {
          console.info(`[transformers-parsing] processing region=${region} classId=${classId} pixels=${pixelCount}`);
        }

        // Convert mask to outline polygon
        const outline = maskToOutline(classMask, segWidth, segHeight, 2.0);

        if (PARSING_TRACE_LOGS && process.env.NODE_ENV !== 'production') {
          console.info(`[transformers-parsing] outline for classId=${classId}: ${outline.length} points`);
        }

        if (outline.length >= 3) {
          hints.push({
            region,
            points: outline,
            open: open ?? false,
          });
        }
      }

      // If we didn't get any hints from segmentation, fall back to landmarks
      if (hints.length === 0) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[transformers-parsing] no segmentation hints generated, falling back to landmarks');
        }
        const result = landmarkHints as RegionHintsArray;
        result.__source = 'landmarks';
        result.__transformers = 'no-hints';
        result.__mask = debugMask;
        return result;
      }

      const result = hints as RegionHintsArray;
      result.__source = 'transformers';
      result.__transformers = 'ok';
      result.__mask = debugMask;

      if (PARSING_TRACE_LOGS && process.env.NODE_ENV !== 'production') {
        console.info('[transformers-parsing] generated', hints.length, 'region hints from segmentation');
      }

      return result;

    } catch (e) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[transformers-parsing] error:', e);
      }
      const fb = landmarkHints as RegionHintsArray;
      fb.__source = 'landmarks';
      fb.__transformers = 'error';
      return fb;
    }
  },
};
