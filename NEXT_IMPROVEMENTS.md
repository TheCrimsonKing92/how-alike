# Next Improvements Plan

This document outlines the roadmap for maximizing How Alike's accuracy and user trust while maintaining the privacy-first, browser-only architecture.

## Current State

**Completed Features**:
- MediaPipe FaceMesh landmark detection (468 points)
- Transformers.js face parsing with SegFormer
- Segmentation-based similarity scoring (mask IoU)
- 8-axis morphological feature analysis
- Age estimation with 3-segment piecewise calibration
- Overall MAE: 14.6 years

**Limitations Identified**:
- Pose variation affects similarity scores (no frontal alignment)
- Age model fundamental accuracy constraints (~14.6 year MAE)
- Gender misidentification correlates with age errors
- Image cropping/occlusion can invalidate region comparisons

---

## Improvement Priorities

### 0. Morphological Glossary Popovers ⭐ HIGH PRIORITY **[NEW 2025-01-21]**

**Goal**: Bridge the language gap between technical anatomy descriptors and casual users without diluting accuracy.

**Approach**:
- Tag terms like zygomatic, philtrum, nasolabial fold, commissure, etc., in feature narratives.
- Surface hover popovers on desktop and tap-and-hold tooltips on mobile with definitions ≤30 words.
- Allow optional face-outline illustration or highlighted silhouette to contextualize the region.
- Prepare optional "Learn more" link to an extended glossary modal (Phase 2).

**Benefits**:
- Keeps expert-level terminology while remaining approachable.
- Reduces confusion when narratives reference lesser-known anatomy terms.
- Encourages exploration via quick, inline education.

**Effort**: Medium (content authoring + shared tooltip component).

- **Implementation**:
- Extend text rendering pipeline to wrap tagged terms with a glossary component.
- Provide responsive interactions (hover vs tap) with accessible focus/keyboard support; fallback to `<abbr title>` when hover is unavailable.
- Store glossary copy in structured JSON for reuse across popovers and future modal glossary; lazy-load assets to avoid initial payload bloat. Initial schema is text-only (term + ≤30-word definition) with no illustration field.
- Centralize display logic in a shared `DefinitionTooltip` React component used in reports and the glossary view.
- Defer rendering for offscreen instances with `IntersectionObserver` so pages with many terms stay fast.
- Add snapshots or unit tests to ensure tagged terms render popovers.

**Status**: Planning; requires glossary content draft and component design.

**Phasing**:
1. Inline glossary JSON + tooltips (text-only, no imagery fields).
2. Add mini SVG overlays that highlight the region (introduce optional illustration field when assets exist).
3. Optional modal with example faces across ages/ethnicities.

---

### 1. Enhance Pose Robustness ⭐ HIGH PRIORITY

**Goal**: Perform frontal alignment before comparison to reduce errors from differing angles.

**Approach**:
- Use MediaPipe's 3D face pose data (already available)
- Apply "face pose transformation matrix" to landmarks or masks
- Canonicalize both faces to frontal view before comparison
- Flag high pose disparity cases with warning if frontalization unreliable

**Benefits**:
- Reduces errors when input photos have different angles
- Improves consistency across varied image sources

**Effort**: Medium (leverage existing MediaPipe data)

**Implementation**:
- Extract 3D rotation/translation from MediaPipe keypoints
- Apply transformation to align faces to canonical frontal pose
- Update segmentation and landmark coordinates accordingly
- Add pose disparity warning to UI when angles differ significantly

---

### 2. Age-Aware Similarity Calibration ⭐ HIGH PRIORITY **[NEW APPROACH - 2025-01-20]**

**Goal**: Optimize similarity comparison across age gaps without perfect age prediction.

**NEW STRATEGY**: Stop model-shopping for better age estimators. Instead, build tiny age probe on FaceMesh embeddings + learned similarity calibrator.

**Architecture**:
```
Image → FaceMesh embeddings → {
  - Similarity score (s)
  - Tiny age probe → Δage, uncertainty
} → Learned calibrator → p(same|s, Δage, unc)
```

**Advantages**:
- Reuses embeddings already computed for matching
- Smaller models (<5MB vs 90MB yu4u)
- Optimizes for actual task (similarity across age gaps)
- End-to-end trainable for similarity prediction

**Acceptance Criteria**:
- Works across 20+ year age gaps
- Total probe + calibrator < 5MB
- Inference time ≤ current approach
- No regression on same-age similarity
- All processing remains in-browser

**Effort**: High (model training + integration)

**Status**: See `AGE_AWARE_SIMILARITY_PLAN.md` for detailed implementation plan

**Performance Budget**: Should be faster than current approach (smaller models)

---

### 3. Refine Age & Gender Calibration ⭐ **[DEPRECATED - Replaced by #2]**

**Status**: Superseded by age-aware similarity calibration approach.

The learned calibrator in Priority #2 will handle age gap adjustments more directly than manual gender-specific calibration curves.

---

### 4. Integrate Deep Feature Comparison (Optional) ⭐ RECOMMENDED

**Goal**: Add face recognition embedding similarity for capturing subtle resemblances.

**Approach**:
- Use lightweight face recognition model (MobileFaceNet or ResNet-based ArcFace)
- Generate feature vector per face
- Compute cosine similarity between embeddings
- Combine embedding similarity with IoU-based score
- Calibrate weighting between methods

**Why it helps**:
- Face recognition models excel at capturing identity-related features
- Research shows CNNs can identify "doppelgänger" pairs humans recognize
- Complements geometric/segmentation approaches

