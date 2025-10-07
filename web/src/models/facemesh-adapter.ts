"use client";
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";
import "@tensorflow/tfjs-backend-cpu";
import type {
  FaceLandmarksDetector,
  Keypoint,
  Face,
  MediaPipeFaceMeshTfjsModelConfig,
  FaceLandmarksDetectorInput,
} from "@tensorflow-models/face-landmarks-detection";

let detectorPromise: Promise<FaceLandmarksDetector> | null = null;

export type FaceAnnotations = Record<string, Keypoint[]>;

export type Detection = {
  keypoints: Keypoint[];
  annotations?: FaceAnnotations;
};

type FaceLike = {
  keypoints?: Keypoint[];
  scaledMesh?: Array<[number, number, number?]>;
  annotations?: FaceAnnotations;
};

export async function getDetector(): Promise<FaceLandmarksDetector> {
  if (typeof window === "undefined") throw new Error("Detector must run in browser");
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const isDev = process.env.NODE_ENV !== "production";
      const t0 = performance.now();
      let backendSet = false;
      try {
        await tf.setBackend("webgl");
        backendSet = true;
      } catch {
        // ignore
      }
      if (!backendSet) {
        await tf.setBackend("cpu");
      }
      await tf.ready();
      const backend = tf.getBackend();
      const t1 = performance.now();
      if (isDev) {
        console.info(`[detector] backend=${backend} init=${(t1 - t0).toFixed(0)}ms`);
        if (backend === "cpu") {
          console.info("[detector] running on CPU backend; performance may be reduced");
        }
      }

      const face = await import("@tensorflow-models/face-landmarks-detection");
      const model = face.SupportedModels.MediaPipeFaceMesh;
      const cfg: MediaPipeFaceMeshTfjsModelConfig = {
        runtime: "tfjs",
        refineLandmarks: true,
      };
      return face.createDetector(model, cfg);
    })();
  }
  return detectorPromise;
}

export async function detect(image: HTMLImageElement | HTMLCanvasElement | ImageBitmap) {
  const detector = await getDetector();
  const input = image as unknown as FaceLandmarksDetectorInput;
  const faces = (await detector.estimateFaces(input)) as Face[];
  if (!faces || faces.length === 0) return null;
  const f = faces[0] as unknown as FaceLike;
  const keypoints: Keypoint[] = f.keypoints
    ? f.keypoints
    : (f.scaledMesh ?? []).map((p) => ({ x: p[0], y: p[1], z: p[2] })) as Keypoint[];
  const annotations: FaceAnnotations | undefined = f.annotations;
  return { keypoints, annotations } as Detection;
}
