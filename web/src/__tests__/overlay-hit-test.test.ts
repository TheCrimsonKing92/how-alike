import { describe, it, expect } from 'vitest';
import { hitTestRegion } from '@/lib/overlay-hit-test';
import type { MaskOverlay, RegionPoly } from '@/workers/types';

describe('hitTestRegion', () => {
  it('prefers segmentation mask classes when available', () => {
    const labels = new Uint8Array(16);
    // 4x4 mask; set cell (1,1) to nose class (2)
    labels[1 + 4 * 1] = 2;

    const mask: MaskOverlay = {
      width: 4,
      height: 4,
      labels,
      crop: { sx: 10, sy: 20, sw: 40, sh: 40 },
    };

    const regions: RegionPoly[] = [
      { region: 'nose', points: [{ x: 12, y: 22 }, { x: 18, y: 22 }], open: true },
    ];

    // Point maps to the labelled mask cell
    const region = hitTestRegion({
      x: 20,
      y: 30,
      regions,
      mask,
    });

    expect(region).toBe('nose');
  });

  it('falls back to polygon hit-testing when segmentation is absent', () => {
    const triangle: RegionPoly = {
      region: 'mouth',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 8 },
      ],
    };

    const region = hitTestRegion({
      x: 5,
      y: 3,
      regions: [triangle],
    });

    expect(region).toBe('mouth');
  });

  it('detects proximity to open paths using distance threshold', () => {
    const jaw: RegionPoly = {
      region: 'jaw',
      open: true,
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
      ],
    };

    const region = hitTestRegion({
      x: 10,
      y: 4,
      regions: [jaw],
    });

    expect(region).toBe('jaw');
  });
});
