// Minimal region indices for MediaPipe 468 mesh (approximate picks for MVP)
// Using common landmark indices known for eyes, nose, mouth from MediaPipe FaceMesh.
// These subsets provide a coarse but stable regional similarity signal.

export const REGION_INDICES: Record<string, number[]> = {
  eyes: [33, 133, 362, 263, 159, 386, 145, 374],
  brows: [70, 63, 105, 66, 296, 334, 293, 300],
  nose: [1, 4, 6, 195, 168, 197, 5],
  mouth: [78, 308, 13, 14, 87, 317, 80, 81, 82, 312, 311, 310],
  jaw: [152, 172, 136, 150, 149, 176, 397, 365, 379, 400, 378, 402],
};

// Minimal subsets to locate eye centers (left/right)
export const LEFT_EYE_CENTER_INDICES = [33, 133, 159, 145];
export const RIGHT_EYE_CENTER_INDICES = [362, 263, 386, 374];
