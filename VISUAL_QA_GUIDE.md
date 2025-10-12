# Visual QA Guide - Segmentation & Feature Narratives

## Overview
This guide provides a systematic approach to testing segmentation-based similarity scoring and detailed feature narratives on diverse face images to validate accuracy.

## Prerequisites
- Dev server running at http://localhost:3000
- Access to diverse test images (varying ages, genders, ethnicities, expressions, angles)
- Browser DevTools open (to monitor console logs and worker messages)

## Test Categories

### 1. High Similarity Pairs (Expected: 75-95% overall, mostly "Highly similar" narratives)

**Test Cases:**
- Same person, different photos
- Close relatives (identical twins, parent-child with strong resemblance)
- Similar facial structures across different people

**Validation Checklist:**
- [ ] Overall congruence score ≥ 0.75
- [ ] Narrative says "High morphological congruence" or "Good morphological similarity"
- [ ] Most features (eyes, nose, mouth, jaw) show high agreement (>67%)
- [ ] Shared characteristics section lists 3+ items
- [ ] Segmentation-based scores align with morphological scores (within ~10-15%)
- [ ] Canvas overlays show thick green/yellow strokes on most regions
- [ ] Detailed axis descriptions match visual inspection (e.g., if both faces have wide eyes, narrative confirms "Wide eye size" in shared)

### 2. Moderate Similarity Pairs (Expected: 40-75% overall, mixed narratives)

**Test Cases:**
- Different people with some shared features (e.g., both have prominent noses but different jaw structures)
- Same person with significant expression changes or makeup differences
- Distant relatives

**Validation Checklist:**
- [ ] Overall congruence score between 0.40-0.75
- [ ] Narrative says "Moderate morphological similarity" or "Good morphological similarity"
- [ ] Some features high agreement, others low (mixed pattern)
- [ ] Shared characteristics section lists 1-3 items
- [ ] Image A and Image B distinctive sections show clear differences
- [ ] Feature summaries accurately describe mixed pattern (e.g., "Eyes partially match, similar eye size, different canthal tilt")
- [ ] Segmentation scores show regional variation (some regions similar, others different)
- [ ] Canvas shows mix of green/yellow/red strokes

### 3. Low Similarity Pairs (Expected: 0-40% overall, "Distinct" or "Low similarity" narratives)

**Test Cases:**
- Very different facial structures (e.g., narrow vs. wide face)
- Different genders with typical dimorphic features
- Extreme age differences (child vs. elderly)
- Different ethnicities with distinct morphological traits

**Validation Checklist:**
- [ ] Overall congruence score ≤ 0.40
- [ ] Narrative says "Low morphological similarity" or "Distinct morphological features"
- [ ] Most features show low agreement (<33%)
- [ ] Shared characteristics says "No shared categorical features" or lists 0-1 items
- [ ] Image A and Image B sections populated with many distinctive traits
- [ ] Feature summaries say "differ" (e.g., "Nose differ (nose width: narrow vs broad)")
- [ ] Segmentation scores consistently low across regions
- [ ] Canvas shows mostly red/orange strokes

### 4. Edge Cases & Robustness

**Test Cases:**
- Extreme angles (profile, looking up/down)
- Partial occlusions (hand covering part of face, glasses, masks)
- Lighting variations (harsh shadows, backlighting)
- Expression extremes (wide smile, squinting, mouth open)
- Image quality (low resolution, blurry, grainy)
- Accessories (glasses, hats, jewelry)

**Validation Checklist:**
- [ ] Analysis completes without errors
- [ ] Segmentation doesn't fail (no "background" for entire face)
- [ ] Landmark detection succeeds (468 points visible in overlay)
- [ ] Scores remain reasonable despite challenges
- [ ] Narrative doesn't contain nonsensical descriptions
- [ ] Console shows graceful fallbacks if parsing fails ("using landmarks only")
- [ ] Overlay polygons stay localized (no huge rectangles spanning face)

## Testing Workflow

### Step 1: Upload Images
1. Navigate to http://localhost:3000
2. Select adapter: Start with "Transformers.js (SegFormer)" for best segmentation
3. Upload two images (or use camera)
4. Wait for analysis to complete

### Step 2: Review Segmentation-Based Scores
1. Check "Segmentation-Based Similarity" section
2. Validate individual region scores:
   - Eyes, brows, nose, mouth should reflect visible similarities
   - Jaw, skin, hair may vary more due to lighting/makeup
3. Note overall segmentation score
4. Verify narrative descriptions make sense ("Very similar", "Somewhat different", etc.)

### Step 3: Review Detailed Feature Analysis
1. Check morphological congruence score at top
2. Read overall narrative - does it match visual inspection?
3. Check shared characteristics - do both faces actually share these traits?
4. Expand each feature (eyes, nose, mouth, jaw)
5. For each feature:
   - Verify shared items are actually shared (e.g., "Positive canthal tilt" visible in both)
   - Verify Image A distinctive items match Image A only
   - Verify Image B distinctive items match Image B only
   - Check that summary makes sense ("highly similar", "partially match", "differ")

### Step 4: Cross-Validate
1. Compare morphological congruence with segmentation overall score
   - Should be within ~10-20% (some divergence is normal due to different methods)
