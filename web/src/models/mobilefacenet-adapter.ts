"use client";
import * as ort from "onnxruntime-web";

let sessionPromise: Promise<ort.InferenceSession> | null = null;

/**
 * MobileFaceNet adapter for face embedding extraction
 * Model: InsightFace buffalo_sc (w600k_mbf.onnx)
 * Input: [batch, 3, 112, 112] RGB image, normalized to [-1, 1]
 * Output: [batch, 512] embedding vector
 */

export async function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const isDev = process.env.NODE_ENV !== "production";
      const t0 = performance.now();

      // Set WASM paths
      ort.env.wasm.wasmPaths = "/ort/";

      const modelPath = "/models/mobilefacenet/mobilefacenet.onnx";
      const session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ["wasm"],
      });

      const t1 = performance.now();
      if (isDev) {
        console.info(`[mobilefacenet] loaded in ${(t1 - t0).toFixed(0)}ms`);
      }

      return session;
    })();
  }
  return sessionPromise;
}

/**
 * Preprocess face crop for MobileFaceNet
 * - Resize to 112x112
 * - Normalize to [-1, 1] using (pixel - 127.5) / 127.5
 * - Convert to NCHW format (batch, channels, height, width)
 */
export function preprocessFace(
  imageData: ImageData
): Float32Array {
  const { width, height, data } = imageData;

  // Create canvas for resizing
  const canvas = new OffscreenCanvas(112, 112);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get canvas context");

  // Create temporary canvas with source image
  const srcCanvas = new OffscreenCanvas(width, height);
  const srcCtx = srcCanvas.getContext("2d");
  if (!srcCtx) throw new Error("Failed to get source canvas context");

  const srcImageData = new ImageData(
    new Uint8ClampedArray(data),
    width,
    height
  );
  srcCtx.putImageData(srcImageData, 0, 0);

  // Resize to 112x112
  ctx.drawImage(srcCanvas, 0, 0, width, height, 0, 0, 112, 112);
  const resized = ctx.getImageData(0, 0, 112, 112);

  // Normalize and convert to NCHW
  const input = new Float32Array(1 * 3 * 112 * 112);
  const pixelData = resized.data;

  for (let i = 0; i < 112 * 112; i++) {
    const r = pixelData[i * 4];
    const g = pixelData[i * 4 + 1];
    const b = pixelData[i * 4 + 2];

    // Normalize: (pixel - 127.5) / 127.5
    input[i] = (r - 127.5) / 127.5; // R channel
    input[112 * 112 + i] = (g - 127.5) / 127.5; // G channel
    input[2 * 112 * 112 + i] = (b - 127.5) / 127.5; // B channel
  }

  return input;
}

/**
 * Extract 512D embedding from face image
 */
export async function extractEmbedding(
  imageData: ImageData
): Promise<Float32Array> {
  const session = await getSession();

  // Preprocess image
  const input = preprocessFace(imageData);

  // Create tensor
  const tensor = new ort.Tensor("float32", input, [1, 3, 112, 112]);

  // Run inference
  const feeds: Record<string, ort.Tensor> = {};
  feeds[session.inputNames[0]] = tensor;

  const results = await session.run(feeds);
  const outputTensor = results[session.outputNames[0]];

  // Extract embedding (512D vector)
  const embedding = outputTensor.data as Float32Array;

  return embedding;
}

/**
 * Compute L2 (Euclidean) distance between two embeddings
 * Lower distance = more similar faces
 */
export function computeDistance(
  embedding1: Float32Array,
  embedding2: Float32Array
): number {
  if (embedding1.length !== embedding2.length) {
    throw new Error("Embeddings must have same dimension");
  }

  let sum = 0;
  for (let i = 0; i < embedding1.length; i++) {
    const diff = embedding1[i] - embedding2[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * Compute cosine similarity between two embeddings
 * Range: [-1, 1], higher = more similar
 */
export function computeSimilarity(
  embedding1: Float32Array,
  embedding2: Float32Array
): number {
  if (embedding1.length !== embedding2.length) {
    throw new Error("Embeddings must have same dimension");
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}
