# Age Calibration Improvement Plan

## Current Status

### Problem
Age predictions are significantly inaccurate due to preprocessing mismatch:
- **Current calibration**: Fitted using whole-image preprocessing on UTKFace dataset
- **Runtime pipeline**: Uses face detection + IPD-based cropping + preprocessing
- **Result**: Adult (25) predicted as 76, Child (10) predicted as 28

### Root Cause
The calibration curve was fitted using different preprocessing than the actual runtime pipeline:
- Calibration data: Full image → Resize 96×96 → Model
- Runtime: Full image → Face detection → IPD crop → Resize 96×96 → Model

The model sees completely different inputs between calibration and runtime.

## Solution Approach

### Phase 1: Create Browser-Based Calibration Pipeline
**Goal**: Process calibration images through the same pipeline as runtime

1. **Create calibration web interface** (`web/app/calibrate/page.tsx`)
   - Upload images with known ages
   - Run through full browser pipeline (MediaPipe + face crop + age model)
   - Export raw predictions vs. actual ages as CSV

2. **Alternative: Headless browser script** (`web/scripts/calibrate-with-browser.mjs`)
   - Use Playwright/Puppeteer to automate the browser pipeline
   - Batch process calibration images
   - Output: `calibration-data.csv`

### Phase 2: Collect Diverse Calibration Data
**Target**: 50-100 images with known ages

**Sources**:
1. Personal photos with verified ages (5-10 images)
2. Public datasets with diverse conditions:
   - APPA-REAL (real-world, varied poses/lighting)
   - Wiki/IMDB faces subset
   - Free stock photos with age metadata

**Diversity Requirements**:
- Age distribution: At least 5 samples per decade (0-10, 10-20, 20-30, etc.)
- Pose variation: Forward-facing, 15°, 30°, 45° angles
- Accessories: With/without glasses, hats
- Lighting: Indoor, outdoor, varied conditions
- Gender balance: 50/50 split

### Phase 3: Process Calibration Dataset
**Script**: `web/scripts/process-calibration-images.mjs`

**Steps**:
1. For each image in calibration set:
   - Run through browser pipeline via headless browser
   - Capture raw model prediction
   - Record: `filename, actual_age, raw_prediction, gender, confidence`
2. Generate `calibration-results.csv`

### Phase 4: Analyze and Fit New Calibration
**Script**: `web/scripts/fit-calibration-curve.mjs`

**Methods to try**:
1. **Linear regression**: `y = mx + b`
2. **Piecewise linear** (current approach): Two segments with threshold
3. **Polynomial**: Degree 2-3 for smooth curve
4. **Isotonic regression**: Monotonic but flexible

**Evaluation metrics**:
- Mean Absolute Error (MAE)
- Root Mean Squared Error (RMSE)
- R² score
- Per-age-group error analysis

**Selection criteria**:
- Best overall MAE
- Balanced error across age groups
- Monotonicity preserved (older actual → older predicted)

### Phase 5: Integration and Validation
1. **Update calibration constants**:
   - `web/src/lib/age-estimation.ts` - `AGE_CALIBRATION` constants
   - `web/scripts/estimate-age-pair.mjs` - Sync with runtime
2. **Update tests**:
   - `web/src/__tests__/age-estimation.test.ts` - Realistic error expectations
   - Add validation tests with held-out images
3. **Document**:
   - Expected error ranges in code comments
   - Calibration data provenance
   - Retraining procedure for future updates

## Immediate Action Items

### Step 1: Quick Start - Use Test Images (Current Session)
1. Create simple calibration data collection tool
2. Process 2 existing test images (adult 25, child 10) through browser
3. Add 5-10 more images with known ages
4. Refit calibration with this small dataset
5. Validate improvement

### Step 2: Production Quality (Follow-up)
1. Build headless browser automation
2. Collect 50-100 diverse images
3. Comprehensive refitting
4. Cross-validation and testing

## Success Criteria
- Adult (25) prediction: Target ±10 years (15-35 range acceptable)
- Child (10) prediction: Target ±5 years (5-15 range acceptable)
- Overall MAE: <15 years across all age groups
- Relative ordering: Correctly identifies older vs. younger face

## Files to Create/Modify

### New Files
- [ ] `web/scripts/collect-calibration-data.mjs` - Interactive CLI for data collection
- [ ] `web/scripts/fit-calibration-curve.mjs` - Regression fitting script
- [ ] `calibration-data.csv` - Raw predictions from browser pipeline
- [ ] `AGE_CALIBRATION_PLAN.md` - This file

### Modified Files
- [ ] `web/src/lib/age-estimation.ts` - Update `AGE_CALIBRATION` constants
- [ ] `web/scripts/estimate-age-pair.mjs` - Sync calibration with runtime
- [ ] `web/src/__tests__/age-estimation.test.ts` - Update expectations

## Notes
- Current UTKFace-based calibration is not invalid, just mismatched with preprocessing
- The calibration approach (piecewise linear) is sound
- Core issue is preprocessing mismatch, not statistical method
