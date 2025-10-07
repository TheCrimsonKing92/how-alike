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
