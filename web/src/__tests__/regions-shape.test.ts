import { describe, it, expect } from 'vitest';
import { FEATURE_OUTLINES, LOWER_FACE_INDICES } from '@/lib/regions';

describe('regions data shapes', () => {
  it('nose outline has denser open polyline', () => {
    const nose = FEATURE_OUTLINES.nose;
    expect(Array.isArray(nose)).toBe(true);
    expect(nose.length).toBeGreaterThanOrEqual(1);
    // First polyline should be reasonably dense (>=5 points)
    expect(nose[0].length).toBeGreaterThanOrEqual(5);
  });

  it('lower-face indices exist and include the chin landmark', () => {
    expect(Array.isArray(LOWER_FACE_INDICES)).toBe(true);
    expect(LOWER_FACE_INDICES.length).toBeGreaterThanOrEqual(8);
    expect(LOWER_FACE_INDICES.includes(152)).toBe(true);
  });
});

