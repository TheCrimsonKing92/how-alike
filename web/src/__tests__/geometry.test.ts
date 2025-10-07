import { centroid, distance, angle, normalizeByEyes } from "@/lib/geometry";

describe("geometry utils", () => {
  it("computes centroid", () => {
    expect(centroid([{ x: 0, y: 0 }, { x: 2, y: 2 }])).toEqual({ x: 1, y: 1 });
  });
  it("computes distance", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
  it("computes angle", () => {
    const a = angle({ x: 0, y: 0 }, { x: 0, y: 1 });
    expect(Math.round((a / Math.PI) * 2)).toBe(1); // ~90deg
  });
  it("normalizes points by eyes to unit scale and horizontal alignment", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ];
    const left = { x: 0, y: 0 };
    const right = { x: 10, y: 0 };
    const norm = normalizeByEyes(pts, left, right);
    // mid-eye at origin, scale = 1/IPD = 1/10
    expect(norm[0].x).toBeCloseTo(-0.5);
    expect(norm[1].x).toBeCloseTo(0.5);
    expect(norm[2].y).toBeCloseTo(1);
  });
});

