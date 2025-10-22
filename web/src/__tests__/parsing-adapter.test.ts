import { describe, it, expect, vi, beforeEach } from 'vitest';

const S = 32;

describe('parsing-adapter ORT integration (mocked)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    // Clear cached ORT session stored by parsing-adapter between runs
    delete (globalThis as any)['__parsingSession__'];
  });

  it('returns onnx hints when ORT produces segmentation', async () => {
    const hintPoly = [
      { x: 0, y: 0 },
      { x: S, y: 0 },
      { x: S, y: S },
      { x: 0, y: S },
    ];
    vi.doMock('@/lib/hints', () => ({
      deriveRegionHints: () => [
        { region: 'brows', points: hintPoly, open: true },
        { region: 'brows', points: hintPoly, open: true },
        { region: 'nose', points: hintPoly, open: true },
      ],
    }));
    // Ensure adapter uses the test size so output dims match S
    process.env.NEXT_PUBLIC_PARSING_INPUT = String(S);
    const buffer = new ArrayBuffer(16);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => buffer,
    } as unknown as Response)));

    vi.doMock('onnxruntime-web', () => {
      class Tensor { constructor(public type: string, public data: Float32Array, public dims: number[]) {} }
      class Session {
        inputNames = ['x'];
        outputNames = ['y'];
        async run(_feeds: Record<string, unknown>) {
          // CelebAMask-HQ classes: 2=nose, 3=eyeglasses, 6=l_brow, 7=r_brow
          const K = 19; // CelebAMask-HQ has 19 classes
          const data = new Float32Array(1 * S * S * K);
          for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
              const idx = (y * S + x) * K;
              if (x < S / 2) {
                data[idx + 6] = 10; // left brow (class 6)
              } else {
                data[idx + 7] = 10; // right brow (class 7)
              }
              const centerDist = Math.hypot(x - S / 2, y - S / 2);
              if (centerDist < S / 4) {
                data[idx + 2] = 12; // nose (class 2)
              }
            }
          }
          return { y: { dims: [1, S, S, K], data } } as unknown as Record<string, unknown>;
        }
      }
      return {
        InferenceSession: { create: async () => new Session() },
        Tensor,
        env: { wasm: {} },
      };
    }, { virtual: true });

    const { parsingAdapter } = await import('@/models/parsing-adapter');
    // Build a tiny fake image and points
    const img = new (globalThis as any).OffscreenCanvas(S, S) as OffscreenCanvas;
    const pts = [ { x: S*0.25, y: S*0.3 }, { x: S*0.75, y: S*0.3 }, { x: S*0.5, y: S*0.7 } ];
    const eyeL = { x: S*0.35, y: S*0.32 };
    const eyeR = { x: S*0.65, y: S*0.32 };
    const out = await parsingAdapter.hintsFrom!(img as any, pts, eyeL, eyeR);
    expect(out).toBeTruthy();
    // Expect ORT path used
    // @ts-expect-error: test-only property
    expect((out as any).__source).toBe('onnx');
    // @ts-expect-error: test-only property
    const maskInfo = (out as any).__mask;
    expect(maskInfo).toBeDefined();
    expect(maskInfo.width).toBe(S);
    expect(maskInfo.height).toBe(S);
    expect(maskInfo.labels).toBeInstanceOf(Uint8Array);
    // Should include at least one brows outline from classes 6 and 7
    const hasBrows = (out || []).some(h => h.region === 'brows' && h.points.length >= 2);
    expect(hasBrows).toBe(true);
    const nose = (out || []).find(h => h.region === 'nose');
    expect(nose).toBeTruthy();
    // Nose uses landmark-based outline (better tip anatomy), which is open
    expect(nose?.open).toBe(true);
    expect(nose?.points.length).toBeGreaterThanOrEqual(3);
    if (nose) {
      const ys = nose.points.map((p) => p.y);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0);
      const xs = nose.points.map((p) => p.x);
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0);
    }
  });

  it('returns landmarks + error when session create fails', async () => {
    const hintPoly = [
      { x: 0, y: 0 },
      { x: S, y: 0 },
      { x: S, y: S },
      { x: 0, y: S },
    ];
    vi.doMock('@/lib/hints', () => ({
      deriveRegionHints: () => [
        { region: 'brows', points: hintPoly, open: true },
        { region: 'nose', points: hintPoly, open: true },
      ],
    }));
    process.env.NEXT_PUBLIC_PARSING_INPUT = String(S);
    vi.doMock('onnxruntime-web', () => {
      return {
        InferenceSession: { create: async () => { throw new Error('fail'); } },
        Tensor: class {},
        env: { wasm: {} },
      };
    }, { virtual: true });
    const { parsingAdapter } = await import('@/models/parsing-adapter');
    const img = new (globalThis as any).OffscreenCanvas(S, S) as OffscreenCanvas;
    const pts = [ { x: 4, y: 4 }, { x: 8, y: 8 } ];
    const out = await parsingAdapter.hintsFrom!(img as any, pts);
    // @ts-expect-error: test-only property
    expect((out as any).__source).toBe('landmarks');
    // @ts-expect-error: test-only property
    expect((out as any).__ort).toBe('error');
  });
});
