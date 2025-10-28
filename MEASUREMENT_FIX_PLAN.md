# Feature Measurement Fix Plan

**Date**: 2025-10-26
**Status**: Ready for implementation

## Summary of Issues

Based on diagnostic testing with canonical face model and real sample images, two critical measurement errors have been identified and diagnosed:

1. **Interocular Distance**: Using jaw width (gonion) instead of bizygomatic width → false "wide-set" classifications
2. **Brow Shape**: Using wrong landmark grouping for arch measurement → inverted classifications

---

## Issue #1: Interocular Distance Classification

### Problem
Both test subjects classified as "wide-set" when they visually appear normal or close-set.

### Root Cause
```typescript
// feature-axes.ts:109-113
function faceWidth(landmarks: Point[]): number {
  const leftGonion = landmarks[LANDMARKS.leftGonion];   // 234
  const rightGonion = landmarks[LANDMARKS.rightGonion]; // 454
  return distance(leftGonion, rightGonion);
}
```

The gonion (jaw angle) is often NARROWER than true facial width at cheekbone level, especially in:
- Oval/heart-shaped faces
- Tapered jaws
- Prominent cheekbones

### Diagnostic Evidence
Canonical face alternative width measurements:
- Gonion (234/454): 0.9898 (widest - used currently)
- Mid-cheek (116/345): 0.8350
- Outer eye corners (33/263): 0.5742

Real faces with tapered jaws: gonion < bizygomatic → IPD/narrow_denominator = high ratio → false "wide-set"

### Solution

**Option A: Use bizygomatic-level landmarks**

Replace gonion with landmarks at cheekbone/eye level. Candidates:
1. **Landmarks 234/454** - Currently labeled "gonion" but may be higher
2. **Landmarks 116/345** - Mid-cheek region
3. **Find true zygomatic landmarks** in MediaPipe's 468-point model

**Recommended approach:**
```typescript
// feature-axes.ts:109-113
function faceWidth(landmarks: Point[]): number {
  // Use mid-face width at approximate zygomatic (cheekbone) level
  // These landmarks are at eye/upper-cheek level, representing true bizygomatic width
  const leftCheek = landmarks[116];   // Left mid-face
  const rightCheek = landmarks[345];  // Right mid-face
  return distance(leftCheek, rightCheek);
}
```

**Alternative: Dynamic width selection**
```typescript
function faceWidth(landmarks: Point[]): number {
  // Measure at multiple levels and use the widest
  const widths = [
    distance(landmarks[116], landmarks[345]),  // Mid-cheek
    distance(landmarks[234], landmarks[454]),  // Gonion
    // Add other candidate pairs
  ];
  return Math.max(...widths.filter(w => w > 0));
}
```

### Affected Measurements
All measurements normalized by face width will change:
- Interocular distance ratio ← PRIMARY
- Nose width
- Mouth width
- Jaw width (may need special handling)
- Chin width

### Threshold Recalibration
After fixing face width, all these thresholds in `axis-classifiers.ts` need review:
- `classifyInterocularDistance`: Currently 0.38/0.42 boundaries
- `classifyNoseWidth`: 0.25/0.30 boundaries
- `classifyMouthWidth`: 0.25/0.32 boundaries
- `classifyJawWidth`: 0.95/1.05 boundaries (special case - see below)
- `classifyChinWidth`: 0.95/1.05 boundaries

### Special Case: Jaw Width Measurement
Current code normalizes gonion width by face width:
```typescript
const jawWidthAbs = distance(leftGonion, rightGonion);
const jawWidth = jawWidthAbs / fw;
```

If face width ALSO uses gonion, this becomes circular: `jawWidth ≈ 1.0` always.

**Fix**: Jaw width should compare gonion width to OTHER width metrics:
- Option A: Normalize by bizygomatic width (NEW face width)
- Option B: Normalize by forehead/temple width
- Option C: Create separate jaw-to-cheekbone ratio

Recommended:
```typescript
// Jaw width: compare jaw angle width to cheekbone width
// Ratio < 1.0 = tapered, ≈ 1.0 = square, > 1.0 = wide/unusual
const jawWidthAbs = distance(leftGonion, rightGonion);
const jawWidth = jawWidthAbs / fw;  // fw is now bizygomatic width
```

---

## Issue #2: Brow Shape Classification

### Problem
Brow shape is INVERTED:
- Image A: Visually arched → classified as "Straight"
- Image B: Visually straight → classified as "Arched"

