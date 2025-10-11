/// <reference lib="webworker" />
import { getDetector, currentAdapterName, regionHints, setAdapter } from '@/models/detector';
import { fromKeypoints, eyeCenterFromIndices, normalizeByEyes, summarizeRegionsProcrustes } from '@/lib/geometry';
import { convexHull, concaveHullKNN, offsetPolygon } from '@/lib/hulls';
import { REGION_INDICES, LEFT_EYE_CENTER_INDICES, RIGHT_EYE_CENTER_INDICES, FEATURE_OUTLINES, LEFT_EYE_RING, RIGHT_EYE_RING, LOWER_FACE_INDICES } from '@/lib/regions';
import { deriveRegionHints } from '@/lib/hints';
import { summarizeRegionsFromMasks } from '@/lib/segmentation-scoring';
import type { RegionPoly, MaskOverlay } from './types';
import type { RegionHintsArray } from '@/models/detector-types';
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

type KP = { x: number; y: number; z?: number };

async function computeOutlinePolys(
  points: { x: number; y: number }[],
  leftEye: { x: number; y: number },
  rightEye: { x: number; y: number },
  kps: KP[],
  sourceImage?: OffscreenCanvas | HTMLCanvasElement | ImageBitmap
): Promise<{ polys: RegionPoly[]; parseMs: number; source?: string; ort?: string; mask?: MaskOverlay }> {
  const polys: RegionPoly[] = [];
  let parseMs = 0;
  let source: string | undefined;
  let ort: string | undefined;
  let mask: MaskOverlay | undefined;
  const mapPts = (idxs: number[]) => idxs.map((i) => points[i]).filter(Boolean) as {x:number;y:number}[];
  const centroid = (pts: {x:number;y:number}[]) => {
    const n = pts.length || 1;
    let sx = 0, sy = 0;
    for (const p of pts) { sx += p.x; sy += p.y; }
    return { x: sx / n, y: sy / n };
  };
  const translate = (pts: {x:number;y:number}[], dx: number, dy: number) => pts.map(p => ({ x: p.x + dx, y: p.y + dy }));
  const scaleAbout = (pts: {x:number;y:number}[], c: {x:number;y:number}, s: number) => pts.map(p => ({ x: c.x + (p.x - c.x) * s, y: c.y + (p.y - c.y) * s }));
  const ipd = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y) || 1;
  const chin = points[152] ?? centroid(mapPts(FEATURE_OUTLINES.jaw?.[0] ?? []));

  // Helper: pick the longest contiguous subset of ring points above the eye center (upper lid arc)
  const upperArc = (ring: number[], center: {x:number;y:number}) => {
    const seq: number[] = [];
    // collect indices whose point is above the center (smaller y) with a small tolerance
    const tol = 0.03 * ipd;
    const flags = ring.map(i => (points[i]?.y ?? Infinity) < center.y + tol);
    // find longest contiguous run of true
    let best: {start:number; len:number} = { start: 0, len: 0 };
    let i = 0;
    while (i < ring.length) {
      while (i < ring.length && !flags[i]) i++;
      const start = i;
      while (i < ring.length && flags[i]) i++;
      const len = i - start;
      if (len > best.len) best = { start, len };
    }
    for (let k = 0; k < best.len; k++) seq.push(ring[best.start + k]);
    // ensure at least 6 points by padding neighbors if needed
    while (seq.length < 6 && seq.length < ring.length) {
      const leftIdx = (best.start - 1 + ring.length) % ring.length;
      const rightIdx = (best.start + best.len) % ring.length;
      if (!seq.includes(ring[leftIdx])) seq.unshift(ring[leftIdx]);
      if (seq.length < 4 && !seq.includes(ring[rightIdx])) seq.push(ring[rightIdx]);
    }
    return seq.map(i => points[i]).filter(Boolean) as {x:number;y:number}[];
  };

  // Derive brows from upper-lid arcs by offsetting outward from the eye center
  const leftUpper = upperArc(LEFT_EYE_RING, leftEye);
  const rightUpper = upperArc(RIGHT_EYE_RING, rightEye);
  const liftBrow = (pts: {x:number;y:number}[], eye: {x:number;y:number}) => {
    if (!pts.length) return pts;
    // measure typical eye→lid distance
    const sep = pts.reduce((acc, p) => acc + Math.hypot(p.x - eye.x, p.y - eye.y), 0) / pts.length;
    const lift = Math.min(0.05 * ipd, 0.55 * sep);
    return pts.map(p => {
      const vx = p.x - eye.x, vy = p.y - eye.y; const vl = Math.hypot(vx, vy) || 1;
      return { x: p.x + (vx / vl) * lift, y: p.y + (vy / vl) * lift };
    });
  };
  // Trim tails to central 80% and taper lift toward ends
  const trimAndTaper = (pts: {x:number;y:number}[], eye: {x:number;y:number}) => {
    if (pts.length < 4) return pts;
    const lens: number[] = [0];
    for (let i = 1; i < pts.length; i++) lens[i] = lens[i-1] + Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
    const total = lens[lens.length - 1] || 1;
    const startL = total * 0.15;
    const endL = total * 0.85;
    const out: {x:number;y:number}[] = [];
    for (let i = 0; i < pts.length; i++) {
      const L = lens[i];
      if (L < startL || L > endL) continue;
      const t = (L - startL) / (endL - startL); // 0..1 along trimmed arc
      const base = [pts[i].x, pts[i].y];
      const vx = base[0] - eye.x, vy = base[1] - eye.y; const vl = Math.hypot(vx, vy) || 1;
      const sep = Math.hypot(vx, vy);
      const lift = Math.min(0.05 * ipd, 0.55 * sep);
      const taper = 0.6 + 0.4 * (1 - Math.abs(2 * t - 1)); // 0.6 at ends, 1.0 center
      out.push({ x: base[0] + (vx / vl) * lift * taper, y: base[1] + (vy / vl) * lift * taper });
    }
    return out;
  };
  // Prefer static brow contours; fallback to derived arc
  const keepCentral = (pts: {x:number;y:number}[], frac = 0.85) => {
    if (pts.length < 4) return pts;
    const lens: number[] = [0];
    for (let i = 1; i < pts.length; i++) lens[i] = lens[i-1] + Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
    const total = lens[lens.length - 1] || 1;
    const pad = ((1 - frac) / 2) * total;
    const startL = pad;
    const endL = total - pad;
    const out: {x:number;y:number}[] = [];
    for (let i = 0; i < pts.length; i++) {
      const L = lens[i];
      if (L < startL || L > endL) continue;
      out.push(pts[i]);
    }
    return out.length >= 2 ? out : pts;
  };
  let browsLeft = FEATURE_OUTLINES.brows?.[0] ? keepCentral(mapPts(FEATURE_OUTLINES.brows[0]), 0.85) : [];
  let browsRight = FEATURE_OUTLINES.brows?.[1] ? keepCentral(mapPts(FEATURE_OUTLINES.brows[1]), 0.85) : [];
  if (browsLeft.length < 2) browsLeft = trimAndTaper(leftUpper, leftEye);
  if (browsRight.length < 2) browsRight = trimAndTaper(rightUpper, rightEye);
  if (browsLeft.length >= 2) polys.push({ region: 'brows', points: browsLeft, open: true });
  if (browsRight.length >= 2) polys.push({ region: 'brows', points: browsRight, open: true });
  for (const [region, lists] of Object.entries(FEATURE_OUTLINES)) {
    if (region === 'brows') continue; // handled from upper lids
    for (const seq of lists) {
      const pts = mapPts(seq);
      if (pts.length >= 2) {
        let out = pts;
        polys.push({ region, points: out, open: region === 'brows' || region === 'jaw' || region === 'nose' });
      }
    }
  }

  // Jaw via concave hull of lower-face points; extract bottom chain and draw open
  try {
    const lf = LOWER_FACE_INDICES.map(i => points[i]).filter(Boolean) as {x:number;y:number}[];
    if (lf.length >= 4) {
      const hull = concaveHullKNN(lf, Math.max(4, Math.round(Math.sqrt(lf.length))));
      if (hull.length >= 4) {
        // Determine eye midpoint and a y-threshold below eyes to filter bottom chain
        const midEyeY = (leftEye.y + rightEye.y) / 2;
        const thr = midEyeY + 0.15 * ipd;
        // Find longest contiguous run of hull vertices with y >= thr (bottom chain)
        const flags = hull.map(p => p.y >= thr);
        let best = { start: 0, len: 0 };
        let i = 0;
        while (i < flags.length) {
          while (i < flags.length && !flags[i]) i++;
          const s = i;
          while (i < flags.length && flags[i]) i++;
          const L = i - s;
          if (L > best.len) best = { start: s, len: L };
        }
        const chain: {x:number;y:number}[] = [];
        for (let k = 0; k < best.len; k++) chain.push(hull[(best.start + k) % hull.length]);
        if (chain.length >= 3) {
          // Replace any previous jaw entries
          for (let j = polys.length - 1; j >= 0; j--) if (polys[j].region === 'jaw') polys.splice(j, 1);
          polys.push({ region: 'jaw', points: chain, open: true });
        }
      }
    }
  } catch {}

  // Nose: use stable static alar arc and a short bridge segment
  try {
    const tip = points[2];
    const alar = FEATURE_OUTLINES.nose?.[0] ? FEATURE_OUTLINES.nose[0].map(i => points[i]).filter(Boolean) as {x:number;y:number}[] : [];
    if (alar.length >= 5) {
      const cut = Math.max(0, Math.floor(alar.length * 0.08));
      const trimmed = alar.slice(cut, alar.length - cut);
      polys.push({ region: 'nose', points: trimmed, open: true });
    }
    const bridge = [6, 2].map(i => points[i]).filter(Boolean) as {x:number;y:number}[];
    if (bridge.length >= 2) polys.push({ region: 'nose', points: bridge, open: true });
  } catch {}

  // Override brows/nose with adapter-provided hints (segmentation or landmark-derived)
  try {
    for (let i = polys.length - 1; i >= 0; i--) {
      if (polys[i].region === 'brows' || polys[i].region === 'nose') polys.splice(i, 1);
    }
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const hints = (await regionHints(
      sourceImage ?? null,
      points,
      leftEye,
      rightEye
    )) as RegionHintsArray;
    const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    parseMs = Math.max(0, Math.round(t1 - t0));
    source = hints?.__source || undefined;
    ort = hints?.__ort || undefined;
    if (process.env.NODE_ENV !== 'production' && hints?.__mask) {
      mask = {
        width: hints.__mask.width,
        height: hints.__mask.height,
        labels: hints.__mask.labels,
        crop: hints.__mask.crop,
      };
    }
    for (const h of hints) polys.push(h as RegionPoly);
  } catch {}
  return { polys, parseMs, source, ort, mask };
}

