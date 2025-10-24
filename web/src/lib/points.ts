export type Point2D = {
  x: number;
  y: number;
};

export type Point3D = Point2D & {
  z?: number;
};

export type Point = Point3D;

// Back-compat alias used across geometry helpers
export type Pt = Point2D;
