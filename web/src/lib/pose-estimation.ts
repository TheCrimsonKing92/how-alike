/**
 * Face pose estimation from MediaPipe FaceMesh landmarks
 *
 * Estimates head rotation (yaw, pitch, roll) to normalize faces to frontal view
 * before similarity comparison. This reduces errors from photos taken at different angles.
 */

export interface FacePose {
  yaw: number;    // Left-right rotation in degrees (-90 to +90, 0 = frontal)
  pitch: number;  // Up-down rotation in degrees (-90 to +90, 0 = level)
  roll: number;   // Tilt rotation in degrees (-180 to +180, 0 = upright)
  confidence: number; // 0-1 confidence in pose estimation
}

export interface Point3D {
  x: number;
  y: number;
  z?: number;
}

// MediaPipe FaceMesh landmark indices for pose estimation
const POSE_LANDMARKS = {
  // Face contour points for yaw estimation
  leftCheek: 234,    // Left face contour
  rightCheek: 454,   // Right face contour
  noseTip: 1,        // Nose tip (center reference)

  // Eye landmarks for roll estimation
  leftEyeOuter: 33,
  leftEyeInner: 133,
  rightEyeInner: 362,
  rightEyeOuter: 263,

  // Vertical landmarks for pitch estimation
  noseBridge: 6,     // Top of nose bridge (between eyebrows)
  chinBottom: 152,   // Bottom of chin
  forehead: 10,      // Forehead reference
};

/**
 * Estimate face pose from 3D landmarks
 *
 * Uses geometric analysis of landmark asymmetry and positions to estimate
 * Euler angles without full 3D reconstruction.
 */
export function estimateFacePose(landmarks: Point3D[]): FacePose {
  // Extract key landmarks
  const noseTip = landmarks[POSE_LANDMARKS.noseTip];
  const leftCheek = landmarks[POSE_LANDMARKS.leftCheek];
  const rightCheek = landmarks[POSE_LANDMARKS.rightCheek];

  const leftEyeOuter = landmarks[POSE_LANDMARKS.leftEyeOuter];
  const leftEyeInner = landmarks[POSE_LANDMARKS.leftEyeInner];
  const rightEyeInner = landmarks[POSE_LANDMARKS.rightEyeInner];
  const rightEyeOuter = landmarks[POSE_LANDMARKS.rightEyeOuter];

  const noseBridge = landmarks[POSE_LANDMARKS.noseBridge];
  const chinBottom = landmarks[POSE_LANDMARKS.chinBottom];

  // Estimate yaw (left-right rotation)
  // When face turns right, right cheek moves away (smaller x), left cheek approaches (larger x)
  const yaw = estimateYaw(leftCheek, rightCheek, noseTip);

  // Estimate pitch (up-down rotation)
  // When face tilts up, nose tip moves up relative to chin
  const pitch = estimatePitch(noseBridge, noseTip, chinBottom);

  // Estimate roll (tilt rotation)
  // Eye line angle from horizontal
  const roll = estimateRoll(
    leftEyeOuter,
    leftEyeInner,
    rightEyeInner,
    rightEyeOuter
  );

  // Confidence based on landmark quality
  const confidence = estimateConfidence(landmarks);

  return { yaw, pitch, roll, confidence };
}

/**
 * Estimate yaw (left-right head rotation) in degrees
 *
 * Uses asymmetry of left/right cheek landmarks relative to nose tip.
 * Negative = turned left, Positive = turned right, 0 = frontal
 */
function estimateYaw(
  leftCheek: Point3D,
  rightCheek: Point3D,
  noseTip: Point3D
): number {
  // Distances from nose tip to each cheek in image plane (x-axis)
  const leftDist = Math.abs(leftCheek.x - noseTip.x);
  const rightDist = Math.abs(rightCheek.x - noseTip.x);

  // Asymmetry ratio: when frontal, distances are equal
  // When turned right: rightDist < leftDist
  // When turned left: leftDist < rightDist
  const asymmetry = (rightDist - leftDist) / (rightDist + leftDist);

  // Convert asymmetry to degrees (-1 to +1 → -45 to +45 degrees approximately)
  // Scale factor calibrated empirically (asymmetry of ~0.3 ≈ 30° rotation)
  const yaw = asymmetry * 90;

  // Clamp to reasonable range
  return Math.max(-90, Math.min(90, yaw));
}

