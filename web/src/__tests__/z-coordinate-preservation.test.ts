import { describe, it, expect } from 'vitest';
import { fromKeypoints } from '@/lib/geometry';

describe('Z-coordinate preservation', () => {
  it('should preserve z-coordinates through fromKeypoints', () => {
    const kps = [
      { x: 100, y: 200, z: -23.5 },
      { x: 150, y: 180, z: -30.4 },
      { x: 120, y: 220, z: -15.2 },
    ];

    const result = fromKeypoints(kps);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ x: 100, y: 200, z: -23.5 });
    expect(result[1]).toEqual({ x: 150, y: 180, z: -30.4 });
    expect(result[2]).toEqual({ x: 120, y: 220, z: -15.2 });
  });

  it('should handle missing z-coordinates gracefully', () => {
    const kps = [
      { x: 100, y: 200 },
      { x: 150, y: 180, z: -30.4 },
    ];

    const result = fromKeypoints(kps);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ x: 100, y: 200, z: undefined });
    expect(result[1]).toEqual({ x: 150, y: 180, z: -30.4 });
  });

  it('should preserve z-coordinates with typical MediaPipe values', () => {
    // Real MediaPipe z-coordinates from sample output
    const kps = [
      { x: 159.299, y: 412.067, z: -23.750072198107066 },
      { x: 153.022, y: 380.524, z: -30.448 },
    ];

    const result = fromKeypoints(kps);

    expect(result[0].z).toBe(-23.750072198107066);
    expect(result[1].z).toBe(-30.448);
  });
});