**Concerns**:
- Face recognition embeddings trained for identity distinction (not look-alike)
- May disagree with human perception of resemblance
- Needs calibration and testing against human judgments

**Solution**:
- Use smaller model for efficiency (MobileFaceNet ~few MB, fast with WebGL)
- Weight embeddings alongside IoU in final score
- Make optional "High Precision mode" if performance is concern
- All processing stays local (privacy-first)

**Effort**: High (model integration + weight calibration)

**Performance Budget**: 50-100ms additional inference time acceptable

---

### 5. Occlusion/Cropping Handling ⭐ MEDIUM PRIORITY

**Goal**: Implement occlusion-aware similarity calculation.

**Approach**:
- Detect when region polygon is cut off by image boundary
- Compute convex hull of landmarks; check if portion lies outside frame
- In segmentation scoring: skip region if >X% area is cut off
- Reduce weight or exclude occluded regions from overall similarity
- Inform user if comparison had to ignore certain regions (transparency)

**Benefits**:
- More robust to varied photo framing
- Fairer scores when images have different crops
- Handles masks/accessories gracefully

**Effort**: Medium (geometric checks + UI transparency)

**Implementation**:
- Add boundary intersection detection to segmentation scoring
- Skip or reduce weight of regions with significant occlusion
- Display warning: "Comparison excluded forehead (not visible in Image A)"

---

### 6. Revisit Feature Weights and Tuning 🔧 LOW PRIORITY (AFTER OTHER IMPROVEMENTS)

**Goal**: Optimize final similarity score weighting for maximum human correlation.

**Approach**:
- Combine multiple signals: IoU, embedding similarity, feature axis congruence
- Gather small test set of "look-alike" vs "not look-alike" pairs
- Adjust weights (or simple regression) to maximize agreement with human judgment
- Example: if embedding says very similar but IoU says medium, trust embedding for subtle texture/micro-features

**Dependencies**: Complete after #1-5 are implemented

**Effort**: Medium (requires human-labeled test set)

---

### 7. Maintain Interpretability ⭐ CRITICAL PRINCIPLE

**Goal**: Ensure user understands *why* faces are scored a certain way.

**Requirements**:
- Continue showing visual overlays (segmentation outlines)
- Continue providing text explanations (feature narratives)
- If adding embeddings: balance "black box" with transparent methods
- Congruence score from feature analysis should feed into final result or narrative

**Approach**:
- Don't hide new techniques; explain their contribution
- Example: "Embedding raised score due to subtle similarities in texture"
- Keep segmentation and feature analysis visible alongside any new scores

---

### 8. Testing & Performance 🧪

**Test Coverage**:
- **Pose variation**: Verify frontal alignment improves scores for same faces at different angles
- **Age gaps**: Check improved age model + calibration yields sensible outputs and penalties
- **Cross-gender**: Ensure known look-alike pairs (e.g., sibling pairs) score high without gender bias
- **Occlusion**: Verify masked regions don't cause score collapse

**Performance Targets**:
- Web Workers + WebGL handle most additions
- Pose alignment: trivial CPU math
- Occlusion checks: trivial CPU geometry
- Heavy lifting: new age model (50-100ms) and embedding model (50-100ms)
- Total acceptable inference time: <6s (current ~2-4s parsing + ~100-200ms new models)

**Test Framework**:
- Continue using Vitest (unit tests) and Playwright (E2E)
- Add new test scenarios for pose, age accuracy, occlusion handling

---

## Implementation Roadmap **[UPDATED 2025-01-20]**

### Phase 1: Age-Aware Similarity Calibration (Weeks 1-4)
**Status**: Active - See `AGE_AWARE_SIMILARITY_PLAN.md`
1. **Research FaceMesh embeddings** and validate age signal
2. **Prepare UTKFace training data** (single faces + pairs)
3. **Train age probe** (tiny MLP on embeddings)
4. **Train similarity calibrator** p(same | s, Δage, unc)
5. **Integrate into worker pipeline** and remove old yu4u model
6. **Test and validate** across age gaps

### Phase 2: Additional Improvements (Weeks 5-6, Optional)
7. **Occlusion detection** and handling
8. **Deep feature embedding** integration if needed (MobileFaceNet)
9. **Weight optimization** across all scoring methods

### Phase 3: Refinement (Week 7)
10. **Final weight tuning** based on test results
11. **Documentation** and user-facing explanations
12. **Performance optimization** if needed

**Note**: Pose normalization (#1) is already complete and active.

---

## Success Metrics

**Accuracy**:
- Age estimation: <5 years MAE for adults, <2 years for children
- Pose-robust similarity: same faces at different angles score >0.85
- Cross-gender fairness: no systematic bias in look-alike detection

**User Experience**:
- Total inference time: <6 seconds
- Explanations remain clear and interpretable
- Privacy maintained: 100% browser-based execution

**Technical**:
- All tests passing (unit + E2E)
- Model sizes optimized (float16 quantization where applicable)
- No server footprint

---

## Conclusion

The How Alike pipeline is well-engineered and uses state-of-the-art browser-based ML. These improvements address the main limitations (pose, age, gender, cropping) while preserving the core strengths (privacy, interpretability, performance).

By implementing pose alignment, better age models, and optional deep feature integration, we can significantly improve accuracy and user trust. All changes continue browser-only execution, maintaining the privacy-first commitment while delivering cutting-edge facial similarity analysis.

**Key Principle**: Enhanced alignment, smarter age handling, and possibly deep feature integration will maximize How Alike's ability to capture true facial resemblance across diverse real-world conditions.
