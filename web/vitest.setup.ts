import '@testing-library/jest-dom';

// Stub canvas context in jsdom
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: () => ({
    clearRect: () => {},
    save: () => {},
    translate: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    restore: () => {},
  }),
});

// Minimal OffscreenCanvas polyfill for tests
if (typeof (globalThis as any).OffscreenCanvas === 'undefined') {
  class FakeOffscreenCanvas {
    width: number;
    height: number;
    constructor(w: number, h: number) { this.width = w; this.height = h; }
    getContext(_kind: string) {
      return {
        clearRect: () => {},
        drawImage: () => {},
        getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      } as any;
    }
    convertToBlob?: () => Promise<Blob>;
  }
  (globalThis as any).OffscreenCanvas = FakeOffscreenCanvas as any;
}
