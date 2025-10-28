# Anthropometric Standards for Feature Measurement

**Date**: 2025-10-26
**Source**: OpenAI GPT-5 consultation on facial anthropometry

## Overview

This document captures anthropometrically correct measurement strategies for facial features, based on consultation with OpenAI about proper standards and robust measurement approaches.

**Key principle**: Measurements should align with how humans visually perceive facial features, not arbitrary geometric ratios.

---

## 1. Eye Spacing (Wide-Set vs Close-Set)

### The Problem with Our Original Approach

**What we used:**
- IPD (interpupillary distance) / face width ratio
- Thresholds: <0.38 close, 0.38-0.42 balanced, >0.42 wide

**Why this is wrong:**
1. **IPD depends on gaze** - pupils shift with eye movement, making measurement unstable in 2D photos
2. **Face width is ambiguous** - jaw, cheekbones, temples all have different widths
3. **Not perceptually aligned** - humans don't judge eye spacing relative to jaw width

### The Anthropometrically Correct Approach

**What humans actually perceive:** The spacing between eyes relative to eye size

**Two robust metrics:**

#### Option A: Intercanthal-to-Eye-Width Ratio (RECOMMENDED)

**Definition:**
```
ICD = distance between inner canthi (endocanthion–endocanthion)
Eye width = palpebral fissure width (outer–inner canthus)
Ratio = ICD / mean(left eye width, right eye width)
```

