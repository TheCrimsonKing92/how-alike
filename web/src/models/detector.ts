"use client";
// Central detector adapter with pluggable implementations.
// Selection is environment-driven for now; defaults to FaceMesh.
import type { DetectorAdapter, Detection, RegionHintsArray, DetectorImage } from './detector-types';
import { deriveRegionHints } from '@/lib/hints';

let overrideName: 'facemesh' | 'parsing' | 'transformers' | '' | null = null;
let currentName: 'facemesh' | 'parsing' | 'transformers' = 'transformers';

export function setAdapter(name?: 'facemesh' | 'parsing' | 'transformers') {
  overrideName = name ?? null;
  adapterPromise = null; // reset to allow switching per worker/session
}

async function selectAdapter(): Promise<DetectorAdapter> {
  const envPref = (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_DETECTOR : undefined) || '';
  const want = (overrideName ?? envPref).toLowerCase();

  // Default to transformers-based parsing (browser-compatible)
  if (want === 'transformers' || want === '' || !want) {
    const mod = await import('./transformers-parsing-adapter');
    currentName = 'transformers';
    return mod.transformersParsingAdapter;
  }

  // Legacy ONNX Runtime parsing (broken in browser)
  if (want === 'parsing') {
    const mod = await import('./parsing-adapter');
    currentName = 'parsing';
    return mod.parsingAdapter;
  }

  // FaceMesh only (no parsing)
  if (want === 'facemesh') {
    const mod = await import('./facemesh-adapter');
    currentName = 'facemesh';
    return {
      getDetector: mod.getDetector,
      detect: mod.detect,
    } satisfies DetectorAdapter as DetectorAdapter;
  }

  // Default fallback to transformers
  const mod = await import('./transformers-parsing-adapter');
  currentName = 'transformers';
  return mod.transformersParsingAdapter;
}

let adapterPromise: Promise<DetectorAdapter> | null = null;
async function getAdapter() {
  adapterPromise ??= selectAdapter();
  return adapterPromise;
}

export async function getDetector() {
  const a = await getAdapter();
  return a.getDetector();
}

export async function detect(image: DetectorImage): Promise<Detection | null> {
  const a = await getAdapter();
  return a.detect(image);
}

export async function regionHints(
  image: DetectorImage | null,
  points: { x: number; y: number }[],
  eyeLeft?: { x: number; y: number },
  eyeRight?: { x: number; y: number }
) {
  const a = await getAdapter();
  if (typeof a.hintsFrom === 'function') {
    const h = await a.hintsFrom(image, points, eyeLeft, eyeRight);
    if (h && h.length) return h;
  }
  const fb = deriveRegionHints(points) as RegionHintsArray;
  fb.__source = 'heuristic';
  return fb;
}

export function currentAdapterName() {
  return currentName;
}
