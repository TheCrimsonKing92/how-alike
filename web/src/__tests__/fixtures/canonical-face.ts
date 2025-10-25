import type { Point } from '@/lib/points';

/**
 * Create a canonical, front-facing landmark set with balanced proportions.
 * Values live in a normalized 0..1 space so tests can apply deterministic jitter.
 */
export function createCanonicalLandmarks(): Point[] {
  const landmarks: Point[] = Array.from({ length: 468 }, () => ({
    x: 0,
    y: 0,
    z: 0,
  }));

  const set = (index: number, coords: Point) => {
    landmarks[index] = { ...landmarks[index], ...coords };
  };

  // Eyes
  set(133, { x: 0.30, y: 0.40, z: 0.02 }); // left inner
  set(246, { x: 0.305, y: 0.40, z: 0.02 });
  set(155, { x: 0.295, y: 0.41, z: 0.02 });
  set(33, { x: 0.40, y: 0.39, z: 0.02 });  // left outer
  set(7, { x: 0.395, y: 0.39, z: 0.02 });
  set(173, { x: 0.405, y: 0.40, z: 0.02 });
  set(159, { x: 0.35, y: 0.37, z: 0.02 }); // left top
  set(145, { x: 0.35, y: 0.43, z: 0.02 }); // left bottom
  set(362, { x: 0.70, y: 0.40, z: 0.02 }); // right inner (toward center)
  set(466, { x: 0.695, y: 0.40, z: 0.02 });
  set(382, { x: 0.705, y: 0.41, z: 0.02 });
  set(263, { x: 0.60, y: 0.41, z: 0.02 }); // right outer (toward ear)
  set(249, { x: 0.595, y: 0.41, z: 0.02 });
  set(398, { x: 0.605, y: 0.40, z: 0.02 });
  set(386, { x: 0.65, y: 0.37, z: 0.02 }); // right top
  set(374, { x: 0.65, y: 0.43, z: 0.02 }); // right bottom

  // Brows
  set(70, { x: 0.33, y: 0.32, z: 0.01 });
  set(107, { x: 0.37, y: 0.31, z: 0.01 });
  set(66, { x: 0.42, y: 0.33, z: 0.01 });
  set(300, { x: 0.57, y: 0.32, z: 0.01 });
  set(336, { x: 0.63, y: 0.31, z: 0.01 });
  set(296, { x: 0.68, y: 0.33, z: 0.01 });

  // Nose
  set(94, { x: 0.47, y: 0.55, z: 0.015 });
  set(331, { x: 0.53, y: 0.55, z: 0.015 });
  set(1, { x: 0.50, y: 0.52, z: 0.05 });
  set(6, { x: 0.50, y: 0.40, z: 0.02 });
  set(168, { x: 0.50, y: 0.45, z: 0.03 });
  set(197, { x: 0.50, y: 0.50, z: 0.04 });

  // Mouth / Lips
  set(0, { x: 0.50, y: 0.60, z: 0.015 });  // upper lip top + cupid's bow center
  set(13, { x: 0.50, y: 0.63, z: 0.010 });
  set(14, { x: 0.50, y: 0.66, z: 0.000 });
  set(17, { x: 0.50, y: 0.70, z: -0.005 });
  set(37, { x: 0.46, y: 0.62, z: 0.014 });
  set(267, { x: 0.54, y: 0.62, z: 0.014 });
  set(61, { x: 0.44, y: 0.69, z: 0.000 });
  set(291, { x: 0.56, y: 0.67, z: 0.000 });

  // Jaw / Cheeks
  set(234, { x: 0.25, y: 0.72, z: 0.030 });
  set(454, { x: 0.75, y: 0.72, z: 0.030 });
  set(152, { x: 0.50, y: 0.90, z: -0.005 });

  // Nasolabial folds
  set(36, { x: 0.47, y: 0.62, z: -0.005 });
  set(266, { x: 0.53, y: 0.62, z: -0.005 });

  // Forehead
  set(10, { x: 0.50, y: 0.25, z: 0.025 });
  set(109, { x: 0.37, y: 0.30, z: 0.020 });
  set(338, { x: 0.63, y: 0.30, z: 0.020 });

  return landmarks;
}
