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
  'neck': 17,
  // eyeglasses (3) not provided by this model
  // hat (14), earring (15), necklace (16), cloth (18) also not provided
};

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
  return detectorPromise as Awaited<typeof detectorPromise>;
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

      type ModelType = { generate?: (inputs: any) => Promise<any>; (inputs: any): Promise<any> };
      type ProcessorType = (images: any) => Promise<any>;

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

      if (process.env.NODE_ENV !== 'production') {
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

      if (process.env.NODE_ENV !== 'production') {
        console.info('[transformers-parsing] running direct model inference on full image:', iw, 'x', ih);
        console.info('[transformers-parsing] RawImage created:', rawImage.width, 'x', rawImage.height, 'channels:', rawImage.channels);
        // Sample a few pixel values to verify image data
        const sampleIdx = Math.floor((iw * ih) / 2) * 4;
        console.info('[transformers-parsing] sample pixel RGBA:',
          imageData.data[sampleIdx], imageData.data[sampleIdx+1],
          imageData.data[sampleIdx+2], imageData.data[sampleIdx+3]);
      }

      const startTime = Date.now();

      // Preprocess image
      const inputs = await processor(rawImage);

      // Debug: check input tensor shape
      if (process.env.NODE_ENV !== 'production') {
        console.info('[transformers-parsing] input pixel_values shape:', inputs.pixel_values.dims);
      }

      // Run model
      const outputs = await model(inputs);

      const inferenceTime = Date.now() - startTime;

      if (process.env.NODE_ENV !== 'production') {
        console.info('[transformers-parsing] inference completed in', inferenceTime, 'ms');
        console.info('[transformers-parsing] output keys:', Object.keys(outputs));
      }

      // Get logits (raw model output) - shape should be [1, num_classes, height, width]
      const logits = outputs.logits;

      if (!logits) {
        throw new Error('Model output missing logits');
      }

      const [batch, numClasses, outHeight, outWidth] = logits.dims;

      if (process.env.NODE_ENV !== 'production') {
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
      const processed = processor.feature_extractor.post_process_semantic_segmentation(
        outputs,
        [[ih, iw]] // Array of target sizes (one per batch item) - full image size
      );

      // Extract the segmentation tensor (already upsampled and argmax'd)
      const segmentationTensor = processed[0].segmentation;
      const labels = new Uint8Array(segmentationTensor.data);
      const [segHeight, segWidth] = segmentationTensor.dims;

      // Log class distribution
      if (process.env.NODE_ENV !== 'production') {
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

      // For now, return landmark hints with mask attached
      // TODO: Generate actual ONNX-style region hints from the segmentation
      const result = landmarkHints as RegionHintsArray;
      result.__source = 'transformers';
      result.__transformers = 'ok';
      result.__mask = debugMask;

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
