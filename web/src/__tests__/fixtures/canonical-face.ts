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

  // Eyes - Extended landmark sets for robust measurements
  // Slight positive canthal tilt (outer ~3% higher than inner)
  // Left eye inner corner region
  set(133, { x: 0.30, y: 0.43, z: 0.02 });
  set(173, { x: 0.305, y: 0.43, z: 0.02 });
  set(157, { x: 0.295, y: 0.435, z: 0.02 });
  set(158, { x: 0.302, y: 0.425, z: 0.02 });
  set(159, { x: 0.31, y: 0.40, z: 0.02 }); // also used for top
  set(160, { x: 0.315, y: 0.42, z: 0.02 });
  set(161, { x: 0.318, y: 0.425, z: 0.02 });
  set(246, { x: 0.320, y: 0.43, z: 0.02 });
  // Left eye outer corner region
  set(33, { x: 0.40, y: 0.40, z: 0.02 });
  set(7, { x: 0.395, y: 0.395, z: 0.02 });
  set(163, { x: 0.405, y: 0.405, z: 0.02 });
  set(144, { x: 0.398, y: 0.41, z: 0.02 });
  set(145, { x: 0.40, y: 0.44, z: 0.02 }); // also used for bottom
  set(155, { x: 0.402, y: 0.415, z: 0.02 });
  // Right eye inner corner region
  set(362, { x: 0.70, y: 0.43, z: 0.02 });
  set(398, { x: 0.695, y: 0.43, z: 0.02 });
  set(384, { x: 0.705, y: 0.435, z: 0.02 });
  set(385, { x: 0.698, y: 0.425, z: 0.02 });
  set(386, { x: 0.69, y: 0.40, z: 0.02 }); // also used for top
  set(387, { x: 0.685, y: 0.42, z: 0.02 });
  set(388, { x: 0.682, y: 0.425, z: 0.02 });
  set(466, { x: 0.680, y: 0.43, z: 0.02 });
  // Right eye outer corner region
  set(263, { x: 0.60, y: 0.40, z: 0.02 });
  set(249, { x: 0.605, y: 0.395, z: 0.02 });
  set(390, { x: 0.595, y: 0.405, z: 0.02 });
  set(373, { x: 0.602, y: 0.41, z: 0.02 });
  set(374, { x: 0.60, y: 0.44, z: 0.02 }); // also used for bottom
  set(382, { x: 0.598, y: 0.415, z: 0.02 });
  // Left eye upper/lower lid landmarks
  set(153, { x: 0.365, y: 0.42, z: 0.02 });
  set(154, { x: 0.370, y: 0.42, z: 0.02 });
  // Right eye upper/lower lid landmarks
  set(380, { x: 0.635, y: 0.42, z: 0.02 });
  set(381, { x: 0.630, y: 0.42, z: 0.02 });
  set(383, { x: 0.625, y: 0.42, z: 0.02 });

  // Brows - Extended landmark sets (10 points each)
  // Left eyebrow: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46]
  set(70, { x: 0.32, y: 0.32, z: 0.01 });   // inner
  set(63, { x: 0.33, y: 0.315, z: 0.01 });
  set(105, { x: 0.34, y: 0.31, z: 0.01 });
  set(66, { x: 0.36, y: 0.305, z: 0.01 });  // mid
  set(107, { x: 0.38, y: 0.30, z: 0.01 });  // peak
  set(55, { x: 0.40, y: 0.305, z: 0.01 });  // mid
  set(65, { x: 0.42, y: 0.31, z: 0.01 });
  set(52, { x: 0.43, y: 0.315, z: 0.01 });
  set(53, { x: 0.44, y: 0.32, z: 0.01 });
  set(46, { x: 0.45, y: 0.325, z: 0.01 });  // outer
  // Right eyebrow: [300, 293, 334, 296, 336, 285, 295, 282, 283, 276]
  set(300, { x: 0.68, y: 0.32, z: 0.01 });  // inner
  set(293, { x: 0.67, y: 0.315, z: 0.01 });
  set(334, { x: 0.66, y: 0.31, z: 0.01 });
  set(296, { x: 0.64, y: 0.305, z: 0.01 }); // mid
  set(336, { x: 0.62, y: 0.30, z: 0.01 });  // peak
  set(285, { x: 0.60, y: 0.305, z: 0.01 }); // mid
  set(295, { x: 0.58, y: 0.31, z: 0.01 });
  set(282, { x: 0.57, y: 0.315, z: 0.01 });
  set(283, { x: 0.56, y: 0.32, z: 0.01 });
  set(276, { x: 0.55, y: 0.325, z: 0.01 }); // outer

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