/**
 * Estimate pitch (up-down head rotation) in degrees
 *
 * Uses vertical position of nose tip relative to nose bridge and chin.
 * Negative = tilted down, Positive = tilted up, 0 = level
 */
function estimatePitch(
  noseBridge: Point3D,
  noseTip: Point3D,
  chinBottom: Point3D
): number {
  // Vertical face span from bridge to chin
  const faceHeight = chinBottom.y - noseBridge.y;

  if (faceHeight <= 0) return 0; // Invalid landmarks

  // Expected position of nose tip in frontal view (approximately 0.45 down from bridge)
  const expectedNoseY = noseBridge.y + faceHeight * 0.45;

  // Actual position deviation
  const deviation = noseTip.y - expectedNoseY;

  // Convert to degrees (deviation of 0.1 * faceHeight ≈ 15° pitch)
  // When tilted up: nose tip appears lower in image (larger y) → positive deviation → positive pitch
  // When tilted down: nose tip appears higher in image (smaller y) → negative deviation → negative pitch
  const pitch = (deviation / faceHeight) * 60;

  return Math.max(-90, Math.min(90, pitch));
}

/**
 * Estimate roll (tilt rotation) in degrees
 *
 * Uses angle of eye line from horizontal.
 * Negative = tilted counterclockwise, Positive = tilted clockwise, 0 = level
 */
function estimateRoll(
  leftEyeOuter: Point3D,
  leftEyeInner: Point3D,
  rightEyeInner: Point3D,
  rightEyeOuter: Point3D
): number {
  // Compute center of each eye
  const leftEyeCenter = {
    x: (leftEyeOuter.x + leftEyeInner.x) / 2,
    y: (leftEyeOuter.y + leftEyeInner.y) / 2,
  };

  const rightEyeCenter = {
    x: (rightEyeOuter.x + rightEyeInner.x) / 2,
    y: (rightEyeOuter.y + rightEyeInner.y) / 2,
  };

  // Angle of eye line from horizontal
  const dx = rightEyeCenter.x - leftEyeCenter.x;
  const dy = rightEyeCenter.y - leftEyeCenter.y;

  // Convert to degrees
  const roll = Math.atan2(dy, dx) * (180 / Math.PI);

  return roll;
}

/**
 * Estimate confidence in pose estimation
 *
 * Based on landmark availability and quality (z-depth values present)
 */
function estimateConfidence(landmarks: Point3D[]): number {
  // Check if z-coordinates are available (MediaPipe 3D mesh)
  const hasDepth = landmarks.some(p => p.z !== undefined && p.z !== null);

  // Check if all required landmarks are present
  const requiredIndices = Object.values(POSE_LANDMARKS);
  const allPresent = requiredIndices.every(idx =>
    landmarks[idx] &&
    landmarks[idx].x !== undefined &&
    landmarks[idx].y !== undefined
  );

  if (!allPresent) return 0.3; // Low confidence if missing landmarks
  if (!hasDepth) return 0.6;   // Medium confidence without depth
  return 0.9;                  // High confidence with full 3D data
}

/**
 * Check if pose is significantly non-frontal
 *
 * Returns true if face requires normalization before comparison
 */
export function isNonFrontal(pose: FacePose, threshold = 15): boolean {
  return (
    Math.abs(pose.yaw) > threshold ||
    Math.abs(pose.pitch) > threshold ||
    Math.abs(pose.roll) > threshold
  );
}

/**
 * Compute angular distance between two poses
 *
 * Returns total rotation difference in degrees
 */
export function poseAngularDistance(poseA: FacePose, poseB: FacePose): number {
  const yawDiff = Math.abs(poseA.yaw - poseB.yaw);
  const pitchDiff = Math.abs(poseA.pitch - poseB.pitch);
  const rollDiff = Math.abs(poseA.roll - poseB.roll);

  // Euclidean distance in angle space
  return Math.sqrt(yawDiff ** 2 + pitchDiff ** 2 + rollDiff ** 2);
}

/**
 * Format pose for display/logging
 */
