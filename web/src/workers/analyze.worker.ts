/// <reference lib="webworker" />
import { getDetector } from '@/models/facemesh-adapter';
import { fromKeypoints, eyeCenterFromIndices, normalizeByEyes, summarizeRegionsProcrustes } from '@/lib/geometry';
import { REGION_INDICES, LEFT_EYE_CENTER_INDICES, RIGHT_EYE_CENTER_INDICES } from '@/lib/regions';
import type { AnalyzeMessage, AnalyzeResponse } from './types';
import type { FaceLandmarksDetectorInput, MediaPipeFaceMeshTfjsEstimationConfig } from '@tensorflow-models/face-landmarks-detection';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

function post(msg: AnalyzeResponse) {
  ctx.postMessage(msg);
}

async function preprocessBitmap(bmp: ImageBitmap, maxDim = 1280) {
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D context not available');
  g.drawImage(bmp, 0, 0, w, h);
  return canvas;
}

ctx.onmessage = async (ev: MessageEvent<AnalyzeMessage>) => {
  const data = ev.data;
  try {
    if (data.type === 'INIT') {
      await getDetector();
      return;
    }
    if (data.type === 'ANALYZE') {
      const { fileA, fileB, maxDim = 1280 } = data.payload;
      post({ type: 'PROGRESS', stage: 'load' });
      const [bmpA, bmpB] = await Promise.all([
        createImageBitmap(fileA),
        createImageBitmap(fileB),
      ]);
      post({ type: 'PROGRESS', stage: 'preprocess' });
      const [cnvA, cnvB] = await Promise.all([
        preprocessBitmap(bmpA, maxDim),
        preprocessBitmap(bmpB, maxDim),
      ]);

      const detector = await getDetector();
      post({ type: 'PROGRESS', stage: 'detectA' });
      const est: MediaPipeFaceMeshTfjsEstimationConfig = { flipHorizontal: false, staticImageMode: true } as MediaPipeFaceMeshTfjsEstimationConfig;
      const facesA = await detector.estimateFaces(cnvA as unknown as FaceLandmarksDetectorInput, est);
      post({ type: 'PROGRESS', stage: 'detectB' });
      const facesB = await detector.estimateFaces(cnvB as unknown as FaceLandmarksDetectorInput, est);

      if (!facesA?.length || !facesB?.length) {
        throw new Error('Could not detect a single face in one or both images.');
      }
      type KP = { x: number; y: number; z?: number };
      type FaceLike = { keypoints?: KP[]; scaledMesh?: Array<[number, number, number?]> };
      const fA = facesA[0] as unknown as FaceLike;
      const fB = facesB[0] as unknown as FaceLike;
      const kpsA: KP[] = fA.keypoints ?? (fA.scaledMesh ?? []).map((p) => ({ x: p[0], y: p[1], z: p[2] }));
      const kpsB: KP[] = fB.keypoints ?? (fB.scaledMesh ?? []).map((p) => ({ x: p[0], y: p[1], z: p[2] }));

      const ptsA = fromKeypoints(kpsA);
      const ptsB = fromKeypoints(kpsB);

      const leftA = eyeCenterFromIndices(ptsA, LEFT_EYE_CENTER_INDICES);
      const rightA = eyeCenterFromIndices(ptsA, RIGHT_EYE_CENTER_INDICES);
      const leftB = eyeCenterFromIndices(ptsB, LEFT_EYE_CENTER_INDICES);
      const rightB = eyeCenterFromIndices(ptsB, RIGHT_EYE_CENTER_INDICES);

      const nA = normalizeByEyes(ptsA, leftA, rightA);
      const nB = normalizeByEyes(ptsB, leftB, rightB);

      post({ type: 'PROGRESS', stage: 'score' });
      const { scores, overall } = summarizeRegionsProcrustes(nA, nB, REGION_INDICES);
      post({ type: 'RESULT', pointsA: nA, pointsB: nB, scores, overall });
      return;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    post({ type: 'ERROR', message: msg });
  }
};

export {};
