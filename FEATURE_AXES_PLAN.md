# Feature Axes Implementation Plan

## Status: ✅ COMPLETE (Phases 1-6)
All 8 morphological feature categories implemented with 20+ measurement axes. System now analyzes eyes, brows, nose, mouth, cheeks, jaw, forehead, and face shape with detailed axis-by-axis comparisons and natural language narratives.

## Overview
Detailed axis-based feature analysis for facial comparison, building on existing landmark detection and segmentation.

## Complete Feature Specification

### Eyes 👁️
| Axis | Categories | Measurement Method | Landmarks |
|------|-----------|-------------------|-----------|
| Canthal tilt | negative, neutral, positive | Angle between inner/outer corners | 133 (inner L), 263 (inner R), 33 (outer L), 362 (outer R) |
| Eye size/aperture | narrow, average, wide | Vertical opening height | 159-145 (L height), 386-374 (R height) |
| Interocular distance | close-set, balanced, wide-set | Distance between eye centers / face width | Eye centers, jaw width |
| Eyelid exposure | monolid, partial crease, deep crease | Upper lid visibility ratio | Upper lid landmarks vs iris |
| Scleral show | none, mild, pronounced | Lower sclera visibility | Lower lid vs iris bottom |
| Eyebrow-eye distance | low, average, high | Vertical gap brow-to-lid | Brow bottom to upper lid top |

### Eyebrows 🔺
| Axis | Categories | Measurement Method | Landmarks |
|------|-----------|-------------------|-----------|
| Shape | straight, arched, rounded, angular, peaked | Curvature analysis (PCA or arc height/width) | FEATURE_OUTLINES.brows |
| Thickness | thin, medium, thick | Vertical height of segmentation mask | Segmentation classes 6, 7 |
| Length | short, proportional, extended | Horizontal span vs eye width | Brow endpoints vs eye width |
| Density | sparse, uniform, dense | Mask coverage ratio | Segmentation pixel density |
| Position | high-set, mid-set, low-set | Vertical offset from orbital rim | Brow center Y vs eye center Y |

### Nose 👃
| Axis | Categories | Measurement Method | Landmarks |
|------|-----------|-------------------|-----------|
| Width | narrow, average, broad | Alar width vs face width | 94-331 (alar width) |
| Bridge contour | flat, straight, convex, concave | Curvature of bridge landmarks | 6, 168, 197 (bridge points) |
| Nasal tip projection | retracted, balanced, prominent | Z-depth of tip vs face plane | 1 (tip), 6 (bridge) |
| Nostril visibility | none, partial, full | Visible nostril area | Segmentation class 2 + landmark area |
| Base width/flare | tight, moderate, wide | Alar base spread vs bridge | 94-331 vs 6-168 |

### Mouth/Lips 💋
| Axis | Categories | Measurement Method | Landmarks |
|------|-----------|-------------------|-----------|
| Lip fullness | thin, average, full | Upper/lower lip height | 0-13 (upper), 14-17 (lower) |
| Cupid's bow definition | subtle, defined, pronounced | Central curve depth | 37, 0, 267 (upper lip central) |
| Lip corner orientation | neutral, upturned, downturned | Corner angle vs horizontal | 61-291 (corners) vs 0 (center) |
| Philtrum length | short, average, long | Vertical distance | 168 (below nose) to 0 (upper lip) |
| Mouth width | narrow, balanced, wide | Corner distance vs face width | 61-291 vs face width |

### Cheeks/Midface 🍑
| Axis | Categories | Measurement Method | Landmarks |
|------|-----------|-------------------|-----------|
| Zygomatic prominence | flat, moderate, high | Cheekbone projection (Z-depth) | 234, 454 (cheekbones) |
| Malar fat volume | low, medium, high | Cheek segmentation coverage | Segmentation class 1 (skin) in malar region |
| Nasolabial fold depth | shallow, average, deep | Fold landmark depth | 36, 266 (nasolabial fold) |
| Cheekbone height | low, mid, high | Vertical position vs eye-chin | 234, 454 Y-position |

