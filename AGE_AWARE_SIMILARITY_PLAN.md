# Age-Aware Similarity Calibration Plan

**Status**: Active (replaces previous age model upgrade approach)
**Created**: 2025-01-20
**Goal**: Optimize similarity comparison across age gaps without perfect age prediction

## Problem Statement

Previous approach tried to improve age estimation accuracy (target: <5y MAE) to enable better age-gap calibration. This led to model-shopping (genderage, MiVOLO, FaceXFormer) without clear wins.

**Key insight**: We don't need perfect age estimation—we need **age-aware similarity calibration**.

## New Architecture **[REVISED 2025-01-20]**

### Current (Being Replaced)
```
Image → FaceMesh (landmarks) + yu4u (age, 90MB) → manual calibration
```

### Proposed
```
Image → MobileFaceNet (4MB) → embeddings (128-512D) → {
  - Age probe (tiny MLP) → Δage, uncertainty
  - Similarity features
} → Learned calibrator → p(same|s, Δage, unc)
```

**Key Change**: MediaPipe FaceMesh doesn't expose embeddings, only 468 landmarks. Using MobileFaceNet instead for rich face embeddings.

## Advantages

1. **Massive size reduction** - 90MB yu4u → ~6MB total (93% reduction)
2. **Single embedding model** - MobileFaceNet provides both similarity and age features
3. **Optimizes for actual task** - Directly models similarity across age gaps
4. **Browser-friendly** - Lightweight ONNX inference
5. **Stops model-shopping** - Don't need sub-5y MAE, just reasonable Δage for calibration
6. **End-to-end trainable** - Can optimize calibrator for similarity prediction
7. **Proven effective** - MobileFaceNet achieves 99.55% LFW with <1M params

## Implementation Phases

### Phase 1: MobileFaceNet Setup & Data Preparation (Week 1)
- [ ] Find pretrained MobileFaceNet ONNX model (~4MB, 112x112 input)
- [ ] Test MobileFaceNet inference in browser (ONNX Runtime Web)
- [ ] Extract embeddings from UTKFace samples
- [ ] Validate embeddings contain age-relevant features
- [ ] Prepare training datasets (single faces + pairs)
- [ ] Split into train/val/test sets

### Phase 2: Age Probe Development (Week 2)
- [ ] Train tiny MLP: embeddings → (age, uncertainty)
- [ ] Implement uncertainty estimation (dropout or evidential)
- [ ] Convert to ONNX (<2MB target)
- [ ] Validate browser compatibility

### Phase 3: Similarity Calibrator (Week 3)
- [ ] Generate same/different pairs across age ranges
- [ ] Train calibrator: p(same | s, Δage, unc)
- [ ] Architecture: small MLP or logistic regression
- [ ] Convert to ONNX (<3MB target)

### Phase 4: Integration (Week 3-4)
- [ ] Modify worker to extract embeddings
- [ ] Add age probe inference
- [ ] Add calibrator inference
- [ ] Update similarity scoring logic
- [ ] Remove old yu4u model (free up 90MB)

### Phase 5: Evaluation (Week 4)
- [ ] Compare old vs new similarity scores
- [ ] Validate age gap handling (20+ year gaps)
- [ ] Performance benchmarks (inference time, model size)
- [ ] Tune calibrator thresholds if needed

## Success Criteria

- ✅ Age-aware similarity works across 20+ year gaps
- ✅ Total probe + calibrator < 5MB (vs 90MB currently)
- ✅ Inference time ≤ current approach
- ✅ All processing remains in-browser
- ✅ No regression on same-age similarity
- ✅ Smooth similarity degradation with age gap (no sudden drops)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| FaceMesh embeddings lack age signal | Test early in Phase 1; fallback to current if needed |
| Training data quality issues | Start with UTKFace; expand to other datasets if needed |
| Calibrator overfitting | Careful train/val split; regularization; cross-validation |
| Browser performance regression | Profile early; optimize model size; use quantization |

## Training Data Requirements

### Single Faces (Age Probe)
- **Source**: UTKFace (23k+ faces, ages 0-116)
- **Split**: 80% train, 10% val, 10% test
- **Features**: FaceMesh embeddings + age labels

### Paired Faces (Calibrator)
- **Same person**: Age-progression datasets (if available)
- **Different people**: UTKFace pairs at various age gaps
- **Labels**: Ground truth similarity (same=1, different=0)
- **Balance**: Equal same/different pairs across age gap ranges

## Technical Details

### MobileFaceNet Embeddings
- Pretrained face recognition model (~4MB ONNX)
- Input: 112x112 RGB face crop
- Output: 128-512D embedding vector
- Designed for face verification/recognition
- Should contain age-relevant features

### Age Probe Architecture
```
Input: embeddings [batch, embedding_dim]
Hidden: Dense(128, ReLU) → Dense(64, ReLU)
Output: {
  age: Dense(1, ReLU)  // predicted age
  uncertainty: Dense(1, Softplus)  // epistemic uncertainty
}
```

### Calibrator Architecture
```
Input: [similarity_score, Δage, uncertainty]
Hidden: Dense(32, ReLU) → Dense(16, ReLU)
Output: Dense(1, Sigmoid)  // p(same | inputs)
```

## Fallback Plan

If MobileFaceNet embeddings prove unsuitable for age estimation:
1. Try alternative lightweight models (ArcFace, etc.)
2. Use landmark-based geometric features from FaceMesh
3. Keep current yu4u model with improved calibration as last resort

## References

- MobileFaceNets paper: https://arxiv.org/abs/1804.07573
- UTKFace dataset: https://susanqq.github.io/UTKFace/
- ONNX Runtime Web: https://onnxruntime.ai/docs/get-started/with-javascript/web.html
- Evidential deep learning for uncertainty: https://arxiv.org/abs/1806.01768
