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
  // Positive canthal tilt: outer corner ~2% higher than inner (Y decreases upward)
  // Left eye outline: [33(outer), 7, 163, 144, 145, 153, 154, 155, 133(inner), 173, 157, 158, 159, 160, 161, 246]

  // Left eye: inner at (0.30, 0.42), outer at (0.40, 0.40) for ~11° positive tilt
  // Outer corner region (8 points around 33): X ≈ 0.37-0.40, Y ≈ 0.40-0.42
  set(159, { x: 0.370, y: 0.410, z: 0.02 }); // upper lid approaching outer
  set(160, { x: 0.380, y: 0.406, z: 0.02 });
  set(161, { x: 0.390, y: 0.403, z: 0.02 });
  set(246, { x: 0.397, y: 0.401, z: 0.02 }); // upper lid at outer corner
  set(33, { x: 0.40, y: 0.40, z: 0.02 });    // OUTER CORNER
  set(7, { x: 0.397, y: 0.403, z: 0.02 });   // lower lid at outer corner
  set(163, { x: 0.390, y: 0.408, z: 0.02 });
  set(144, { x: 0.380, y: 0.414, z: 0.02 }); // lower lid leaving outer

  // Inner corner region (8 points around 133): X ≈ 0.30-0.33, Y ≈ 0.41-0.43
  set(145, { x: 0.330, y: 0.418, z: 0.02 }); // lower lid approaching inner
  set(153, { x: 0.320, y: 0.420, z: 0.02 });
  set(154, { x: 0.310, y: 0.421, z: 0.02 });
  set(155, { x: 0.303, y: 0.421, z: 0.02 }); // lower lid at inner corner
  set(133, { x: 0.30, y: 0.42, z: 0.02 });   // INNER CORNER
  set(173, { x: 0.303, y: 0.419, z: 0.02 }); // upper lid at inner corner
  set(157, { x: 0.310, y: 0.418, z: 0.02 });
  set(158, { x: 0.320, y: 0.416, z: 0.02 }); // upper lid leaving inner

  // Right eye: mirror of left, inner at (0.70, 0.42), outer at (0.60, 0.40)
  // Outer corner region (8 points around 263): X ≈ 0.60-0.63
  set(374, { x: 0.620, y: 0.414, z: 0.02 }); // lower lid leaving outer
  set(373, { x: 0.610, y: 0.408, z: 0.02 });
  set(390, { x: 0.603, y: 0.403, z: 0.02 });
  set(249, { x: 0.603, y: 0.403, z: 0.02 });
  set(263, { x: 0.60, y: 0.40, z: 0.02 });   // OUTER CORNER
  set(466, { x: 0.603, y: 0.401, z: 0.02 }); // upper lid at outer corner
  set(388, { x: 0.610, y: 0.403, z: 0.02 });
  set(387, { x: 0.620, y: 0.406, z: 0.02 }); // upper lid approaching outer

  // Inner corner region (8 points around 362): X ≈ 0.67-0.70
  set(386, { x: 0.680, y: 0.416, z: 0.02 }); // upper lid leaving inner
  set(385, { x: 0.690, y: 0.418, z: 0.02 });
  set(384, { x: 0.697, y: 0.419, z: 0.02 });
  set(398, { x: 0.697, y: 0.421, z: 0.02 }); // upper lid at inner corner
  set(362, { x: 0.70, y: 0.42, z: 0.02 });   // INNER CORNER
  set(382, { x: 0.697, y: 0.421, z: 0.02 }); // lower lid at inner corner
  set(381, { x: 0.690, y: 0.421, z: 0.02 });
  set(380, { x: 0.680, y: 0.420, z: 0.02 }); // lower lid approaching inner

  // Additional lid landmarks for eye size measurement
  set(383, { x: 0.670, y: 0.418, z: 0.02 });

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
