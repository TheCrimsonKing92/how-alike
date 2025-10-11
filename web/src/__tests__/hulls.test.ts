import { concaveHullKNN, convexHull } from '@/lib/hulls';

// Construct a C-shaped point cloud and check concave hull is smaller than convex
function cShapePoints() {
  const pts: {x:number;y:number}[] = [];
  // two vertical bars with a gap on the right
  for (let y = 0; y <= 10; y++) {
    pts.push({ x: 0, y });
    pts.push({ x: 1, y });
  }
  for (let x = 0; x <= 6; x++) {
    pts.push({ x, y: 0 });
    pts.push({ x, y: 10 });
  }
  return pts;
}

function polygonArea(p: {x:number;y:number}[]) {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    a += (p[j].x * p[i].y) - (p[i].x * p[j].y);
  }
  return Math.abs(a) / 2;
}

describe('hulls', () => {
  it('concave hull yields smaller area on C-shape', () => {
    const pts = cShapePoints();
    const ch = convexHull(pts);
    const cc = concaveHullKNN(pts, 4);
    expect(cc.length).toBeGreaterThan(3);
    // concave hull area should be at least 10% smaller than convex hull area
    expect(polygonArea(cc)).toBeLessThan(polygonArea(ch) * 0.9);
  });
});

