# Feature Measurement Issues - Diagnostic Analysis

**Date**: 2025-10-26
**Status**: Under investigation

## Overview

Multiple feature measurements are producing incorrect classifications when compared to visual assessment of real sample images. This document tracks identified issues and proposed fixes.

## Confirmed Issues

### 1. Interocular Distance (CRITICAL)

**Problem**: Both test subjects classified as "wide-set" when they appear normal or narrow-set.

**Root Cause**: Using gonion (jaw angle) width as denominator instead of bizygomatic (cheekbone) width.

**Current Implementation** (`feature-axes.ts:109-113`):
```typescript
function faceWidth(landmarks: Point[]): number {
  const leftGonion = landmarks[LANDMARKS.leftGonion];   // 234
  const rightGonion = landmarks[LANDMARKS.rightGonion]; // 454
  return distance(leftGonion, rightGonion);
}
```

**Diagnostic Evidence**:
- Canonical face IPD ratio: 0.4129 (balanced, just below 0.42 threshold)
- Real faces with tapered jaws: ratio > 0.42 → false "wide-set" classification

**Issue**: Gonion landmarks (jaw angles) are narrower than cheekbone width in:
- Oval faces
- Heart-shaped faces
- Tapered/narrow jaws
- Result: artificially high IPD ratio → false "wide-set" classification

**Proposed Fix**:
Replace gonion width with bizygomatic (cheekbone) width using landmarks at eye/cheek level:
- Option A: Use landmarks 234/454 but verify they represent widest point
- Option B: Use mid-cheek landmarks (e.g., 116/345 from diagnostic)
- Option C: Use zygomatic process landmarks if available in MediaPipe

**Verification Needed**:
- Confirm which MediaPipe landmarks represent true bizygomatic width
- Test with both sample images to verify classification matches visual assessment

---

### 2. Brow Shape (CRITICAL)

**Problem**: Brow shape classification is INVERTED:
- Image A: Has arched brows → detected as "Straight"
- Image B: Has straight brows → detected as "Arched"

**Root Cause**: Likely Y-coordinate direction handling or incorrect landmark selection for arc peak.

**Current Implementation** (`feature-axes.ts:663-680`):
```typescript
// Compute baseline (line between inner and outer brow)
const leftBaselineY = (leftBrowInner.y + leftBrowOuter.y) / 2;
const rightBaselineY = (rightBrowInner.y + rightBrowOuter.y) / 2;

// Arc height: vertical deviation of mid-brow from baseline
const leftArcHeight = Math.abs(leftBrowMid.y - leftBaselineY);
const rightArcHeight = Math.abs(rightBrowMid.y - rightBaselineY);

// Normalize by brow width
const leftShape = leftArcHeight / (leftBrowWidth || 1);
const rightShape = rightArcHeight / (rightBrowWidth || 1);
```

**Issues Identified**:
1. **Y-Coordinate Direction**: Screen coordinates have Y increasing DOWNWARD
   - Arched brow: peak ABOVE baseline → peak.y < baseline.y → NEGATIVE diff
   - Should use: `arcHeight = baselineY - midY` (NOT `Math.abs()`)
   - Using `Math.abs()` loses sign information

2. **Landmark Selection**: "Mid" landmarks may not represent the actual arch peak:
   - leftBrowMid uses average of [66, 107, 55]
   - These may not be at the highest point of the arch
   - Need to verify these are anatomically correct for measuring arch

3. **Baseline Calculation**: Using average of inner/outer Y positions
   - This assumes inner and outer are at same height
   - If brows are angled, this could skew baseline

**Proposed Fixes**:
1. Remove `Math.abs()` and correctly handle Y-direction:
   ```typescript
   // Arched = peak above baseline = smaller Y value
   const leftArcHeight = leftBaselineY - leftBrowMid.y;
   // Positive value = arched, near-zero = straight, negative = downward
   ```

2. Verify landmark selection:
   - Check if "mid" landmarks are at arch peak
   - Consider finding maximum Y deviation across all brow landmarks

3. Consider using PCA or curve fitting to find true arch peak

**Verification Needed**:
- Visual inspection of landmark positions on sample images
- Test corrected formula with both subjects
- Verify classification thresholds still make sense after fix

---

## Suspected Issues (Require Investigation)

### 3. Eye Size

**Current Classification**: Image A "Narrow eye size", Image B (unknown from screenshots)

**Concern**: Need to verify this matches visual assessment. Eye size measurement uses:
- Vertical aperture height (upper lid to lower lid)
- Normalized by IPD

**Investigation Needed**:
- Since IPD calculation is wrong, eye size normalization may also be affected
- Verify formula: `eyeSize = avgEyeHeight / ipd`
- Check if "narrow" classification is correct for Image A

---

### 4. Canthal Tilt

**Status**: Previously fixed (was detecting negative when actually neutral/positive)

**Current Classification**: Both subjects show "Positive canthal tilt"

**Verification Needed**:
- Confirm fix is working correctly on both sample images
- Visual assessment suggests neutral to slightly positive - check if classification is accurate