### Jaw/Chin 🦴
| Axis | Categories | Measurement Method | Landmarks |
|------|-----------|-------------------|-----------|
| Jaw width | narrow, balanced, wide | Gonion distance | 234-454 (gonion points) |
| Mandibular angle | steep, moderate, square | Angle at jaw corner | 234 (L gonion), 152 (chin), 454 (R gonion) |
| Chin projection | recessed, neutral, prominent | Forward projection (Z-depth) | 152 (chin) vs face plane |
| Chin width | narrow, average, broad | Horizontal span at chin | Jaw landmarks near chin |
| Symmetry | centered, slight deviation | Left-right comparison | Landmark X-coordinates vs midline |

### Forehead 🧠
| Axis | Categories | Measurement Method | Landmarks |
|------|-----------|-------------------|-----------|
| Height | short, medium, tall | Vertical distance hairline-to-brow | 10 (forehead top) to brow center |
| Contour | flat, slightly convex, rounded | Curvature of forehead landmarks | 10, 67, 297 (forehead arc) |
| Frontal bossing | minimal, moderate, strong | Prominence of brow ridge area | Z-depth of brow ridge landmarks |
| Hairline shape | straight, widow's peak, M-shaped, rounded | Contour classification | Forehead top landmarks 10, 338, 109 |

### Face Shape (Global) 🔷
| Axis | Categories | Measurement Method | Landmarks |
|------|-----------|-------------------|-----------|
| Overall ratio | round, oval, oblong, square, heart, diamond | Face length / width ratio + shape analysis | Face bounding box measurements |
| Symmetry index | percentage (0-100%) | Left-right landmark deviation | All landmarks mirrored comparison |
| Facial thirds balance | upper/mid/lower proportionality | Ratio of forehead:midface:lower face heights | Hairline to brow, brow to nose base, nose base to chin |

### Forehead 🧠
| Axis | Categories | Measurement Method | Landmarks |
|------|-----------|-------------------|-----------|
| Height | short, medium, tall | Vertical distance hairline to brows | Top of face (10, 151) to brow center |
| Contour | flat, slightly convex, rounded | Curvature of forehead landmarks | 10, 151, 9 (forehead vertical profile) |
| Frontal bossing | minimal, moderate, strong | Prominence of frontal bone | Z-depth of forehead landmarks |
| Hairline shape | straight, widow's peak, M-shaped, rounded | Central hairline contour analysis | Hair segmentation (class 13) boundary or top landmarks |

### Face Shape (global metrics) 🌐
| Axis | Categories | Measurement Method | Landmarks |
|------|-----------|-------------------|-----------|
| Overall ratio | round, oval, oblong, square, heart, diamond | Length/width ratio + jaw/forehead ratio | Face height / jaw width, jaw width / forehead width |
| Symmetry index | percentage similarity left/right | Mirror-compare left/right landmark distances | All landmarks reflected across midline |
| Facial thirds balance | upper/mid/lower proportionality | Hairline-to-brow / brow-to-nose / nose-to-chin ratios | Key vertical landmarks: hairline, brows, nose base, chin |

### Similarity Metrics (cross-subject) 📊
| Metric | Description | Calculation Method |
|--------|-------------|-------------------|
| Shared axis values | "Both share positive canthal tilt" | Count matching axis categories |
| Dimensional comparison | "Subject A's face is 8% longer" | Relative difference in key measurements |
| Morphological congruence | "High morphological congruence" | Overall similarity score from all axes |
| Feature-specific agreement | "Eyes and nose are similar; jaw differs" | Per-feature agreement summary |

## Additional Recommended Axes

Based on anthropometric literature and common facial analysis, these axes would complement the specification:

### Ears 👂 (Optional - often occluded)
| Axis | Categories | Measurement Method | Landmarks |
|------|-----------|-------------------|-----------|
| Ear size | small, average, large | Vertical height | Segmentation class 8, 9 (l_ear, r_ear) |
| Ear position | low-set, mid-set, high-set | Vertical alignment vs eye-chin midpoint | Ear landmarks Y-position |
| Ear angle | flat, moderate, protruding | Angle from head plane | Z-depth or segmentation analysis |

### Neck 🦢 (Optional)
| Axis | Categories | Measurement Method | Landmarks |
|------|-----------|-------------------|-----------|
| Neck length | short, average, long | Chin-to-shoulder distance | Segmentation class 17 (neck) |
| Neck width | narrow, average, wide | Horizontal span | Segmentation class 17 width |

