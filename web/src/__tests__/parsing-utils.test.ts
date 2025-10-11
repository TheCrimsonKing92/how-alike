import { describe, it, expect } from 'vitest';
import { pickSegOutput, computeFaceCrop } from '@/models/parsing-utils';

describe('parsing-utils', () => {
  it('pickSegOutput prefers K>1 and SxS outputs (NCHW)', () => {
    const S = 16;
    const good = { dims: [1, 3, S, S], data: new Float32Array(1 * 3 * S * S) };
    const bad = { dims: [1, 1, S, S], data: new Float32Array(1 * 1 * S * S) };
    const out = { a: good, b: bad } as unknown as Record<string, unknown>;
    const chosen = pickSegOutput(out, S);
    expect(chosen).not.toBeNull();
    expect(chosen!.dims).toEqual([1, 3, S, S]);
  });

  it('pickSegOutput supports NHWC [1,H,W,K]', () => {
    const S = 8;
    const nhwc = { dims: [1, S, S, 4], data: new Float32Array(1 * S * S * 4) };
    const out = { x: nhwc } as unknown as Record<string, unknown>;
    const chosen = pickSegOutput(out, S);
    expect(chosen).not.toBeNull();
    expect(chosen!.dims).toEqual([1, S, S, 4]);
  });

  it('computeFaceCrop returns square ROI centered above eyes', () => {
    const width = 1000, height = 800;
    const pts = [ {x: 450, y: 350}, {x: 550, y: 360}, {x: 500, y: 500} ];
    const eyeL = { x: 480, y: 360 };
    const eyeR = { x: 520, y: 362 };
    const { sx, sy, sw, sh } = computeFaceCrop(width, height, pts, eyeL, eyeR);
    expect(sw).toEqual(sh);
    expect(sx).toBeGreaterThanOrEqual(0);
    expect(sy).toBeGreaterThanOrEqual(0);
    expect(sx + sw).toBeLessThanOrEqual(width);
    expect(sy + sh).toBeLessThanOrEqual(height);
  });
});

