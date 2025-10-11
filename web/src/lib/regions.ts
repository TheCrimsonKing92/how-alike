// Minimal region indices for MediaPipe 468 mesh (approximate picks for MVP)
// Using common landmark indices known for eyes, nose, mouth from MediaPipe FaceMesh.
// These subsets provide a coarse but stable regional similarity signal.

// Expanded landmark sets for denser region coverage (MediaPipe FaceMesh indices)
// Sources: MediaPipe FaceMesh landmark map and refinement configs.
export const REGION_INDICES: Record<string, number[]> = {
  // Eyes: eyelid rings only (no brow halos) to avoid overlap with brows
  eyes: [
    // Left eye ring
    33, 7, 163, 144, 145, 153, 154, 155, 133,
    246, 161, 160, 159, 158, 157, 173,
    // Right eye ring
    263, 249, 390, 373, 374, 380, 381, 382, 362,
    466, 388, 387, 386, 385, 384, 398,
  ],
  // Brows: eyebrow inner/outer contours
  brows: [
    // Left brow outer + inner
    156, 70, 63, 105, 66, 107, 55, 193,
    35, 124, 46, 53, 52, 65,
    // Right brow outer + inner
    383, 300, 293, 334, 296, 336, 285, 417,
    265, 353, 276, 283, 282, 295,
  ],
  // Nose: broaden to bridge + tip vicinity
  nose: [1, 2, 4, 5, 6, 98, 97, 168, 195, 197, 419, 279, 309, 19, 94, 331],
  // Mouth: full lips refinement set (outer/inner/semi rings)
  mouth: [
    61,146,91,181,84,17,314,405,321,375,291, // lower outer
    185,40,39,37,0,267,269,270,409,          // upper outer
    78,95,88,178,87,14,317,402,318,324,308,  // lower inner
    191,80,81,82,13,312,311,310,415,         // upper inner
    76,77,90,180,85,16,315,404,320,307,306,  // lower semi-outer
    184,74,73,72,11,302,303,304,408,         // upper semi-outer
    62,96,89,179,86,15,316,403,319,325,292,  // lower semi-inner
    183,42,41,38,12,268,271,272,407,         // upper semi-inner
  ],
  // Jawline: lower face contour from ear->chin->ear (reduced to avoid cheek spill)
  jaw: [
    127, 234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152,
    377, 400, 378, 365, 397, 288
  ],
};

// Minimal subsets to locate eye centers (left/right)
export const LEFT_EYE_CENTER_INDICES = [33, 133, 159, 145];
export const RIGHT_EYE_CENTER_INDICES = [362, 263, 386, 374];

// Explicit ring orders to derive upper-lid arcs robustly
export const LEFT_EYE_RING = [
  33, 7, 163, 144, 145, 153, 154, 155, 133, 246, 161, 160, 159, 158, 157, 173,
];
export const RIGHT_EYE_RING = [
  263, 249, 390, 373, 374, 380, 381, 382, 362, 466, 388, 387, 386, 385, 384, 398,
];

// Ordered feature outlines (closed loops unless noted)
// These are chosen to better match the visual contours than convex/concave hulls
export const FEATURE_OUTLINES: Record<string, number[][]> = {
  // Eyes: outer rings, left then right
  eyes: [
    [33, 7, 163, 144, 145, 153, 154, 155, 133, 246, 161, 160, 159, 158, 157, 173],
    [263, 249, 390, 373, 374, 380, 381, 382, 362, 466, 388, 387, 386, 385, 384, 398],
  ],
  // Brows: smooth arc per side (kept as a thin closed band for hover hit-testing)
  brows: [
    [70, 63, 105, 66, 107, 55, 193, 35, 124],
    [300, 293, 334, 296, 336, 285, 417, 265, 353],
  ],
  // Mouth: outer and inner loops
  mouth: [
    // Outer loop approximate (left corner 61 -> bottom -> right corner 291 -> top -> back)
    [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185],
    // Inner loop approximate
    [78,95,88,178,87,14,317,402,318,324,308,415,310,311,312,13,82,81,80,191],
  ],
  // Nose: denser open polylines for nostril/alar arc and bridge
  // Nostril/alar arc (open): left alar -> near rim -> tip -> near rim -> right alar
  nose: [ [94, 19, 98, 4, 2, 309, 331], [168, 6, 197] ],
  // Jaw: ordered contour from left to right (still provided for fallback)
  jaw: [ [127, 234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 365, 397, 288] ],
};

// Lower-face landmark subset for jaw concave hull (ear/cheek to chin to ear)
export const LOWER_FACE_INDICES: number[] = [
  127, 234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152,
  377, 400, 378, 365, 397, 288,
];