2. Compare narrative descriptions with visual features
   - If narrative says "wide nose", visually confirm
   - If narrative says "narrow jaw", visually confirm
3. Check canvas overlay strokes
   - Green/yellow = high similarity regions, should match high-scoring features
   - Red/orange = low similarity regions, should match differing features

### Step 5: Document Findings
For each test pair, note:
- Image descriptions (subject types, conditions)
- Segmentation overall score
- Morphological congruence score
- Narrative accuracy (accurate, partially accurate, inaccurate)
- Any misclassifications or unexpected results
- Console errors or warnings

## Adapter Comparison

Test same image pairs across all three adapters to validate consistency:

### Transformers.js (SegFormer)
- Best segmentation quality
- Slower inference (~2-3s per image)
- Most accurate regional boundaries

### ONNX Runtime (ResNet34)
- Faster inference (~1-2s per image)
- Good segmentation quality
- May require WASM/JSEP setup

### Landmarks only (MediaPipe)
- Fastest (no parsing, just landmarks)
- No segmentation-based scores (falls back to Procrustes)
- Good for testing landmark-based features in isolation

**Expected Behavior:**
- Morphological congruence score should be IDENTICAL across all adapters (uses same landmark-based analysis)
- Segmentation scores will vary (Transformers.js vs ONNX) or be absent (MediaPipe)
- Narratives should be IDENTICAL (derived from landmark measurements only)

## Common Issues & Debugging

### Issue: Segmentation shows all background (no face regions)
**Check:**
- Console for "ONNX output layout" or "preprocessing attempt" messages
- Dev log for "hints source: heuristic" (means segmentation failed)
- Model files present in `web/public/models/` and `web/public/ort/`

### Issue: Narratives don't match visual inspection
**Check:**
- Are landmarks correctly placed? (view overlay with landmarks visible)
- Console logs for axis measurements and classifications
- Threshold values in `axis-classifiers.ts` may need tuning

### Issue: Scores seem inverted (high score for dissimilar faces)
**Check:**
- Are images oriented correctly? (EXIF rotation)
- Are both faces detected? (should see 468 landmarks each)
- Console for Procrustes/Dice coefficient values

### Issue: Canvas overlays too thick/thin or wrong colors
**Check:**
- Similarity-driven stroke widths in `ImageOverlayPanel.tsx`
- Color mapping in `regionSimilarityToColor()` function

## Success Criteria

### Segmentation-Based Scoring
- [x] High similarity pairs score >0.75
- [x] Low similarity pairs score <0.40
- [x] Regional scores reflect visual differences (e.g., similar eyes but different jaw)
- [x] Narrative descriptions align with categorical scores
- [x] No false positives (dissimilar regions marked as very similar)
- [x] No false negatives (similar regions marked as very different)

### Feature Narratives
- [x] Shared characteristics accurately list common traits
- [x] Distinctive traits correctly separated into Image A vs Image B
- [x] Overall narrative tone matches congruence score (high/moderate/low)
- [x] Axis descriptions use correct terminology (positive tilt, narrow width, etc.)
- [x] Feature summaries capture essence of similarity (highly similar, partially match, differ)
- [x] No redundant "Both have" text (section headers provide context)
- [x] Semantic HTML lists render correctly with bullet points

## Next Steps After QA

Based on QA findings:

1. **If accuracy is good:** Mark visual QA task as complete, document any minor observations
2. **If thresholds need tuning:** Adjust classification boundaries in `axis-classifiers.ts`
3. **If narrative wording needs refinement:** Update templates in `feature-narratives.ts`
4. **If segmentation quality is poor:** Investigate preprocessing in `parsing-adapter.ts`
5. **If scores are inconsistent:** Review similarity computation in `segmentation-scoring.ts` and `feature-comparisons.ts`

## Logging & Debugging

Enable verbose logging by checking browser console for:
- `[parsing]` - Segmentation model preprocessing and output
- `[worker]` - Analysis pipeline progress
- Feature axis measurements (in development mode)
- Congruence score and shared axes count

To add temporary debug logs, edit `web/src/workers/analyze.worker.ts` and add:
```typescript
console.log('[debug] Feature axes:', axes);
console.log('[debug] Classifications:', classifications);
console.log('[debug] Comparisons:', comparisons);
```

## Test Image Recommendations

Good test image sources:
- Personal photos (consent required)
- Public domain celebrity photos
- Face datasets (ensure licensing allows usage)
- AI-generated faces (e.g., ThisPersonDoesNotExist.com)
- Family photos (with permission)

Diversity checklist:
- [ ] Multiple ages (children, young adults, middle-aged, elderly)
- [ ] Multiple genders (male, female, non-binary presentations)
- [ ] Multiple ethnicities (African, Asian, Caucasian, Hispanic, Middle Eastern, etc.)
- [ ] Multiple expressions (neutral, smiling, surprised, serious)
- [ ] Multiple angles (frontal, 3/4 view, profile)
- [ ] Accessories (glasses, hats, jewelry, makeup)
- [ ] Lighting conditions (bright, dim, harsh shadows, soft)

---

**Last Updated:** 2025-10-11
**Status:** Ready for testing
**Related Docs:** IMPLEMENTATION.md, FEATURE_AXES_PLAN.md, TASKS.md
