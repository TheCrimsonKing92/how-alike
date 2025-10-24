import { describe, it, expect } from 'vitest';
import type { ParsingLogits } from '@/models/detector-types';
import type { Pt } from '@/lib/points';
import { computeJawFromMasks } from '@/lib/jaw-from-masks';

function createLogits(width: number, height: number, skinFn: (x: number, y: number) => number, neckFn: (x: number, y: number) => number): ParsingLogits {
  const size = width * height;
  const skin = new Float32Array(size);
  const neck = new Float32Array(size);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      skin[idx] = skinFn(x, y);
      neck[idx] = neckFn(x, y);
    }
  }
  return {
    width,
    height,
    crop: { sx: 0, sy: 0, sw: width, sh: height },
    classIds: { skin: 1, neck: 17, background: 0 },
    skin,
    neck,
    background: new Float32Array(size),
  };
}

function createLandmarks(width = 64, height = 64): Pt[] {
  const pts: Pt[] = new Array(468);
  for (let i = 0; i < 468; i++) {
    pts[i] = {
      x: width * 0.5 + Math.cos(i) * 2,
      y: height * 0.4 + Math.sin(i) * 2,
    };
  }

  const leftGonion = { x: width * 0.2, y: height * 0.75 };
  const rightGonion = { x: width * 0.8, y: height * 0.75 };
  pts[234] = leftGonion;
  pts[454] = rightGonion;

  const jawOutline = [127, 234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 365, 397, 288];
  jawOutline.forEach((idx, i) => {
    const t = i / (jawOutline.length - 1);
    const x = lerp(leftGonion.x, rightGonion.x, t);
    const y = height * 0.72 + Math.sin(t * Math.PI) * height * 0.04;
    pts[idx] = { x, y };
  });
  return pts;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

describe('computeJawFromMasks', () => {
  it('extracts a smooth jawline when skin logits dominate above neck', () => {
    const width = 64;
    const height = 64;
    const logits = createLogits(
      width,
      height,
      (_x, y) => 4 - (y / height) * 3,
      (_x, y) => (y / height) * 3 - 1
    );
    const landmarks = createLandmarks();
    const result = computeJawFromMasks(landmarks, logits);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.polyline.length).toBeGreaterThan(20);
    expect(result.confidence).toBeGreaterThan(0.01);
  });

  it('returns null when logits are missing', () => {
    const landmarks = createLandmarks();
    const logits: ParsingLogits = {
      width: 64,
      height: 64,
      crop: { sx: 0, sy: 0, sw: 64, sh: 64 },
      classIds: {},
    };
    expect(computeJawFromMasks(landmarks, logits)).toBeNull();
  });

  it('returns null when jaw coverage is too sparse', () => {
    const width = 64;
    const height = 64;
    const logits = createLogits(
      width,
      height,
      (x, y) => (x % 2 === 0 ? 1 : -1),
      (x, y) => 0
    );
    const landmarks = createLandmarks();
    expect(computeJawFromMasks(landmarks, logits)).toBeNull();
  });
});