### Hair 💇 (Optional - highly variable)
| Axis | Categories | Measurement Method | Landmarks |
|------|-----------|-------------------|-----------|
| Hairline position | receding, normal, low | Vertical position vs face height | Segmentation class 13 (hair) top boundary |
| Hair volume | thin, average, full | Segmentation coverage | Segmentation class 13 area |

**Note**: These optional axes depend heavily on segmentation quality and may be omitted in Phase 1.

## Implementation Phases

### Phase 1: Landmark-Based Core (Week 1)
**Focus**: Implement reliable geometric measurements that don't require segmentation

**Files to Create**:
- `web/src/lib/feature-axes.ts` - Measurement extraction functions
- `web/src/lib/axis-classifiers.ts` - Category classification with thresholds
- `web/src/__tests__/feature-axes.test.ts` - Unit tests for measurements

**Features to Implement**:
- Eyes: canthal tilt, eye size, interocular distance
- Nose: width, bridge contour, tip projection
- Mouth: lip fullness, Cupid's bow, corner orientation, philtrum length, mouth width
- Jaw: width, mandibular angle, chin projection, chin width, symmetry

**Deliverable**: Functions that take landmarks and return axis values

```typescript
// Example API
interface FeatureMeasurements {
  eyes: {
    canthalTilt: number; // degrees
    eyeSize: number; // mm or normalized units
    interocularDistance: number; // ratio
  };
  // ... other features
}

function extractFeatureMeasurements(
  landmarks: Point[],
  leftEye: Point,
  rightEye: Point
): FeatureMeasurements;
```

### Phase 2: Classification & Thresholds (Week 1-2)
**Focus**: Map measurements to categorical descriptors

**Files to Create**:
- `web/src/lib/axis-classifiers.ts` - Threshold-based classification
- `web/src/__tests__/axis-classifiers.test.ts` - Classification tests

**Thresholds Strategy**:
- Use anthropometric literature for base values
- Test on diverse face samples
- Adjust thresholds to match human perception

**Deliverable**: Classifier functions with validated thresholds

```typescript
interface AxisClassification {
  axis: string;
  value: string; // category name
  confidence: number; // 0-1
  rawMeasurement: number;
}

function classifyFeatures(
  measurements: FeatureMeasurements
): Record<string, AxisClassification[]>;
```

### Phase 3: Comparison & Narrative (Week 2)
**Focus**: Compare two faces and generate descriptive text

**Files to Create**:
- `web/src/lib/feature-comparisons.ts` - Comparison logic
- `web/src/lib/feature-narratives.ts` - Text generation
- `web/src/__tests__/feature-comparisons.test.ts`
- `web/src/__tests__/feature-narratives.test.ts`

**Deliverable**: Narrative output for all axes

```typescript
interface FeatureComparison {
  feature: string; // "eyes"
  axes: AxisComparison[];
  summary: string;
}

interface AxisComparison {
  axis: string;
  valueA: string;
  valueB: string;
  agreement: boolean;
  text: string;
}

function compareFeatures(
  featuresA: FeatureMeasurements,
  featuresB: FeatureMeasurements
): FeatureComparison[];
```

### Phase 4: Segmentation Enhancement (Week 3)
**Focus**: Add segmentation-dependent measurements

**Features to Add**:
- Eyebrows: thickness, density (requires masks)
- Nose: nostril visibility (requires masks)
- Eyes: scleral show (requires iris detection or masks)
- Cheeks: malar fat volume (requires masks)

**Graceful Degradation**: If segmentation unavailable, omit these axes or use landmark approximations

### Phase 5: Worker Integration (Week 3)
**Focus**: Integrate into existing worker pipeline

**Files to Modify**:
- `web/src/workers/analyze.worker.ts` - Add feature extraction
- `web/src/workers/types.ts` - Add result types

**Flow**:
```typescript
// In worker, after landmark detection
const measurementsA = extractFeatureMeasurements(ptsA, leftA, rightA);
const measurementsB = extractFeatureMeasurements(ptsB, leftB, rightB);

const classificationsA = classifyFeatures(measurementsA);
const classificationsB = classifyFeatures(measurementsB);

const comparisons = compareFeatures(measurementsA, measurementsB);
const narratives = generateFeatureNarratives(comparisons);

post({
  type: 'RESULT',
  // ... existing fields
  featureComparisons: comparisons,
  featureNarratives: narratives,
});
```

### Phase 6: UI Implementation (Week 4)
**Focus**: Display detailed feature analysis in collapsible panels