---

### 5. Jaw Width

**Current Classification**: Image A "Balanced jaw width", Image B "Narrow jaw width"

**Concern**: Jaw width uses same gonion landmarks as face width:
```typescript
const jawWidthAbs = distance(leftGonion, rightGonion);
const jawWidth = jawWidthAbs / fw;  // Normalized by same face width!
```

**Issue**: This creates a circular reference:
- `jawWidth = gonionDistance / gonionDistance = 1.0` (always!)
- Classification thresholds: >1.05 wide, <0.95 narrow, else balanced
- Can never be exactly 1.0 due to floating point, but should be very close

**How does this ever classify as "narrow"?**
- This suggests there's something wrong with the logic or different landmarks are being used

**Investigation Needed**:
- Trace actual landmark indices used for jaw width vs face width
- Check if synthetic jaw is being used and has different landmarks
- Verify this measurement makes semantic sense

---

### 6. Face Width Measurements (Multiple Uses)

**Affected Calculations**:
All measurements normalized by face width are affected by the gonion issue:
- Interocular distance (IPD / face width) ← PRIMARY ISSUE
- Nose width (alar width / face width)
- Mouth width (mouth corner distance / face width)
- Jaw width (gonion distance / face width)
- Chin width (also uses face width)

**Fix Strategy**:
Once face width is corrected, ALL of these ratios will change. We'll need to:
1. Fix the face width calculation
2. Recalibrate ALL threshold values in axis-classifiers.ts
3. Re-run measurement variance tests
4. Verify with real images

---

### 7. Forehead Height

**Current Classification**: Image A "Short forehead height"

**Current Implementation**:
```typescript
const foreheadHeight = Math.abs(foreheadTop.y - browY);
const height = foreheadHeight / ipd;
```

**Concerns**:
- Uses foreheadTop landmark (10) which may not be at actual hairline
- Normalized by IPD (which is currently correct, unlike the face width issue)
- Need visual verification that "short" classification is accurate

---

### 8. Other Eye Measurements

**Measurements to Verify**:
- Eye size (height / IPD)
- Canthal tilt (previously fixed, recheck)
- Iris tracking (if enabled)

**Note**: These use IPD for normalization which is correct, but the interocular distance RATIO is affected by face width.

---

## Measurement Hierarchy

### Independent (No face width dependency):
- Canthal tilt (angle measurement)
- Eye size (normalized by IPD, not face width)
- Forehead height (normalized by IPD)
- Philtrum length (normalized by IPD)
- Bridge contour (curvature ratio)
- Tip projection (z-depth / IPD)
- Brow shape (arc height / brow width)
- Brow position (gap / IPD)
- Brow length (brow width / eye width)
- Mandibular angle (angle measurement)
- Chin projection (z-depth / IPD)

### Dependent on face width (AFFECTED BY GONION BUG):
- **Interocular distance ratio** (IPD / face width) ← PRIMARY
- Nose width (alar width / face width)
- Mouth width (mouth distance / face width)
- Jaw width (gonion distance / face width)
- Chin width (uses face width)

---

## Action Plan

### Phase 1: Diagnostic
- [ ] Create test to extract raw measurements from both sample images
- [ ] Visual landmark inspection on sample images
- [ ] Document actual vs expected classifications for all features
- [ ] Identify all measurements affected by coordinate system issues

### Phase 2: Fix Critical Issues
- [ ] Fix face width calculation (gonion → bizygomatic)
- [ ] Fix brow shape calculation (Y-direction handling)
- [ ] Verify canthal tilt still works correctly
- [ ] Update any other coordinate-direction issues

### Phase 3: Recalibration
- [ ] Recalibrate all axis classifier thresholds in axis-classifiers.ts
- [ ] Update measurement variance test tolerances if needed
- [ ] Run full test suite to verify no regressions

### Phase 4: Validation
- [ ] Test with both sample images
- [ ] Verify all classifications match visual assessment
- [ ] Document any remaining edge cases or limitations

---

## Research Needed

### MediaPipe Landmark Anatomy

Need to confirm which landmarks represent:
- **Bizygomatic width** (widest point of face at cheekbones)
  - Current candidates: 234/454 (gonion - WRONG for this)
  - Alternative: 116/345 (mid-cheek)
  - Need: actual zygomatic process landmarks

- **Brow arch peak**
  - Current: average of [66, 107, 55] for left brow
  - Need: verify these are at arch apex
  - Alternative: find max Y deviation across all brow landmarks

### Anthropometric Standards

Reference measurements for validation:
- Normal IPD/bizygomatic width ratio: ~0.38-0.42
- Normal brow arch height/width ratio: ~0.08-0.15
- These need verification against anthropometric literature

---

## Notes

- All Y-coordinate calculations must account for screen coordinate system (Y increases downward)
- Using `Math.abs()` often indicates lost sign information that may be important
- Measurements should be validated against visual assessment, not just mathematical correctness
- The canonical face model may not be representative of typical human proportions
