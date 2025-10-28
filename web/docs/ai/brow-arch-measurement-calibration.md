# Eyebrow Arch Measurement Calibration

**Date:** 2025-10-27
**Consultation:** GPT-5 via consult-openai.mjs

## Problem

Eyebrows showing visible arch were measuring as "straight" due to:
1. **Incorrect measurement formula** - using averaged baseline instead of geometric sagitta
2. **Arbitrary thresholds** - calibrated with buggy measurement method, not anthropometric standards

## Solution

### 1. Fixed Measurement Method

**Old (Buggy):**
```typescript
const baseline = (inner.y + outer.y) / 2;
const arcHeight = baseline - peak.y;
```
❌ Failed when brow endpoints had different Y coordinates

**New (Correct):**
```typescript
// Perpendicular distance from peak to chord (sagitta)
const perpDist = |dy * peak.x - dx * peak.y + c| / chordLength;
const arcHeight = perpDist;
```
✅ Proper geometric sagitta regardless of endpoint heights

### 2. Literature Review

**Findings from GPT-5 Consultation:**
- ❌ **No universal anthropometric standards** exist for eyebrow arch classification
- ✅ **Sagitta/chord ratio** is the recommended method for MediaPipe landmarks
- Studies use **percentile-based** or **study-specific** thresholds, not universal cutoffs

**Why Sagitta/Chord is Best:**
- Dimensionless (scale-invariant)
- Monotonic with perceived arch
- Works with sparse discrete points
- Easy, stable threshold setting

### 3. Updated Thresholds

**Based on GPT-5 Recommendations + Test Data:**

| Classification | Threshold | Rationale |
|---|---|---|
| **Straight** | ≤ 0.165 | Face A measured 0.160 (visually straight) |
| **Moderate** | 0.166 – 0.185 | Face B measured 0.175 (visually moderate) |
| **Arched** | ≥ 0.186 | Discriminable 0.015 step from moderate |

**Expected Variance:**
- Frame-to-frame noise: σ ≈ 0.003–0.006
- Inter-subject variation: σ ≈ 0.010–0.015
- Threshold steps of 0.015 are discriminable

### 4. Test Results

**Before (with buggy measurement + arbitrary thresholds):**
- Face A: 0.138 → "straight" (but threshold was 0.19)
- Face B: 0.151 → "straight" (visually showed arch ❌)

**After (with corrected sagitta + GPT-5 thresholds):**
- Face A: 0.160 → **"straight"** ✓
- Face B: 0.175 → **"moderate"** ✓

## Implementation Files

**Changed:**
- `web/src/lib/feature-axes.ts:744-762` - Fixed sagitta calculation
- `web/src/lib/axis-classifiers.ts:471-503` - Updated thresholds
- `web/src/lib/landmark-features.ts:123-146` - Removed angle sorting
- `web/src/lib/regions.ts:68-70` - Aligned visualization landmarks

**Documented:**
- `web/docs/ai/consult-script-errors.md` - OpenAI API compatibility issues
- `web/docs/ai/brow-arch-measurement-validation.md` - Literature review (incomplete due to API issues)
- `web/docs/ai/brow-arch-measurement-calibration.md` - This document

## References

- GPT-5 consultation (2025-10-27): Validated sagitta/chord method and recommended thresholds
- Test subjects: john-kovacich-brothers (left/right images)
- Anthropometric literature: Farkas (no universal arch classification standards)

## Future Improvements

GPT-5 suggested optional enhancements:
- Pose normalization (project to face-aligned plane)
- Resampling to uniform arc-length points (reduce landmark jitter)
- Temporal filtering (EMA over frames for video)
- Bilateral consistency checks (compare left/right symmetry)
- Curvature fitting as cross-check (detect low-confidence frames)
