import { describe, it, expect, beforeEach } from "vitest";
import {
  preprocessFace,
  computeDistance,
  computeSimilarity,
} from "../models/mobilefacenet-adapter";

describe("MobileFaceNet Adapter", () => {
  beforeEach(() => {
    if (typeof globalThis.ImageData === "undefined") {
      class MockImageData {
        constructor(
          public data: Uint8ClampedArray,
          public width: number,
          public height: number
        ) {}
      }
      // @ts-expect-error define ImageData for Node test env
      globalThis.ImageData = MockImageData;
    }

    class MockOffscreenCanvas {
      width: number;
      height: number;
      _data: Uint8ClampedArray;

      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this._data = new Uint8ClampedArray(width * height * 4);
      }

      getContext(type: string) {
        if (type !== "2d") return null;
        const canvas = this;
        return {
          putImageData(imageData: ImageData) {
            canvas.width = imageData.width;
            canvas.height = imageData.height;
            canvas._data = new Uint8ClampedArray(imageData.data);
          },
          drawImage(
            srcCanvas: MockOffscreenCanvas,
            sx: number,
            sy: number,
            sWidth: number,
            sHeight: number,
            _dx: number,
            _dy: number,
            dWidth: number,
            dHeight: number
          ) {
            const dest = new Uint8ClampedArray(dWidth * dHeight * 4);
            const srcData = srcCanvas._data;
            const srcWidth = srcCanvas.width;
            const srcHeight = srcCanvas.height;

            const scaleX = sWidth / dWidth;
            const scaleY = sHeight / dHeight;

            for (let y = 0; y < dHeight; y++) {
              const srcY = Math.min(
                srcHeight - 1,
                Math.floor(sy + y * scaleY)
              );
              for (let x = 0; x < dWidth; x++) {
                const srcX = Math.min(
                  srcWidth - 1,
                  Math.floor(sx + x * scaleX)
                );

                const srcIndex = (srcY * srcWidth + srcX) * 4;
                const destIndex = (y * dWidth + x) * 4;

                dest[destIndex] = srcData[srcIndex];
                dest[destIndex + 1] = srcData[srcIndex + 1];
                dest[destIndex + 2] = srcData[srcIndex + 2];
                dest[destIndex + 3] = srcData[srcIndex + 3];
              }
            }

            canvas._data = dest;
            canvas.width = dWidth;
            canvas.height = dHeight;
          },
          getImageData(_x: number, _y: number, w: number, h: number) {
            return new ImageData(
              new Uint8ClampedArray(canvas._data),
              w,
              h
            );
          },
        };
      }
    }

    // @ts-expect-error override OffscreenCanvas for Node test env
    globalThis.OffscreenCanvas = MockOffscreenCanvas;
  });

  describe("preprocessFace", () => {
    it("should resize and normalize image to 112x112 NCHW", () => {
      // Create test image data (224x224 RGB)
      const width = 224;
      const height = 224;
      const data = new Uint8ClampedArray(width * height * 4);

      // Fill with test pattern (gray = 128)
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 128; // R
        data[i + 1] = 128; // G
        data[i + 2] = 128; // B
        data[i + 3] = 255; // A
      }

      const imageData = new ImageData(data, width, height);
      const result = preprocessFace(imageData);

      // Check output shape: 1 * 3 * 112 * 112 = 37632
      expect(result.length).toBe(3 * 112 * 112);

      // Check normalization: (128 - 127.5) / 127.5 = 0.00392...
      // Values should be close to 0 for gray=128
      const avgValue =
        result.reduce((sum, val) => sum + val, 0) / result.length;
      expect(Math.abs(avgValue)).toBeLessThan(0.01);
    });

    it("should normalize white pixels to ~1", () => {
      const width = 112;
      const height = 112;
      const data = new Uint8ClampedArray(width * height * 4);

      // Fill with white (255)
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255; // R
        data[i + 1] = 255; // G
        data[i + 2] = 255; // B
        data[i + 3] = 255; // A
      }

      const imageData = new ImageData(data, width, height);
      const result = preprocessFace(imageData);

      // (255 - 127.5) / 127.5 = 1.0
      const avgValue =
        result.reduce((sum, val) => sum + val, 0) / result.length;
      expect(avgValue).toBeCloseTo(1.0, 2);
    });

    it("should normalize black pixels to ~-1", () => {
      const width = 112;
      const height = 112;
      const data = new Uint8ClampedArray(width * height * 4);

      // Fill with black (0)
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 0; // R
        data[i + 1] = 0; // G
        data[i + 2] = 0; // B
        data[i + 3] = 255; // A
      }

      const imageData = new ImageData(data, width, height);
      const result = preprocessFace(imageData);

      // (0 - 127.5) / 127.5 = -1.0
      const avgValue =
        result.reduce((sum, val) => sum + val, 0) / result.length;
      expect(avgValue).toBeCloseTo(-1.0, 2);
    });
  });

  describe("computeDistance", () => {
    it("should compute zero distance for identical embeddings", () => {
      const emb1 = new Float32Array([1.0, 2.0, 3.0]);
      const emb2 = new Float32Array([1.0, 2.0, 3.0]);

      const distance = computeDistance(emb1, emb2);
      expect(distance).toBeCloseTo(0, 5);
    });

    it("should compute non-zero distance for different embeddings", () => {
      const emb1 = new Float32Array([1.0, 0.0, 0.0]);
      const emb2 = new Float32Array([0.0, 1.0, 0.0]);

      const distance = computeDistance(emb1, emb2);
      expect(distance).toBeCloseTo(Math.sqrt(2), 5);
    });

    it("should throw error for mismatched dimensions", () => {
      const emb1 = new Float32Array([1.0, 2.0]);
      const emb2 = new Float32Array([1.0, 2.0, 3.0]);

      expect(() => computeDistance(emb1, emb2)).toThrow();
    });
  });

  describe("computeSimilarity", () => {
    it("should compute 1.0 for identical embeddings", () => {
      const emb1 = new Float32Array([1.0, 2.0, 3.0]);
      const emb2 = new Float32Array([1.0, 2.0, 3.0]);

      const similarity = computeSimilarity(emb1, emb2);
      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it("should compute 0.0 for orthogonal embeddings", () => {
      const emb1 = new Float32Array([1.0, 0.0, 0.0]);
      const emb2 = new Float32Array([0.0, 1.0, 0.0]);

      const similarity = computeSimilarity(emb1, emb2);
      expect(similarity).toBeCloseTo(0.0, 5);
    });

    it("should compute -1.0 for opposite embeddings", () => {
      const emb1 = new Float32Array([1.0, 0.0, 0.0]);
      const emb2 = new Float32Array([-1.0, 0.0, 0.0]);

      const similarity = computeSimilarity(emb1, emb2);
      expect(similarity).toBeCloseTo(-1.0, 5);
    });

    it("should throw error for mismatched dimensions", () => {
      const emb1 = new Float32Array([1.0, 2.0]);
      const emb2 = new Float32Array([1.0, 2.0, 3.0]);

      expect(() => computeSimilarity(emb1, emb2)).toThrow();
    });
  });
});