**Files to Create**:
- `web/src/components/FeatureDetailPanel.tsx` - Expandable feature sections
- `web/src/components/AxisComparison.tsx` - Individual axis display

**UI Structure**:
```
Results Panel
├── Overall Similarity: 78%
├── Regional Scores (existing)
│   ├── eyes: 85% — nearly identical eye shape
│   └── nose: 70% — similar nose structure
└── Detailed Analysis (NEW)
    ├── 👁️ Eyes [expandable]
    │   ├── Canthal tilt: positive ↔ neutral
    │   ├── Eye size: average ↔ average ✓
    │   └── Interocular distance: balanced ↔ balanced ✓
    ├── 🔺 Eyebrows [expandable]
    │   └── ...
    └── 👃 Nose [expandable]
```

## Testing Strategy

### Unit Tests
- Each measurement function with known landmark positions
- Each classifier with boundary cases
- Each narrative generator with various combinations

### Integration Tests
- Full pipeline from landmarks → narratives
- Edge cases: extreme measurements, missing data
- Graceful degradation without segmentation

### Visual QA
- Test on diverse face samples
- Validate axis classifications match human judgment
- Verify narrative descriptions are accurate

## Success Criteria
- ✅ All axes extract valid measurements from landmarks
- ✅ Classifications match human perception (>90% agreement)
- ✅ Narratives are clear and grammatically correct
- ✅ System gracefully handles missing segmentation data
- ✅ Performance: <100ms additional processing per face
- ✅ All tests passing (target: 50+ unit tests)
- ✅ UI is intuitive and expandable

## Future Enhancements
- 3D-aware measurements using Z-depth
- Population-percentile classifications
- Confidence scoring for each axis
- Custom axis weighting for similarity
- Export detailed analysis as PDF/JSON

## Upcoming Enhancement: Jaw Labeling Reliability
**Goal**: Replace noisy landmark-only jaw metrics with a segmentation-informed synthetic jaw curve that remains WebGL-friendly and works without new model training.

### A. Synthetic Jaw From Existing Masks
- Normalize faces in the same coordinate space used by FaceMesh before processing logits.
- Derive a lower-face band from mandible landmarks plus a narrow strip below them to bound marching-squares search.
- From SegFormer logits expose `p(face_skin)` and `p(non_face) = p(hair ∪ background ∪ neck)` and locate the zero crossing of `p_face_skin − p_non_face` between jaw-angle landmarks to obtain a crisp polyline.
- Post-process the polyline with Chaikin or Savitzky–Golay smoothing, enforce monotonicity along the arc, and snap endpoints toward the near-ear landmark cluster.
- Export a thin polygon plus derived measurements (mandibular width, mandibular angle, chin projection) as the synthetic jaw descriptor.

### B. Landmark Prior + Confidence Blending
- Treat the existing landmark jaw curve as the base spline.
- Measure offsets from the landmark curve to the iso-contour inside a narrow normal band and compute blend weights via `α = clamp((p_skin − p_neck)/τ, 0..1)`.
- Blend curves per vertex and return both the fused polyline and an overall confidence score for downstream fallbacks.

### C. Logit Cleanup & Error Guards
- Inside the face ROI lower neck logits dramatically (e.g., subtract 1e6) to prevent neck bleed into cheeks/chin.
- Drop neck-connected components that appear above the jaw search band.

### Wiring Targets
- `web/src/lib/transformers-parsing-adapter.ts`: expose raw logits for face/skin/neck classes rather than only binary masks.
- `web/src/workers/analyze.worker.ts`: add `computeJawFromMasks()` to build the band, extract the iso-contour, blend with landmarks, and emit `{ polyline, confidence }`.
- `web/src/lib/feature-axes.ts`: consume the synthetic jaw metrics for width/angle/face-height calculations; fall back to landmarks when confidence < τ.
- `web/src/lib/overlay-hit-test.ts`: register the synthetic jaw polygon so overlays and tooltips remain interactive.

### Validation Checklist
- Hand-label ~50 reference jaw polylines (6–8 points each) for evaluation.
- Track mean surface distance between landmark-only and synthetic curves (lower is better).
- Measure stability under slight scale/flip/brightness perturbations (report standard deviation in pixels).
- Compare downstream metric variance (mandibular width/angle) and disagreement with human-provided tags to confirm improvements.
