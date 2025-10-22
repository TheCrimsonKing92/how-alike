# FaceXFormer Evaluation Results

## Summary
**FaceXFormer is NOT suitable** for precise age estimation in the how-alike project.

## Key Findings

### Architecture
- ICCV 2025 unified transformer for 9 facial analysis tasks
- Age prediction uses **classification into 8 decade bins**, not regression
- Reported MAE: 4.17 years (likely using bin midpoints)

### Age Bins (8 classes)
- Class 0: 0-9 years
- Class 1: 10-19 years
- Class 2: 20-29 years
- Class 3: 30-39 years
- Class 4: 40-49 years
- Class 5: 50-59 years
- Class 6: 60-69 years
- Class 7: 70+ years

### Test Results
Tested on UTKFace samples:

| True Age | Predicted Bin | Bin Range | Error (to bin midpoint) |
|----------|---------------|-----------|-------------------------|
| 1        | 0             | 0-9       | ~3.5 years             |
| 10       | 1             | 10-19     | ~4.5 years             |
| 20       | 1             | 10-19     | ~5.5 years             |
| 30       | 3             | 30-39     | ~4.5 years             |
| 50       | 4             | 40-49     | ~5.5 years             |

### Why It's Unsuitable

1. **Too coarse**: 10-year bins provide insufficient precision for age-based similarity calibration
2. **Not regressive**: Cannot provide specific age values, only decade categories
3. **Ambiguity**: A person aged 30 and 39 both map to class 3, yet are 9 years apart
4. **Calibration incompatible**: Our calibration system needs continuous age values, not categorical bins

### Model Details
- Size: 1.1 GB model file
- Dependencies: PyTorch, torchvision, facenet-pytorch (MTCNN), timm
- Speed: 33.21 FPS (claimed, likely GPU)
- Tasks: Multi-task (parsing, landmarks, pose, attributes, age/gender/race, visibility)

## Recommendation

**Reject FaceXFormer** for age estimation. Continue with:
- Current yu4u model (MAE 13.15y baseline, improved with calibration)
- Or explore true regression-based models like DEX, CORAL, or MiVOLO

FaceXFormer's strength is multi-task facial analysis, not precise age estimation.