export function formatPose(pose: FacePose): string {
  const yaw = pose.yaw >= 0 ? `right ${pose.yaw.toFixed(1)}°` : `left ${Math.abs(pose.yaw).toFixed(1)}°`;
  const pitch = pose.pitch >= 0 ? `up ${pose.pitch.toFixed(1)}°` : `down ${Math.abs(pose.pitch).toFixed(1)}°`;
  const roll = pose.roll >= 0 ? `CW ${pose.roll.toFixed(1)}°` : `CCW ${Math.abs(pose.roll).toFixed(1)}°`;

  return `yaw: ${yaw}, pitch: ${pitch}, roll: ${roll}`;
}

/**
 * Normalize landmarks to frontal pose
 *
 * Applies inverse rotation to align face to canonical frontal view (yaw=0, pitch=0, roll=0).
 * This reduces comparison errors when input photos are taken at different angles.
 */
export function normalizeLandmarksToFrontal(
  landmarks: Point3D[],
  pose: FacePose
): Point3D[] {
  // Skip normalization if already approximately frontal
  if (!isNonFrontal(pose, 3)) {
    return landmarks;
  }

  // Compute face center for rotation origin
  const center = computeCentroid(landmarks);

  // Convert Euler angles to rotation matrix (inverse rotation to frontalize)
  const rotationMatrix = eulerToRotationMatrix(
    -pose.yaw,
    -pose.pitch,
    -pose.roll
  );

  // Apply rotation to each landmark
  return landmarks.map((lm) => {
    // Translate to origin
    const centered = {
      x: lm.x - center.x,
      y: lm.y - center.y,
      z: (lm.z ?? 0) - (center.z ?? 0),
    };

    // Apply rotation
    const rotated = applyRotation(centered, rotationMatrix);

    // Translate back
    return {
      x: rotated.x + center.x,
      y: rotated.y + center.y,
      z: (rotated.z ?? 0) + (center.z ?? 0),
    };
  });
}

/**
 * Compute centroid of landmarks
 */
function computeCentroid(landmarks: Point3D[]): Point3D {
  const sum = landmarks.reduce(
    (acc, lm) => ({
      x: acc.x + lm.x,
      y: acc.y + lm.y,
      z: (acc.z ?? 0) + (lm.z ?? 0),
    }),
    { x: 0, y: 0, z: 0 }
  );

  const n = landmarks.length;
  return {
    x: sum.x / n,
    y: sum.y / n,
    z: (sum.z ?? 0) / n,
  };
}

/**
 * Convert Euler angles (degrees) to 3D rotation matrix
 *
 * Rotation order: Rz(roll) * Rx(pitch) * Ry(yaw)
 * Standard Y-X-Z Euler angle convention for facial pose.
 */
function eulerToRotationMatrix(
  yawDeg: number,
  pitchDeg: number,
  rollDeg: number
): number[][] {
  // Convert to radians
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const roll = (rollDeg * Math.PI) / 180;

  // Precompute trig values
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);

  // Combined rotation matrix: R = Rz(roll) * Rx(pitch) * Ry(yaw)
  // Calculated as: Rz * Rx * Ry where:
  //   Ry = rotation around Y axis (yaw - left/right head turn)
  //   Rx = rotation around X axis (pitch - up/down head tilt)
  //   Rz = rotation around Z axis (roll - head tilt clockwise/counterclockwise)
  return [
    [
      cy * cr,
      sy * sp * cr - cp * sr,
      sy * cp * cr + sp * sr,
    ],
    [
      cy * sr,
      sy * sp * sr + cp * cr,
      sy * cp * sr - sp * cr,
    ],
    [
      -sy,
      cy * sp,
      cy * cp,
    ],
  ];
}

/**
 * Apply rotation matrix to a 3D point
 */
function applyRotation(
  point: Point3D,
  matrix: number[][]
): Point3D {
  return {
    x: matrix[0][0] * point.x + matrix[0][1] * point.y + matrix[0][2] * (point.z ?? 0),
    y: matrix[1][0] * point.x + matrix[1][1] * point.y + matrix[1][2] * (point.z ?? 0),
    z: matrix[2][0] * point.x + matrix[2][1] * point.y + matrix[2][2] * (point.z ?? 0),
  };
}