**Why this works:**
- Mirrors the intuitive "distance between eyes ≈ one eye width" rule
- Stable to gaze direction (canthi don't move)
- Matches human visual perception
- Consistent across demographics

**Thresholds (starting points, calibrate on labeled data):**
- **< 0.9** → close-set
- **0.9 – 1.1** → balanced/average
- **> 1.1** → wide-set

**MediaPipe landmarks:**
- Inner canthi: 133 (subject's right eye), 362 (subject's left eye)
- Outer canthi: 33 (subject's right eye), 263 (subject's left eye)

**Implementation:**
```typescript
function classifyEyeSpacing(landmarks: Point[]): AxisClassification {
  // ICD: inner canthus to inner canthus
  const icd = distance3D(landmarks[133], landmarks[362]);

  // Eye widths: outer to inner canthus
  const leftEyeWidth = distance3D(landmarks[33], landmarks[133]);
  const rightEyeWidth = distance3D(landmarks[263], landmarks[362]);
  const meanEyeWidth = (leftEyeWidth + rightEyeWidth) / 2;

  const ratio = icd / meanEyeWidth;

  // Classification
  if (ratio < 0.9) {
    return { value: 'close-set', confidence: Math.min(1, (0.9 - ratio) / 0.2) };
  } else if (ratio > 1.1) {
    return { value: 'wide-set', confidence: Math.min(1, (ratio - 1.1) / 0.2) };
  } else {
    return { value: 'balanced', confidence: 1 - Math.abs(ratio - 1.0) / 0.1 };
  }
}
```

#### Option B: Biocular-to-Bizygomatic Ratio

**Definition:**
```
Biocular = outer canthus to outer canthus (exocanthion–exocanthion)
Bizygomatic = cheekbone width (zygion–zygion)
Ratio = Biocular / Bizygomatic
```

**Why this works:**
- More "anthropometric" (uses bony landmarks)
- Stable to gaze and expression
- Anchors eye spacing to midface skeletal structure

**Thresholds (vary by demographics, calibrate per dataset):**
- **< 0.64** → close-set
- **0.64 – 0.73** → balanced
- **> 0.73** → wide-set

**MediaPipe landmarks:**
- Outer canthi: 33, 263
- Bizygomatic proxies: 234, 454 (lateral cheekbone points)

**Note**: This metric requires accurate bizygomatic landmarks. May be less reliable if MediaPipe's 234/454 don't actually represent zygomatic width.

### What NOT to Use

❌ **IPD / face width** - Wrong metric entirely
- IPD varies with gaze
- "Face width" is ambiguous (jaw? cheeks? temples?)
- Doesn't match human perception
- Our observed 0.48-0.52 ratios on real faces simply showed the canonical model wasn't a good reference

---

## 2. Brow Arch Shape

### The Problem with Our Original Approach

**What we used:**
- Find peak (min Y), measure (baseline - peak) / brow width
- Threshold: >0.15 for "arched"

**Why this produced incorrect results:**
1. **Threshold too high** - Real arched brows measure 0.08-0.12 with brow-width normalization
2. **Wrong normalization** - Visual perception relates arch to eye size, not brow length
3. **No curve smoothing** - Raw landmarks have jitter/noise
4. **Peak search too broad** - Can pick endpoint artifacts

### The Anthropometrically Correct Approach

**What humans actually perceive:** The prominence of the brow's highest point relative to a baseline

**Robust measurement pipeline:**

#### 1. Pre-Processing

**Face alignment:**
```typescript
// Remove roll using eye corners
// Optionally frontalize to reduce yaw/pitch effects
// This ensures measurements are in a consistent coordinate frame
```

**Curve smoothing:**
```typescript
// Don't use raw landmarks - they have noise
// Fit a cubic B-spline or Savitzky-Golay filter over x-ordered points
// This gives a clean brow curve for measurement
```

#### 2. Landmark Selection

**Define endpoints:**
- **Head** (medial): Most medial brow point (closest to nasal root)
- **Tail** (lateral): Most lateral brow point

**Find apex (peak):**
- **Constrain search** to central 30-85% of arc length
- This avoids picking endpoint artifacts or outliers
- Find point with maximum perpendicular distance above the chord

**Why constraint is important:**
```typescript
// Bad: searches all landmarks
const peak = allBrowPoints.reduce((h, p) => p.y < h.y ? p : h);
// Can pick outliers at brow head/tail

// Good: searches only central region
const arcLength = calculateArcLength(browPoints);
const candidates = browPoints.filter(p => {
  const dist = distanceAlongCurve(head, p);
  const ratio = dist / arcLength;
  return ratio >= 0.30 && ratio <= 0.85;
});
const peak = candidates.reduce((h, p) => p.y < h.y ? p : h);
```

#### 3. Measurement

**Primary metric: Peak-to-Chord Height**
```
H = perpendicular distance from apex to head–tail chord
```

**Remember Y-direction:**
- Y increases downward in screen coordinates
- Arched brow: peak.y < baseline.y
- Height = baseline.y - peak.y (positive for arched)

#### 4. Normalization

**Option A: Eye-Width Normalized (RECOMMENDED)**
```
Hn_eye = H / mean(palpebral fissure width)
```

**Thresholds:**
- **< 0.10** → straight/flat
- **0.10 – 0.18** → soft-arched
- **> 0.18** → pronounced arch

**Why eye width:** Visual perception judges brow arch relative to eye size, not brow length.

**Option B: Brow-Width Normalized (Alternative)**
```
Hn_brow = H / brow_chord_length
```

**Thresholds (if using this):**
- **< 0.08** → straight
- **0.08 – 0.12** → moderate
- **> 0.12** → arched

**Note**: These are MUCH LOWER than our original 0.15 threshold. Real arched brows typically measure 0.08-0.12 with brow-width normalization.

#### 5. Additional Quality Metrics

**Apex lateral position:**
```
p = distance(head → apex) / chord_length
```
- Arched brows typically have apex at p ≈ 0.6–0.75
- Can use to boost/reduce confidence

**Curvature at apex:**
```
κ = curvature from spline fit at apex point
```
- Higher curvature = more arched
- Can distinguish arched from merely "sloped"

#### 6. Quality Guards

**Expression gating:**
- Brow raise lowers Y values globally
- If mean brow elevation is abnormal, flag as uncertain
- Focus on shape (curvature + relative peak) rather than absolute height

**Pose gating:**
- Reject frames with |yaw| or |pitch| > ~15°
- Squinting occludes reference landmarks

**Implementation example:**
```typescript
function measureBrowArch(browPoints: Point[], eyeWidth: number): {
  height: number;
  ratio: number;
  apexPosition: number;
  curvature: number;
} {
  // 1. Smooth curve
  const smoothed = fitSpline(browPoints);

  // 2. Find endpoints
  const head = smoothed.reduce((min, p) => p.x < min.x ? p : min);
  const tail = smoothed.reduce((max, p) => p.x > max.x ? p : max);

  // 3. Compute chord
  const chordLength = distance(head, tail);
  const baselineY = (head.y + tail.y) / 2;

  // 4. Find apex in central region
  const arcLength = calculateArcLength(smoothed);
  const candidates = smoothed.filter(p => {
    const dist = distanceAlongCurve(head, p, smoothed);
    const ratio = dist / arcLength;
    return ratio >= 0.30 && ratio <= 0.85;
  });

  const apex = candidates.reduce((highest, p) =>
    p.y < highest.y ? p : highest
  );

  // 5. Measure perpendicular height
  const height = perpendicularDistance(apex, head, tail);

  // 6. Normalize by eye width
  const ratio = height / eyeWidth;

  // 7. Additional metrics
  const apexDist = distanceAlongCurve(head, apex, smoothed);
  const apexPosition = apexDist / arcLength;
  const curvature = computeCurvature(smoothed, apex);

  return { height, ratio, apexPosition, curvature };
}
```

---

## 3. General Best Practices

### Use 3D Distances

**MediaPipe provides Z coordinates - use them!**

```typescript
// Bad: 2D distance only
function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

// Good: 3D distance (more robust to head rotation)
function distance3D(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.hypot(dx, dy, dz);
}
```

**Why 3D is better:**
- Robust to head tilt toward/away from camera
- Accurate regardless of perspective effects
- "Essentially free" with MediaPipe landmarks
- Far more stable across varied photo angles

### Face Alignment

**Minimum: Remove roll**
```typescript
// Rotate face so eye corners are horizontal
// This ensures Y measurements (vertical) are meaningful
```

**Better: Frontalization**
```typescript
// Use 3D landmarks to compute canonical view
// Projects face to frontal orientation
// Reduces yaw/pitch effects
```

### Prefer Stable Anatomical Landmarks

**Good landmarks:**
- Eye corners (canthi) - stable, anatomically defined
- Bony landmarks (zygomatic, gonion) - less affected by expression
- Nasal landmarks - stable reference points

**Bad landmarks:**
- Pupils/irises - vary with gaze
- Lip boundaries - vary with expression
- Skin features - affected by lighting/makeup

### Quality Gating

**Gate measurements by pose:**
```typescript
if (Math.abs(yaw) > 15 || Math.abs(pitch) > 15) {
  return { value: 'uncertain', confidence: 0 };
}
```

**Gate by expression:**
```typescript
if (eyeApertureRatio < 0.5) { // squinting
  return { value: 'uncertain', confidence: 0 };
}
```

---

## 4. Threshold Calibration Process

### DO NOT use the canonical model for thresholds

**The canonical FaceMesh model:**
- ✓ Good for: testing code stability, fixture data
- ✗ Bad for: setting classification boundaries, defining "normal"
- Has atypical proportions (jaw wider than cheeks, etc.)
- Is a geometric tool, not an anthropometric reference

### Proper Calibration Workflow

1. **Collect diverse labeled dataset:**
   - Minimum 50-100 faces with human-labeled classifications
   - Include diverse: ages, sexes, ethnicities, face shapes
   - Use multiple raters, resolve disagreements

2. **Compute measurements on dataset:**
   ```typescript
   const measurements = labeledFaces.map(face => ({
     id: face.id,
     icdRatio: computeICDRatio(face.landmarks),
     browArch: computeBrowArch(face.landmarks),
     label: face.humanLabel // "wide-set", "balanced", etc.
   }));
   ```

3. **Analyze distributions:**
   ```typescript
   // Group by label, compute statistics
   const balanced = measurements.filter(m => m.label === 'balanced');
   const mean = average(balanced.map(m => m.icdRatio));
   const stdDev = stdev(balanced.map(m => m.icdRatio));

   // Set thresholds at boundaries between distributions
   ```

4. **Validate with confusion matrix:**
   ```typescript
   const predicted = measurements.map(m => classify(m.icdRatio));
   const actual = measurements.map(m => m.label);
   const accuracy = computeAccuracy(predicted, actual);
   ```

5. **Iterate and refine:**
   - Adjust thresholds to maximize agreement with human labels
   - Balance precision vs recall
   - Consider confidence scoring for borderline cases

### Starting Point Thresholds

**From OpenAI (anthropometric literature):**

**ICD/Eye-Width:**
- < 0.9 = close-set
- 0.9–1.1 = balanced
- \> 1.1 = wide-set

**Brow Arch (eye-width normalized):**
- < 0.10 = straight
- 0.10–0.18 = soft-arched
- \> 0.18 = pronounced

**Brow Arch (brow-width normalized):**
- < 0.08 = straight
- 0.08–0.12 = moderate
- \> 0.12 = arched

**These are starting points - calibrate on your specific dataset.**

---

## 5. Documentation Requirements

### Source Attribution

Every threshold should document its source:

```typescript
// Bad: No source
const THRESHOLD = 0.42;

// Good: Clear provenance
const WIDE_SET_THRESHOLD = 1.1;
// Source: Calibrated from 100 labeled faces (2025-10-26)
// Baseline from Farkas (1994) anthropometric norms
// Validated with 85% agreement vs human raters
```

### Calibration History

Maintain a log of threshold changes:

```markdown
## Threshold Calibration Log

### 2025-10-26: Initial ICD/eye-width calibration
- Method: ICD/mean(eye width)
- Dataset: 2 faces (Subject A, B) with visual assessment
- Thresholds: <0.9, 0.9-1.1, >1.1 (from literature)
- Accuracy: Pending validation

### Future: Expand calibration dataset
- Target: 100+ diverse labeled faces
- Include: Multiple ages, ethnicities, face shapes
- Validate: Inter-rater reliability, confusion matrix
```

---

## References

1. **OpenAI GPT-5 Consultation (2025-10-26)**
   - Anthropometric measurement strategies for 2D face analysis
   - ICD/eye-width ratio methodology
   - Brow arch measurement best practices

2. **Farkas, L. G. (1994). Anthropometry of the Head and Face (2nd ed.)**
   - Standard reference for facial anthropometry
   - Normative data for various populations

3. **MediaPipe FaceMesh Documentation**
   - 468-landmark model specification
   - Canonical face model purpose and limitations

---

## Summary: Key Changes Needed

### From Old Approach → New Approach

**Eye Spacing:**
- ❌ IPD / face width
- ✅ ICD / mean(eye width)
- ❌ Thresholds: <0.38, 0.38-0.42, >0.42
- ✅ Thresholds: <0.9, 0.9-1.1, >1.1

**Brow Arch:**
- ❌ Threshold: >0.15 for arched (brow-width normalized)
- ✅ Threshold: >0.08-0.10 for arched (brow-width) OR >0.10 for arched (eye-width)
- ✅ Add: curve smoothing, constrained peak search (30-85% of arc)
- ✅ Add: quality metrics (apex position, curvature)

**General:**
- ✅ Use 3D distances throughout (include Z coordinate)
- ✅ Document threshold sources and calibration process
- ✅ Separate testing (canonical model OK) from calibration (real faces required)

---

## Comprehensive Measurement Validation (2025-10-26)

After successfully implementing ICD/eye-width metric and empirically-calibrated brow thresholds, a comprehensive review of ALL facial measurements was conducted.

**Critical Finding**: IPD is being incorrectly used as a universal normalizer when it should not be. IPD varies with age/sex/ethnicity and has NO correlation with z-axis depth measurements.

**Complete findings documented in**: `MEASUREMENT_VALIDATION_2025-10-26.md`

**Summary**:
- ✅ **4 measurements correct**: Eye spacing, brow shape, canthal tilt, lip corner
- ❌ **12 measurements invalid**: Using IPD for z-depth or unrelated features
- ⚠️ **10 measurements need improvement**: Non-standard approaches or unclear definitions

**Key corrections needed**:
1. Eye size: IPD → eye width
2. Nose tip projection: Implement Goode ratio (clinical standard)
3. Lip fullness: IPD → mouth width
4. Chin projection: IPD → nasion vertical + face height
5. Brow position: IPD → eye width
6. Cupid's bow: IPD → philtral width
7. Philtrum length: IPD → face height
8. Forehead height: IPD → face height
9. Cheek prominence: IPD → face width/height
10. Jaw symmetry: Remove magic constant, use face width

**See `MEASUREMENT_VALIDATION_2025-10-26.md` for**:
- Detailed analysis of each measurement
- Priority rankings (HIGH/MEDIUM/LOW)
- Complexity assessments
- Four implementation options (A/B/C/D)
- Complete OpenAI consultation transcripts
