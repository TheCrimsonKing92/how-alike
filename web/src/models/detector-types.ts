import type { FaceLandmarksDetector, Keypoint } from '@tensorflow-models/face-landmarks-detection';

export type FaceAnnotations = Record<string, Keypoint[]>;
export type Detection = { keypoints: Keypoint[]; annotations?: FaceAnnotations };

export type DetectorImage = HTMLImageElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap;

export type RegionHint = { region: string; points: { x: number; y: number }[]; open?: boolean };

export type RegionMaskDebug = {
  width: number;
  height: number;
  labels: Uint8Array;
  crop: { sx: number; sy: number; sw: number; sh: number };
};

export type ParsingLogits = {
  width: number;
  height: number;
  crop: { sx: number; sy: number; sw: number; sh: number };
  classIds: {
    skin?: number;
    neck?: number;
    hair?: number;
    background?: number;
  };
  skin?: Float32Array;
  neck?: Float32Array;
  hair?: Float32Array;
  background?: Float32Array;
};

export type RegionHintsArray = RegionHint[] & {
  __source?: 'onnx' | 'heuristic' | 'landmarks' | 'transformers';
  __ort?: 'ok' | 'missing' | 'error';
  __transformers?: 'ok' | 'missing' | 'error' | 'no-hints';
  __mask?: RegionMaskDebug;
  __logits?: ParsingLogits;
};

export interface DetectorAdapter {
  getDetector(): Promise<FaceLandmarksDetector>;
  detect(image: DetectorImage): Promise<Detection | null>;
  // Optional region hints (e.g., from parsing/segmentation); fallback is landmark-derived
  hintsFrom?(
    image: DetectorImage | null,
    points: { x: number; y: number }[],
    eyeLeft?: { x: number; y: number },
    eyeRight?: { x: number; y: number }
  ): Promise<RegionHintsArray | null>;
}
