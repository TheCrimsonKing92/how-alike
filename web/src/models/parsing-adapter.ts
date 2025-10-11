"use client";
// Placeholder parsing adapter: currently delegates to FaceMesh.
// Structure matches DetectorAdapter so we can swap implementations later.
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
import { PARSING_ENABLED, PARSING_INPUT_SIZE, parsingModelUrl, parsingClassConfig } from './parsing-config';
import { maskToOutline } from '@/lib/mask';
import { pickSegOutput, computeFaceCrop } from './parsing-utils';
import type { FaceLandmarksDetectorInput, MediaPipeFaceMeshTfjsEstimationConfig, Face, Keypoint } from '@tensorflow-models/face-landmarks-detection';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';

let detectorPromise: ReturnType<typeof import('@tensorflow-models/face-landmarks-detection').createDetector> | null = null;

function pointInPolygon(pointX: number, pointY: number, polygon: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > pointY !== yj > pointY && pointX < ((xj - xi) * (pointY - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function detectClassForRegion(
  labels: Uint8Array,
  width: number,
  height: number,
  sx: number,
  sy: number,
  scaleX: number,
  scaleY: number,
  polygon: Pt[]
): number {
  if (!polygon.length) return -1;
  const segPoly = polygon.map((p) => ({ x: (p.x - sx) / scaleX, y: (p.y - sy) / scaleY }));
  let minX = segPoly[0].x;
  let maxX = segPoly[0].x;
  let minY = segPoly[0].y;
  let maxY = segPoly[0].y;
  for (const p of segPoly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  minX = Math.max(0, Math.floor(minX));
  maxX = Math.min(width, Math.ceil(maxX));
  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(height, Math.ceil(maxY));
  const counts = new Map<number, number>();
  for (let row = minY; row < maxY; row++) {
    const y = row + 0.5;
    for (let col = minX; col < maxX; col++) {
      const x = col + 0.5;
      if (!pointInPolygon(x, y, segPoly)) continue;
      const id = labels[row * width + col];
      if (id === 0) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  let bestId = -1;
  let bestCount = 0;
  for (const [id, count] of counts.entries()) {
    if (count > bestCount) {
      bestId = id;
      bestCount = count;
    }
  }
  return bestId;
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
  return detectorPromise as Awaited<typeof detectorPromise>;
}

export const parsingAdapter: DetectorAdapter = {
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
    // Use landmark-based extraction as primary method (high precision for fine features)
    const landmarkHints = deriveRegionHints(points as Pt[]);
    if (!image) {
      const arr = landmarkHints as RegionHintsArray;
      arr.__source = 'landmarks';
      return arr;
    }
    const heuristicHints = landmarkHints;
    // Separate import from session/run so we can report a more accurate status
    try {
      // Browser ORT package (literal specifier so bundler resolves it into the worker chunk)
      const ortMod = (await import('onnxruntime-web').catch(() => null)) as unknown;
      if (!ortMod) {
        const fb = heuristicHints as RegionHintsArray;
        fb.__source = 'landmarks';
        fb.__ort = 'missing';
        return fb;
      }
      type MinimalOrtSession = {
        inputNames: string[];
        outputNames: string[];
        run(feeds: Record<string, unknown>): Promise<Record<string, unknown>>;
      };
      type OrtLike = {
        InferenceSession: { create: (url: string, opts?: Record<string, unknown>) => Promise<MinimalOrtSession> };
        Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
        env: { wasm: { wasmPaths?: string | Record<string, string>; [k: string]: unknown } };
      };
      const ort = ortMod as OrtLike;

      // Enable WebGL backend (must be set before session creation)
      if (typeof ort.env.webgl !== 'undefined') {
        const webgl = ort.env.webgl as any;
        // Enable WebGL and set context attributes
        webgl.contextAttributes = { alpha: true, depth: false, stencil: false };
        webgl.pack = true; // Enable texture packing for better performance
      }

      // Ensure ORT knows where to fetch WASM/loader assets when running under Next.js
      // Prefer explicit mapping to cover jsep loader filenames across versions
      if (!ort.env.wasm.wasmPaths) {
        ort.env.wasm.wasmPaths = {
          // JS loader used by some builds
          'ort-wasm-simd-threaded.jsep.mjs': '/ort/ort.wasm.min.mjs',
          // WASM binaries
          'ort-wasm-simd-threaded.wasm': '/ort/ort-wasm-simd-threaded.wasm',
          'ort-wasm-simd-threaded.jsep.wasm': '/ort/ort-wasm-simd-threaded.wasm',
          // Fallback to base for other names
          'ort-wasm.wasm': '/ort/ort-wasm.wasm',
          'ort-wasm-threaded.wasm': '/ort/ort-wasm-threaded.wasm',
          'ort-wasm-simd.wasm': '/ort/ort-wasm-simd.wasm',
        } as Record<string, string>;
      }
      const key = '__parsingSession__';
      const store = globalThis as Record<string, unknown>;
      let session = (store[key] as MinimalOrtSession | undefined) || null;
      if (!session) {
        try {
          // Load model as ArrayBuffer (matches Node.js approach which works)
          // URL-based loading seems to have issues with this specific model in browser WASM
          const modelUrl = parsingModelUrl();
          const response = await fetch(modelUrl);
          if (!response.ok) throw new Error(`Failed to fetch model: ${response.status}`);
          const modelBuffer = await response.arrayBuffer();

          if (process.env.NODE_ENV !== 'production') {
            console.info('[parsing] loaded model buffer:', (modelBuffer.byteLength / (1024 * 1024)).toFixed(2), 'MB');
          }

          // Try WebGL first (better operator support for some models), fallback to WASM
          session = await ort.InferenceSession.create(modelBuffer, {
            executionProviders: ['webgl', 'wasm'],
            graphOptimizationLevel: 'disabled',
            enableCpuMemArena: false,
          });
          if (process.env.NODE_ENV !== 'production') {
            // Check which execution provider was actually used
            const epUsed = (session as any).handler?._sessionOptions?.executionProviders || 'unknown';
            console.info('[parsing] session created with optimizations DISABLED. EP:', epUsed, 'inputNames:', session.inputNames, 'outputNames:', session.outputNames);
          }
          store[key] = session as unknown;
        } catch (e) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[parsing] ORT session create failed', e);
          }
          const fb = heuristicHints as RegionHintsArray;
          fb.__source = 'landmarks';
          fb.__ort = 'error';
          return fb;
        }
      }
      const S = PARSING_INPUT_SIZE || 512;
      const cnv = new OffscreenCanvas(S, S);
      const g = cnv.getContext('2d');
      if (!g) throw new Error('2D not available');
      // Square face-centered crop from landmarks/eyes, with extra space above for brows
      const size = image as { width: number; height: number };
      const iw = size.width;
      const ih = size.height;
      const { sx, sy, sw, sh } = computeFaceCrop(iw, ih, points as Pt[], eyeLeft, eyeRight);
      g.clearRect(0, 0, S, S);
      g.drawImage(image as HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas, sx, sy, sw, sh, 0, 0, S, S);
      const rgba = g.getImageData(0, 0, S, S).data;
      // Prepare input according to layout, channel order, and normalization
      type Layout = 'NCHW' | 'NHWC';
      type Order = 'RGB' | 'BGR';
      type Norm = 'imagenet' | 'caffe' | 'minusHalf';
      function prepTensor(layout: Layout, order: Order, norm: Norm) {
        const ci = order === 'RGB' ? [0, 1, 2] : [2, 1, 0];
        if (layout === 'NCHW') {
          const data = new Float32Array(1 * 3 * S * S);
          for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
              const idx = (y * S + x) * 4;
              let r = rgba[idx] / 255, gch = rgba[idx + 1] / 255, b = rgba[idx + 2] / 255;
              if (norm === 'caffe') { r *= 255; gch *= 255; b *= 255; }
              const pix = [r, gch, b];
              const iBase = y * S + x;
              if (norm === 'imagenet') {
                const mean = [0.485, 0.456, 0.406];
                const std = [0.229, 0.224, 0.225];
                data[0 * S * S + iBase] = (pix[ci[0]] - mean[0]) / std[0];
                data[1 * S * S + iBase] = (pix[ci[1]] - mean[1]) / std[1];
                data[2 * S * S + iBase] = (pix[ci[2]] - mean[2]) / std[2];
              } else if (norm === 'minusHalf') {
                data[0 * S * S + iBase] = (pix[ci[0]] - 0.5) / 0.5;
                data[1 * S * S + iBase] = (pix[ci[1]] - 0.5) / 0.5;
                data[2 * S * S + iBase] = (pix[ci[2]] - 0.5) / 0.5;
              } else {
                // caffe-style means in BGR order (actual order handled by ci)
                const caffeMean = [104.006989, 116.66877, 122.67892];
                data[0 * S * S + iBase] = pix[ci[0]] - caffeMean[0];
                data[1 * S * S + iBase] = pix[ci[1]] - caffeMean[1];
                data[2 * S * S + iBase] = pix[ci[2]] - caffeMean[2];
              }
            }
          }
          return new ort.Tensor('float32', data, [1, 3, S, S]);
        } else {
          const data = new Float32Array(1 * S * S * 3);
          for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
              const idx = (y * S + x) * 4;
              let r = rgba[idx] / 255, gch = rgba[idx + 1] / 255, b = rgba[idx + 2] / 255;
              if (norm === 'caffe') { r *= 255; gch *= 255; b *= 255; }
              const pix = [r, gch, b];
              const base = (y * S + x) * 3;
              if (norm === 'imagenet') {
                const mean = [0.485, 0.456, 0.406];
                const std = [0.229, 0.224, 0.225];
                data[base + 0] = (pix[ci[0]] - mean[0]) / std[0];
                data[base + 1] = (pix[ci[1]] - mean[1]) / std[1];
                data[base + 2] = (pix[ci[2]] - mean[2]) / std[2];
              } else if (norm === 'minusHalf') {
                data[base + 0] = (pix[ci[0]] - 0.5) / 0.5;
                data[base + 1] = (pix[ci[1]] - 0.5) / 0.5;
                data[base + 2] = (pix[ci[2]] - 0.5) / 0.5;
              } else {
                const caffeMean = [104.006989, 116.66877, 122.67892];
                data[base + 0] = pix[ci[0]] - caffeMean[0];
                data[base + 1] = pix[ci[1]] - caffeMean[1];
                data[base + 2] = pix[ci[2]] - caffeMean[2];
              }
            }
          }
          return new ort.Tensor('float32', data, [1, S, S, 3]);
        }
      }
      const inputName = session.inputNames[0];
      // Determine preferred layout from input metadata when available
      let layout: Layout = 'NCHW';
      type InputMeta = { dimensions?: number[] };
      type SessionWithMeta = MinimalOrtSession & { inputMetadata?: Record<string, InputMeta> };
      const meta = (session as SessionWithMeta).inputMetadata?.[inputName];
      const dimsIn = meta?.dimensions || undefined;
      if (Array.isArray(dimsIn) && dimsIn.length === 4) {
        if (dimsIn[1] === 3) layout = 'NCHW';
        if (dimsIn[3] === 3) layout = 'NHWC';
      } else {
        // Default to NHWC for web exports
        layout = 'NHWC';
      }
      async function tryRun(layoutTry: Layout, order: Order, norm: Norm) {
        const tensor = prepTensor(layoutTry, order, norm);
        return session!.run({ [inputName]: tensor });
      }
      // Try multiple preprocessing combinations and pick the best one based on output quality
      const attempts: Array<[Layout, Order, Norm]> = [];
      const layoutsToTry: Layout[] = [layout, layout === 'NHWC' ? 'NCHW' : 'NHWC'];
      for (const L of layoutsToTry) {
        attempts.push([L, 'RGB', 'imagenet']);
        attempts.push([L, 'BGR', 'imagenet']);
        attempts.push([L, 'BGR', 'caffe']);
        attempts.push([L, 'RGB', 'minusHalf']);
      }
      type AttemptResult = { labels: Uint8Array; H: number; W: number; K: number; nhwc: boolean; params: [Layout, Order, Norm] };
      let best: AttemptResult | null = null;
      let bestScore = -1;
      for (const p of attempts) {
        const [L, O, N] = p;
        let out: Record<string, unknown> | null = null;
        try {
          out = await tryRun(L, O, N);
          if (process.env.NODE_ENV !== 'production') console.info('[parsing] run ok with', L, O, N);
        } catch {
          if (process.env.NODE_ENV !== 'production') console.warn('[parsing] run failed with', L, O, N);
          continue;
        }
        // Log which outputs are available
        if (process.env.NODE_ENV !== 'production' && p[0] === 'NCHW') {
          const outputNames = Object.keys(out);
          console.info('[parsing] model returned', outputNames.length, 'outputs:', outputNames.join(', '));

          // Check which output pickSegOutput will choose
          const chosenName = 'output' in out ? 'output' : outputNames[0];
          console.info('[parsing] using output named:', chosenName);
        }

        const chosenLite = pickSegOutput(out, S);
        if (!chosenLite) {
          if (process.env.NODE_ENV !== 'production') console.warn('[parsing] no suitable segmentation output tensor');
          continue;
        }
        const dims: number[] = chosenLite.dims;
        const logits: Float32Array = chosenLite.data;
        if (process.env.NODE_ENV !== 'production') {
          console.info('[parsing] output dims=', dims, 'data length=', logits.length);
          // Sample first pixel logits
          const samplePixel = dims.length === 4 && dims[1] === 19 && dims[2] === S && dims[3] === S
            ? Array.from(logits.slice(0, 19))
            : Array.from(logits.slice(0, Math.min(20, logits.length)));
          console.info('[parsing] sample logits (first pixel):', samplePixel.map(v => v.toFixed(2)).join(', '));
        }
        let H = 0, W = 0, K = 0; let nhwc = false;
        if (dims.length === 4) {
          const [_, d1, d2, d3] = dims;
          if (d1 === S && d2 === S) { H = d1; W = d2; K = d3; nhwc = true; }
          else if (d2 === S && d3 === S) { K = d1; H = d2; W = d3; nhwc = false; }
          else { continue; }
        } else if (dims.length === 3) {
          const [d0, d1, d2] = dims; H = d0; W = d1; K = d2; nhwc = true;
        } else { continue; }
        const labels = new Uint8Array(H * W);
        if (nhwc) {
          for (let i = 0; i < H * W; i++) {
            let bestC = 0, bestVal = -1e9; const base = i * K;
            for (let c = 0; c < K; c++) { const v = logits[base + c]; if (v > bestVal) { bestVal = v; bestC = c; } }
            labels[i] = bestC;
          }
        } else {
          for (let i = 0; i < H * W; i++) {
            let bestC = 0, bestVal = -1e9;
            for (let c = 0; c < K; c++) { const v = logits[c * H * W + i]; if (v > bestVal) { bestVal = v; bestC = c; } }
            labels[i] = bestC;
          }
        }
        let nonBg = 0; const seen = new Set<number>();
        for (let i = 0; i < labels.length; i++) { const v = labels[i]; if (v !== 0) nonBg++; seen.add(v); }
        const frac = nonBg / (labels.length || 1);
        const score = frac + Math.min(seen.size, 10) * 1e-3;
        if (score > bestScore) { bestScore = score; best = { labels, H, W, K, nhwc, params: p }; }
      }
      if (!best) {
        if (process.env.NODE_ENV !== 'production') console.warn('[parsing] ORT session run failed all attempts');
        const fb = heuristicHints as RegionHintsArray;
        fb.__source = 'landmarks';
        fb.__ort = 'error';
        return fb;
      }
      if (process.env.NODE_ENV !== 'production') {
        console.info('[parsing] chose attempt', best.params.join(' '), 'score=', bestScore.toFixed(3));
      }
      const labels = best.labels;
      const segWidth = best.W;
      const segHeight = best.H;
      const classCfg = parsingClassConfig();
      const browAllowed = new Set(classCfg.browSet);
      const noseAllowed = new Set(classCfg.noseSet);
      const includeMask = process.env.NODE_ENV !== 'production';
      let debugMask: RegionMaskDebug | undefined;
      if (includeMask) {
        debugMask = {
          width: segWidth,
          height: segHeight,
          labels: labels.slice(),
          crop: { sx, sy, sw, sh },
        };
      }
      if (process.env.NODE_ENV !== 'production') {
        const hist = new Map<number, number>();
        for (let i = 0; i < labels.length; i++) hist.set(labels[i], (hist.get(labels[i]) || 0) + 1);
        const top = Array.from(hist.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
        console.info('[parsing] present classes (top):', top.map(([k, v]) => `${k}:${v}`).join(', '));
        const browCounts = classCfg.browSet.map((id) => ({ id, count: hist.get(id) ?? 0 }));
        const noseCounts = classCfg.noseSet.map((id) => ({ id, count: hist.get(id) ?? 0 }));
        console.info('[parsing] browCounts=%o noseCounts=%o', browCounts, noseCounts);
      }
      const scaleX = sw / Math.max(1, segWidth);
      const scaleY = sh / Math.max(1, segHeight);
      const replacements: RegionHint[] = [];
      const replacedIndices = new Set<number>();
      const ipdPx =
        eyeLeft && eyeRight
          ? Math.hypot(eyeRight.x - eyeLeft.x, eyeRight.y - eyeLeft.y) || 1
          : 1;

      const outlineForRegion = (classId: number, region: string, polygon: Pt[]): boolean => {
        if (classId <= 0 || !polygon.length) return false;
        const segPoly = polygon.map((p) => ({ x: (p.x - sx) / scaleX, y: (p.y - sy) / scaleY }));
        const clamp = (val: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, val));
        let samplePoly = segPoly;
        if (region === 'nose' && segPoly.length >= 3) {
          let cx = 0;
          let cy = 0;
          for (const p of segPoly) {
            cx += p.x;
            cy += p.y;
          }
          cx /= segPoly.length;
          cy /= segPoly.length;
          const inflateX = 0.55;
          const inflateY = 0.45;
          samplePoly = segPoly.map((p) => ({
            x: clamp(cx + (p.x - cx) * (1 + inflateX), 0, segWidth),
            y: clamp(cy + (p.y - cy) * (1 + inflateY), 0, segHeight),
          }));
        }
        let minX = samplePoly[0].x;
        let maxX = samplePoly[0].x;
        let minY = samplePoly[0].y;
        let maxY = samplePoly[0].y;
        for (const p of samplePoly) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
        minX = Math.max(0, Math.floor(minX));
        maxX = Math.min(segWidth, Math.ceil(maxX));
        minY = Math.max(0, Math.floor(minY));
        maxY = Math.min(segHeight, Math.ceil(maxY));
        type RowStat = { minX: number; maxX: number; sumX: number; count: number };
        const mask = new Uint8Array(segWidth * segHeight);
        const rowStats = new Array<RowStat | undefined>(segHeight);
        let hasPixels = false;
        const height = Math.max(1, maxY - minY);
        const browCut = minY + height * 0.55;
        const noseTop = minY + height * 0.1;
        const noseBottom = minY + height * 0.9;
        let segMinX = Number.POSITIVE_INFINITY;
        let segMaxX = Number.NEGATIVE_INFINITY;
        let segMinY = Number.POSITIVE_INFINITY;
        let segMaxY = Number.NEGATIVE_INFINITY;
        let maskPixels = 0;
        let polyPixels = 0;
        for (let row = minY; row < maxY; row++) {
          const segY = row + 0.5;
          if (region === 'brows' && segY > browCut) continue;
          if (region === 'nose' && (segY < noseTop || segY > noseBottom)) continue;
          for (let col = minX; col < maxX; col++) {
            const segX = col + 0.5;
            if (!pointInPolygon(segX, segY, samplePoly)) continue;
            polyPixels += 1;
            const idx = row * segWidth + col;
            if (labels[idx] === classId) {
              mask[idx] = 1;
              hasPixels = true;
              if (segX < segMinX) segMinX = segX;
              if (segX > segMaxX) segMaxX = segX;
              if (segY < segMinY) segMinY = segY;
              if (segY > segMaxY) segMaxY = segY;
              maskPixels += 1;
              let stat = rowStats[row];
              if (!stat) {
                stat = { minX: segX, maxX: segX, sumX: segX, count: 1 };
                rowStats[row] = stat;
              } else {
                if (segX < stat.minX) stat.minX = segX;
                if (segX > stat.maxX) stat.maxX = segX;
                stat.sumX += segX;
                stat.count += 1;
              }
            }
          }
        }
        if (!hasPixels) return false;
        const outline = maskToOutline(mask, segWidth, segHeight, 2.0).map((p) => ({ x: sx + p.x * scaleX, y: sy + p.y * scaleY }));
        if (region === 'brows' || region === 'nose') {
          if (!Number.isFinite(segMinX) || !Number.isFinite(segMaxX) || !Number.isFinite(segMinY) || !Number.isFinite(segMaxY)) return false;
          const segWidthPx = Math.max(1e-3, (segMaxX - segMinX) * scaleX);
          const segHeightPx = Math.max(1e-3, (segMaxY - segMinY) * scaleY);
          let hintMinX = polygon[0].x;
          let hintMaxX = polygon[0].x;
          let hintMinY = polygon[0].y;
          let hintMaxY = polygon[0].y;
          for (const p of polygon) {
            if (p.x < hintMinX) hintMinX = p.x;
            if (p.x > hintMaxX) hintMaxX = p.x;
            if (p.y < hintMinY) hintMinY = p.y;
            if (p.y > hintMaxY) hintMaxY = p.y;
          }
          const hintWidth = Math.max(1e-3, hintMaxX - hintMinX);
          const hintHeight = Math.max(1e-3, hintMaxY - hintMinY);
          const heurWidthPx = hintWidth;
          const heurHeightPx = hintHeight;
          if (region === 'brows') {
            const top = sy + segMinY * scaleY;
            const bottom = sy + segMaxY * scaleY;
            const leftX = sx + segMinX * scaleX;
            const rightX = sx + segMaxX * scaleX;
            const mapped = polygon.map((p, idx) => {
              const t = (p.y - hintMinY) / hintHeight;
              const y = top + t * (bottom - top);
              const halfWidth = (rightX - leftX) / 2;
              const centerX = (leftX + rightX) / 2;
              const skew = Math.tan((idx === 0 ? -0.3 : idx === polygon.length - 1 ? 0.3 : 0)) * (bottom - y);
              const side = p.x < (hintMinX + hintMaxX) / 2 ? -1 : 1;
              const x = centerX + side * halfWidth * (1 - t * 0.5) + skew;
              return { x, y };
            });
            replacements.push({ region, points: mapped, open: true });
            return true;
          }
          if (region === 'nose') {
            const clampX = (x: number) => Math.max(hintMinX - ipdPx * 0.1, Math.min(hintMaxX + ipdPx * 0.1, x));
            const clampY = (y: number) =>
              Math.max(hintMinY - ipdPx * 0.1, Math.min(hintMaxY + ipdPx * 0.1, y));
            const pushHeuristic = () => {
              const centerX = (hintMinX + hintMaxX) / 2;
              const topY = hintMinY;
              const bottomY = hintMaxY;
              const width = Math.max(heurWidthPx, ipdPx * 0.32);
              const height = Math.max(heurHeightPx, ipdPx * 0.35);
              const half = width / 2;
              const shoulderY = topY + height * 0.2;
              const midY = topY + height * 0.55;
              const baseY = bottomY + Math.min(height * 0.1, ipdPx * 0.04);
              const tipY = baseY + Math.min(height * 0.05, ipdPx * 0.02);
              const pts = [
                { x: clampX(centerX), y: clampY(topY - Math.min(height * 0.2, ipdPx * 0.06)) },
                { x: clampX(centerX - half * 0.6), y: clampY(shoulderY) },
                { x: clampX(centerX - half), y: clampY(midY) },
                { x: clampX(centerX - half * 0.35), y: clampY(baseY) },
                { x: clampX(centerX), y: clampY(tipY) },
                { x: clampX(centerX + half * 0.35), y: clampY(baseY) },
                { x: clampX(centerX + half), y: clampY(midY) },
                { x: clampX(centerX + half * 0.6), y: clampY(shoulderY) },
              ];
              replacements.push({ region, points: pts, open: false });
              return true;
            };
            const rowsWithMask: Array<RowStat & { row: number }> = [];
            for (let r = 0; r < rowStats.length; r++) {
              const stat = rowStats[r];
              if (stat && stat.count > 0) {
                rowsWithMask.push({ ...stat, row: r });
              }
            }
            const rowCount = rowsWithMask.length;
            if (process.env.NODE_ENV !== 'production') {
              console.info('[parsing] nose rowCount=', rowCount, 'maskPixels=', maskPixels, 'polyPixels=', polyPixels);
            }
            if (rowCount < 4) {
              if (process.env.NODE_ENV !== 'production') {
                console.warn('[parsing] nose fallback: rowCount < 4');
              }
              return pushHeuristic();
            }
            const coverage = maskPixels / Math.max(polyPixels, 1);
            const usingAlias = classId !== classCfg.nosePrimary;
            const requiredCoverage = usingAlias ? 0.65 : 0.18;
            if (process.env.NODE_ENV !== 'production') {
              console.info('[parsing] nose coverage=', coverage.toFixed(3), 'required=', requiredCoverage, 'usingAlias=', usingAlias, 'classId=', classId, 'nosePrimary=', classCfg.nosePrimary);
            }
            if (coverage < requiredCoverage) {
              if (process.env.NODE_ENV !== 'production') {
                console.warn('[parsing] nose fallback: coverage too low');
              }
              return pushHeuristic();
            }
            if (usingAlias) {
              const segMaskHeight = Math.max(
                1e-3,
                (rowsWithMask[rowCount - 1].row - rowsWithMask[0].row + 1) * scaleY
              );
              if (process.env.NODE_ENV !== 'production') {
                console.info('[parsing] nose alias check: segMaskHeight=', segMaskHeight.toFixed(1), 'heurHeightPx=', heurHeightPx.toFixed(1), 'limit=', (heurHeightPx * 1.25).toFixed(1));
              }
              if (segMaskHeight > heurHeightPx * 1.25) {
                if (process.env.NODE_ENV !== 'production') {
                  console.warn('[parsing] nose fallback: alias mask too tall');
                }
                return pushHeuristic();
              }
            }
            if (debugMask) {
              for (let idx = 0; idx < mask.length; idx++) {
                if (labels[idx] === classId && mask[idx] === 0) {
                  debugMask.labels[idx] = 0;
                }
              }
            }
            rowsWithMask.forEach((row, index) => {
              const width = row.maxX - row.minX;
              if (!Number.isFinite(width) || width <= 0) return;
              const rel = rowCount > 1 ? index / (rowCount - 1) : 0;
              const padBase = Math.max(width * 0.4, 1.4);
              const pad = padBase * (0.9 - 0.35 * rel);
              row.minX = Math.max(0, row.minX - pad);
              row.maxX = Math.min(segWidth, row.maxX + pad);
            });
            const avgPoint = (slice: Array<RowStat & { row: number }>) => {
              if (!slice.length) return { x: segMinX, y: segMinY };
              let sumX = 0;
              let sumY = 0;
              let total = 0;
              for (const s of slice) {
                sumX += s.sumX;
                sumY += (s.row + 0.5) * s.count;
                total += s.count;
              }
              if (total === 0) {
                const s = slice[0];
                return { x: (s.minX + s.maxX) / 2, y: s.row + 0.5 };
              }
              return { x: sumX / total, y: sumY / total };
            };
            const toImage = (pt: { x: number; y: number }) => ({
              x: sx + pt.x * scaleX,
              y: sy + pt.y * scaleY,
            });
            const quantileRow = (t: number) => {
              const clamped = Math.max(0, Math.min(1, t));
              const idx = Math.round(clamped * (rowCount - 1));
              return rowsWithMask[idx];
            };
            const sliceFor = (fraction: number) => {
              const span = Math.max(1, Math.round(rowCount * fraction));
              return span;
            };
            const topSlice = sliceFor(0.28);
            const bottomSlice = sliceFor(0.32);
            const topSeg = avgPoint(rowsWithMask.slice(0, Math.min(topSlice, rowCount)));
            const tipSeg = avgPoint(rowsWithMask.slice(Math.max(0, rowCount - bottomSlice)));
            if (!Number.isFinite(topSeg.x) || !Number.isFinite(tipSeg.x)) {
              return pushHeuristic();
            }
            const heightSeg = tipSeg.y - topSeg.y;
            if (!Number.isFinite(heightSeg) || heightSeg < 1) {
              return pushHeuristic();
            }
            const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
            const sidePoint = (row: RowStat & { row: number }, bias: number) => {
              const width = row.maxX - row.minX;
              if (!Number.isFinite(width) || width <= 0) {
                return null;
              }
              const clamped = Math.max(0, Math.min(1, bias));
              return {
                x: lerp(row.minX, row.maxX, clamped),
                y: row.row + 0.5,
              };
            };
            const topRow = quantileRow(0.12);
            const upperRow = quantileRow(0.32);
            const midRow = quantileRow(0.58);
            const lowerRow = quantileRow(0.9);
            const leftTop = sidePoint(topRow, 0.25);
            const rightTop = sidePoint(topRow, 0.75);
            const leftUpper = sidePoint(upperRow, 0.22);
            const leftMid = sidePoint(midRow, 0.16);
            const leftLower = sidePoint(lowerRow, 0.08);
            const rightLower = sidePoint(lowerRow, 0.92);
            const rightMid = sidePoint(midRow, 0.84);
            const rightUpper = sidePoint(upperRow, 0.78);
            if (!leftTop || !rightTop || !leftUpper || !leftMid || !leftLower || !rightLower || !rightMid || !rightUpper) {
              return pushHeuristic();
            }
            const shape = [
              toImage(leftTop),
              toImage(leftUpper),
              toImage(leftMid),
              toImage(leftLower),
              toImage(tipSeg),
              toImage(rightLower),
              toImage(rightMid),
              toImage(rightUpper),
              toImage(rightTop),
              toImage(topSeg),
            ];
            const shapeBounds = shape.reduce(
              (acc, p) => ({
                minX: Math.min(acc.minX, p.x),
                maxX: Math.max(acc.maxX, p.x),
                minY: Math.min(acc.minY, p.y),
                maxY: Math.max(acc.maxY, p.y),
              }),
              { minX: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY }
            );
            const shapeWidth = shapeBounds.maxX - shapeBounds.minX;
            const shapeHeight = shapeBounds.maxY - shapeBounds.minY;
            const centerX = (shapeBounds.minX + shapeBounds.maxX) / 2;
            const centerY = (shapeBounds.minY + shapeBounds.maxY) / 2;
            const targetWidth = Math.max(heurWidthPx, ipdPx * 0.35);
            const targetHeight = Math.max(heurHeightPx, ipdPx * 0.35);
            const widthScale = shapeWidth > 1e-3 ? Math.max(1, targetWidth / shapeWidth) : 1;
            const heightScale = shapeHeight > 1e-3 ? Math.max(1, targetHeight / shapeHeight) : 1;
            if (widthScale > 1 || heightScale > 1) {
              shape.forEach((pt, idx) => {
                const scaledX = centerX + (pt.x - centerX) * widthScale;
                const scaledY = centerY + (pt.y - centerY) * heightScale;
                shape[idx] = {
                  x: Math.max(hintMinX - ipdPx * 0.08, Math.min(hintMaxX + ipdPx * 0.08, scaledX)),
                  y: Math.max(hintMinY - ipdPx * 0.05, Math.min(hintMaxY + ipdPx * 0.05, scaledY)),
                };
              });
            }
            const noseWidth = Math.max(
              Math.abs(shape[5].x - shape[3].x),
              Math.abs(shape[6].x - shape[2].x),
              Math.abs(shape[7].x - shape[1].x)
            );
            if (!Number.isFinite(noseWidth) || noseWidth < 2 * Math.max(scaleX, scaleY)) {
              if (process.env.NODE_ENV !== 'production') {
                console.warn('[parsing] nose fallback: noseWidth too small');
              }
              return pushHeuristic();
            }
            if (process.env.NODE_ENV !== 'production') {
              console.info('[parsing] nose SUCCESS: using ONNX-based outline with', shape.length, 'points');
            }
            replacements.push({ region, points: shape, open: false });
            return true;
          }
          const mapped = polygon.map((p) => ({
            x: sx + segMinX * scaleX + ((p.x - hintMinX) / hintWidth) * segWidthPx,
            y: sy + segMinY * scaleY + ((p.y - hintMinY) / hintHeight) * segHeightPx,
          }));
          replacements.push({ region, points: mapped, open: true });
          return true;
        }
        if (outline.length < 2) return false;
        replacements.push({ region, points: outline, open: true });
        return true;
      };

      let browCounter = 0;
      let noseReplaced = false;
      heuristicHints.forEach((hint, index) => {
        if (hint.region === 'brows') {
          const fallback = browCounter === 0 ? classCfg.browLeft : classCfg.browRight;
          browCounter += 1;
          const detected = detectClassForRegion(labels, segWidth, segHeight, sx, sy, scaleX, scaleY, hint.points);
          const id = browAllowed.has(detected) ? detected : fallback;
          if (process.env.NODE_ENV !== 'production') {
            console.info('[parsing] brow hint', index, 'detected=', detected, 'using', id);
          }
          if (outlineForRegion(id, 'brows', hint.points)) {
            replacedIndices.add(index);
          }
        } else if (hint.region === 'nose') {
          // Keep landmark-based nose (better centering and tip anatomy)
          // ONNX segmentation doesn't capture nose tip extension below nostrils
          if (process.env.NODE_ENV !== 'production') {
            console.info('[parsing] nose: using landmark-based outline (better tip anatomy)');
          }
        }
      });

      if (replacements.length) {
        const merged: RegionHint[] = [];
        heuristicHints.forEach((hint, index) => {
          if (!replacedIndices.has(index)) {
            merged.push(hint);
          }
        });
        merged.push(...replacements);
        const arr = merged as RegionHintsArray;
        arr.__source = 'onnx';
        arr.__ort = 'ok';
        if (debugMask) {
          arr.__mask = debugMask;
        }
        return arr;
      }

      // Return landmark-based hints when ONNX segmentation doesn't produce better results
      const fb = heuristicHints as RegionHintsArray;
      fb.__source = 'landmarks';
      fb.__ort = 'ok';
      if (debugMask) {
        fb.__mask = debugMask;
      }
      return fb;
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[parsing] Unexpected error in hintsFrom', e);
      }
      const fb = heuristicHints as RegionHintsArray;
      fb.__source = 'landmarks';
      fb.__ort = 'error';
      return fb;
    }
  },
};