### Root Cause (Confirmed by Diagnostic)

```typescript
// feature-axes.ts:649-680
const leftBrowInner = averageLandmarks(landmarks, [70, 63, 105]);
const leftBrowMid = averageLandmarks(landmarks, [66, 107, 55]);
const leftBrowOuter = averageLandmarks(landmarks, [65, 52, 53, 46]);

const leftBaselineY = (leftBrowInner.y + leftBrowOuter.y) / 2;
const leftArcHeight = Math.abs(leftBrowMid.y - leftBaselineY);
```

**Diagnostic findings for canonical face:**
- Baseline Y: 0.7878
- "Mid" centroid Y: 0.8013 (BELOW baseline - drooping!)
- Actual peak (landmark 46) Y: 0.7520 (ABOVE baseline - arched!)

**Problem**: The "mid" grouping [66, 107, 55] doesn't contain the arch peak. Landmark 46 (the true peak at Y=0.7520) is in the "outer" grouping!

### MediaPipe Brow Landmarks Analysis
```
LEFT_EYEBROW_INDICES = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46]

Positions (X, Y):
[0] 70:  (0.1306, 0.7732) - inner
[9] 46:  (0.1608, 0.7520) - PEAK (smallest Y) ← Should be used for arch!
[8] 53:  (0.2037, 0.7758)
[2] 105: (0.2426, 0.8216) - drooping
[7] 52:  (0.2588, 0.7875)
[6] 65:  (0.3292, 0.7884)
[3] 66:  (0.3218, 0.8211) - drooping
[5] 55:  (0.4212, 0.7668)
[4] 107: (0.4099, 0.8160) - drooping
[1] 63:  (0.1780, 0.8042) - drooping
```

The landmarks aren't in consistent anatomical order. The arbitrary grouping doesn't reflect the actual brow curve.

### Solution

**Approach: Find the actual arch peak dynamically**

```typescript
/**
 * Extract eyebrow measurements with correct arch detection
 */
export function extractBrowMeasurements(
  landmarks: Point[],
  leftEye: Point,
  rightEye: Point
): BrowMeasurements {
  const ipd = interocularDistance(leftEye, rightEye);

  // Use all 10 landmarks per brow
  const leftBrowPoints = LEFT_EYEBROW_INDICES.map(idx => landmarks[idx]).filter(Boolean);
  const rightBrowPoints = RIGHT_EYEBROW_INDICES.map(idx => landmarks[idx]).filter(Boolean);

  // Find endpoints (innermost and outermost landmarks by X coordinate)
  const leftInner = leftBrowPoints.reduce((min, p) => p.x < min.x ? p : min);
  const leftOuter = leftBrowPoints.reduce((max, p) => p.x > max.x ? p : max);
  const rightInner = rightBrowPoints.reduce((min, p) => p.x > min.x ? p : min);  // reversed for right
  const rightOuter = rightBrowPoints.reduce((max, p) => p.x < max.x ? p : max);  // reversed for right

  // Compute baseline (line between endpoints)
  const leftBaselineY = (leftInner.y + leftOuter.y) / 2;
  const rightBaselineY = (rightInner.y + rightOuter.y) / 2;

  // Find the actual peak (highest point = smallest Y in screen coords)
  const leftPeak = leftBrowPoints.reduce((highest, p) => p.y < highest.y ? p : highest);
  const rightPeak = rightBrowPoints.reduce((highest, p) => p.y < highest.y ? p : highest);

  // Arc height: baseline - peak (positive = arched, negative = drooping)
  // Y increases downward, so peak.y < baseline.y for arched brow
  const leftArcHeight = leftBaselineY - leftPeak.y;
  const rightArcHeight = rightBaselineY - rightPeak.y;

  // Normalize by brow width
  const leftBrowWidth = distance(leftInner, leftOuter);
  const rightBrowWidth = distance(rightInner, rightOuter);

  const leftShape = leftArcHeight / (leftBrowWidth || 1);
  const rightShape = rightArcHeight / (rightBrowWidth || 1);

  // Bilateral smoothing
  const shape = (leftShape + rightShape) / 2;

  // Position and length calculations remain the same...
  // (Use centroids of regions for these measurements)

  return {
    shape,
    position, // existing calculation
    length,   // existing calculation
    leftShape,
    rightShape,
  };
}
```