ctx.onmessage = async (ev: MessageEvent<AnalyzeMessage>) => {
  const data = ev.data;
  try {
    if (data.type === 'INIT') {
      try {
        const adapter = data.payload?.adapter;
        if (adapter) setAdapter(adapter);
      } catch {}
      await getDetector();
      return;
    }
    if (data.type === 'ANALYZE') {
      const { jobId, fileA, fileB, maxDim = 1280, settings } = data.payload;
      post({ type: 'PROGRESS', jobId, stage: 'load' });
      const [bmpA, bmpB] = await Promise.all([
        createImageBitmap(fileA),
        createImageBitmap(fileB),
      ]);
      post({ type: 'PROGRESS', jobId, stage: 'preprocess' });
      const [cnvA, cnvB] = await Promise.all([
        preprocessBitmap(bmpA, maxDim),
        preprocessBitmap(bmpB, maxDim),
      ]);

      const detector = await getDetector();
      post({ type: 'PROGRESS', jobId, stage: 'detectA' });
      const est: MediaPipeFaceMeshTfjsEstimationConfig = { flipHorizontal: false, staticImageMode: true } as MediaPipeFaceMeshTfjsEstimationConfig;
      const facesA = await detector.estimateFaces(cnvA as unknown as FaceLandmarksDetectorInput, est);
      post({ type: 'PROGRESS', jobId, stage: 'detectB' });
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

      post({ type: 'PROGRESS', jobId, stage: 'score' });

      // Compute outlines BEFORE transferring canvas to ImageBitmap
      // (transfer detaches the canvas, making it unusable)
      const outlineA = await computeOutlinePolys(ptsA, leftA, rightA, kpsA, cnvA);
      const outlineB = await computeOutlinePolys(ptsB, leftB, rightB, kpsB, cnvB);

      // Use segmentation-based scoring if masks are available, otherwise fall back to Procrustes
      let scores, overall;
      if (outlineA.mask && outlineB.mask) {
        const maskResult = summarizeRegionsFromMasks(outlineA.mask, outlineB.mask);
        scores = maskResult.scores;
        overall = maskResult.overall;

        if (process.env.NODE_ENV !== 'production') {
          console.info('[worker] using segmentation-based scoring from masks');
        }
      } else {
        const procrustesResult = summarizeRegionsProcrustes(nA, nB, REGION_INDICES);
        scores = procrustesResult.scores;
        overall = procrustesResult.overall;

        if (process.env.NODE_ENV !== 'production') {
          console.info('[worker] using Procrustes scoring (no masks available)');
        }
      }
      // Now transfer canvases to ImageBitmap for display
      const imageA = (cnvA as OffscreenCanvas).transferToImageBitmap();
      const imageB = (cnvB as OffscreenCanvas).transferToImageBitmap();
      let regionsA = outlineA.polys;
      let regionsB = outlineB.polys;
      // Expand slightly for perceptual coverage using eye distance as scale
      const ipdA = Math.hypot(rightA.x - leftA.x, rightA.y - leftA.y) || 1;
      const ipdB = Math.hypot(rightB.x - leftB.x, rightB.y - leftB.y) || 1;
      // For outlines, avoid offsetting which can distort alignment.
      // Keep points as-is and let the overlay do stroke hit-testing.

      // Region-aware text generation using simple shape features on normalized points
      const texts: { region: string; text: string }[] = [];
      type Pt2 = { x: number; y: number };
      const feature = (_name: string, idx: number[]): Pt2[] =>
        idx.map((i) => ({ x: nA[i].x, y: nA[i].y } as Pt2));
      const featB = (idx: number[]): Pt2[] =>
        idx.map((i) => ({ x: nB[i].x, y: nB[i].y } as Pt2));
      // Brows: arch height and spacing
      if (REGION_INDICES.brows) {
        const aPts = feature('brows', REGION_INDICES.brows);
        const bPts = featB(REGION_INDICES.brows);
        if (aPts.length && bPts.length) {
          const minX = (pts: Pt2[]) => Math.min(...pts.map((p) => p.x));
          const maxX = (pts: Pt2[]) => Math.max(...pts.map((p) => p.x));
          const minY = (pts: Pt2[]) => Math.min(...pts.map((p) => p.y));
          const maxY = (pts: Pt2[]) => Math.max(...pts.map((p) => p.y));
          const arch = (pts: Pt2[]) => maxY(pts) - (minY(pts) + (maxY(pts) - minY(pts)) * 0.2);
          const spanA = maxX(aPts) - minX(aPts);
          const spanB = maxX(bPts) - minX(bPts);
          const archA = arch(aPts) / (spanA || 1);
          const archB = arch(bPts) / (spanB || 1);
          const archDiff = Math.abs(archA - archB);
          const archSimilar = archDiff < 0.06;
          const spacingA = (minY(aPts) + maxY(aPts)) / 2; // average brow height in normalized coords
          const spacingB = (minY(bPts) + maxY(bPts)) / 2;
          const spaceDiff = Math.abs(spacingA - spacingB);
          const parts = [] as string[];
          parts.push(archSimilar ? 'similar eyebrow arch' : archA < archB ? 'brow arch slightly higher in B' : 'brow arch slightly higher in A');
          parts.push(spaceDiff < 0.05 ? 'and spacing' : 'with different spacing');
          texts.push({ region: 'brows', text: parts.join(' ') });
        }
      }
      // Mouth: width/height ratio
      if (REGION_INDICES.mouth) {
        const aM = feature('mouth', REGION_INDICES.mouth);
        const bM = featB(REGION_INDICES.mouth);
        if (aM.length && bM.length) {
          const minX = (pts: Pt2[]) => Math.min(...pts.map((p) => p.x));
          const maxX = (pts: Pt2[]) => Math.max(...pts.map((p) => p.x));
          const minY = (pts: Pt2[]) => Math.min(...pts.map((p) => p.y));
          const maxY = (pts: Pt2[]) => Math.max(...pts.map((p) => p.y));
          const ratio = (pts: Pt2[]) => (maxX(pts) - minX(pts)) / ((maxY(pts) - minY(pts)) || 1e-6);
          const rA = ratio(aM);
          const rB = ratio(bM);
          const rel = Math.abs(rA - rB) / Math.max(rA, rB);
          texts.push({ region: 'mouth', text: rel < 0.15 ? 'similar mouth width-to-height' : rA > rB ? 'mouth appears wider/shallower in A' : 'mouth appears wider/shallower in B' });
        }
      }

      post({
        type: 'RESULT',
        jobId,
        imageA,
        imageB,
        pointsA: nA,
        pointsB: nB,
        scores,
        overall,
        regionsA,
        regionsB,
        texts,
        adapter: currentAdapterName?.(),
        parseMsA: outlineA.parseMs,
        parseMsB: outlineB.parseMs,
        hintsSourceA: outlineA.source,
        hintsSourceB: outlineB.source,
        ortA: outlineA.ort,
        ortB: outlineB.ort,
        maskA: outlineA.mask,
        maskB: outlineB.mask,
      });
      return;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // Best-effort: echo jobId if present
    // @ts-expect-error: ev type is MessageEvent<AnalyzeMessage>; payload only on ANALYZE
    const jobId = (ev?.data?.payload?.jobId as string) || '';
    post({ type: 'ERROR', jobId, message: msg });
  }
};

export {};