### Key Changes
1. **Dynamic endpoint finding**: Use min/max X coordinates, not arbitrary groups
2. **Dynamic peak finding**: Use min Y coordinate (highest point), not centroid of arbitrary "mid" group
3. **Remove Math.abs()**: Preserve sign to distinguish arched (positive) vs drooping (negative)
4. **Correct Y-direction**: `baseline - peak` gives positive for arched brows

### Threshold Adjustment
Current thresholds may need adjustment:
```typescript
// axis-classifiers.ts:465-487
function classifyBrowShape(ratio: number): AxisClassification {
  // OLD: ratio is always positive (Math.abs)
  // NEW: ratio can be negative (drooping), positive (arched), or ~0 (straight)

  if (ratio > 0.15) {
    value = 'arched';
    confidence = Math.min(1, (ratio - 0.15) / 0.15);
  } else if (ratio < 0.08) {
    // This now catches both straight (near 0) and drooping (negative)
    value = 'straight';
    confidence = Math.min(1, (0.08 - ratio) / 0.08);
  } else {
    value = 'moderate';
    confidence = 1 - Math.abs(ratio - 0.115) / 0.035;
  }

  return { axis: 'brow shape', value, confidence, rawMeasurement: ratio };
}
```

---

## Testing Strategy

### 1. Unit Tests
- Update existing brow shape tests to expect new behavior
- Add test cases for negative arc height (drooping brows)
- Update IPD tests with new face width

### 2. Measurement Variance Tests
File: `measurement-variance.test.ts`
- Recalibrate tolerance thresholds for IPD
- May need to adjust other tolerances if face width changes affect them

### 3. Integration Tests
- Test with both sample images (Image A and Image B)
- Verify classifications match visual assessment:
  - Image A: Arched brows (not straight)
  - Image B: Straight brows (not arched)
  - Both: Normal interocular distance (not wide-set)

### 4. Visual Verification
Create a diagnostic output that shows:
- Raw measurement values
- Classification results
- Side-by-side with visual assessment

---

## Implementation Order

### Phase 1: Face Width Fix (CRITICAL - affects multiple measurements)
1. ✓ Research MediaPipe landmarks to identify true bizygomatic width
2. Update `faceWidth()` function in `feature-axes.ts`
3. Update jaw width normalization to avoid circular reference
4. Run IPD diagnostic test to verify new ratios
5. Update axis-classifiers.ts thresholds:
   - Start with proportional scaling based on canonical face change
   - Refine based on real image testing

### Phase 2: Brow Shape Fix (CRITICAL - inverted results)
1. ✓ Diagnostic complete - root cause identified
2. Rewrite `extractBrowMeasurements()` with dynamic peak/endpoint finding
3. Remove `Math.abs()` to preserve arc height sign
4. Update `classifyBrowShape()` to handle signed ratios
5. Test with canonical face and real images

### Phase 3: Testing & Validation
1. Run full test suite: `npm test`
2. Update measurement variance tolerances if needed
3. Test with both sample images
4. Verify all major classifications match visual assessment
5. Document any edge cases or limitations

### Phase 4: Threshold Calibration
1. Collect measurements from diverse sample set
2. Refine thresholds in axis-classifiers.ts
3. Ensure smooth confidence gradients
4. Update documentation

---

## Risk Assessment

### Low Risk Changes
- Face width landmark swap (well-isolated function)
- Brow shape sign handling (removes abstraction, clarifies intent)

### Medium Risk Changes
- Threshold recalibration (may need iteration)
- Jaw width normalization (semantic change)

### Testing Safeguards
- All existing tests must pass or be updated with clear rationale
- Measurement variance tests catch regression in stability
- Real image validation ensures practical correctness

---

## Open Questions

1. **Face width landmarks**: Confirm 116/345 are optimal for bizygomatic width
   - Alternative: Measure multiple candidates and use widest
   - Need to verify on diverse face shapes

2. **Brow landmark ordering**: Are MediaPipe brow landmarks ordered consistently?
   - Current diagnostic shows inconsistent spatial ordering
   - May need robust sorting by position before processing

3. **Threshold values**: Current values were likely tuned for old (incorrect) measurements
   - Need systematic recalibration with diverse faces
   - May need separate dataset for this

4. **Other coordinate system issues**: Are there similar Y-direction bugs elsewhere?
   - Audit all uses of `Math.abs()` on Y-differences
   - Check nasolabial depth, cheekbone height, etc.

---

## Next Steps

1. Review this plan with user for approval
2. Implement Phase 1 (face width fix)
3. Implement Phase 2 (brow shape fix)
4. Run comprehensive testing
5. Iterate on thresholds based on results
