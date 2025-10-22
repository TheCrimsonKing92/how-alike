# Age-Aware Similarity Calibration Plan

## Overview

This document outlines the plan for implementing age-aware similarity calibration to improve cross-age face verification accuracy.

## Training Data Strategy

### Age Probe Training
**Dataset**: FairFace (CC BY 4.0)
**Purpose**: Train age prediction model from face embeddings
**Status**: ✅ Complete (5000 samples, 8.62y MAE)

**Licensing Note**: FairFace chosen over UTKFace for commercial deployment
- FairFace: CC BY 4.0 (✅ safe for production)
- UTKFace baseline: 4.38y MAE (🔴 research-only, cannot ship)
- MAE difference due to FairFace age bins (inherent ~3-5y quantization error)

**Validation Strategy** (per GPT recommendations):
- Primary: MORPH II (if licensed) for quantitative TAR@FAR validation
- Secondary: FairFace demographic fairness check
- Internal: APPA-REAL for regression sanity check (if accessible)

### Similarity Calibrator Training
**Datasets**: AgeDB-30 + CACD-VS (+ CALFW if available)
**Purpose**: Learn age-aware calibration for same/different person decisions
**Status**: ⚠️ Baseline only (synthetic pairs)

**Baseline** (current): Penalty-based calibration using UTKFace synthetic pairs
- Formula: `score' = s - 0.005*clip(|age_diff| - 5, 0, 30)`
- Limitation: NOT suitable for production (unrealistic same-person pairs)

**Production** (required): Constrained linear calibrator on real cross-age data
- Model: `logit(p) = w0 + w1*s + w2*|Δage| + w3*|Δage|^2 + w4*u`
- Constraints: `w1 > 0, w2 <= 0, w3 <= 0, w4 <= 0`
- Requires: Real same-person pairs across age gaps

## Dataset Acquisition

### AgeDB-30 (PRIMARY)
**Description**: 600 verification pairs per fold (10 folds), deliberate age gaps
**Download**:
- Official iBUG: https://ibug.doc.ic.ac.uk/resources/agedb/ (email for password)
- Contact: s.moschoglou@imperial.ac.uk

**Installation**:
```bash
unzip agedb.zip -d agedb-30/
```

### CACD-VS (SECONDARY)
**Description**: 2,000 pos + 2,000 neg celebrity cross-age pairs
**Download**: Search academic repositories for "CACD-VS dataset"

### CALFW (OPTIONAL)
**Description**: 3,000 pos + 3,000 neg cross-age pairs from LFW
**Status**: Official source down (http://whdeng.cn/CALFW/)
**Alternative**: Check Papers with Code for mirrors

## Training Pipeline

Once datasets are obtained:

### Step 1: Age Probe Training (Complete)
```bash
# Current production model (FairFace)
python scripts/train-age-probe-fairface.py

# Baseline for comparison (UTKFace - research-only)
python scripts/train-age-probe.py
```

**Output**: `web/public/models/age-probe/age_probe_fairface.onnx` (321 KB)

### Step 2: Train Constrained Linear Calibrator
```bash
# Auto-detect available dataset
python scripts/train-linear-calibrator.py

# Or specify dataset
python scripts/train-linear-calibrator.py --dataset agedb-30
```

**Expected outputs**:
- `web/public/models/similarity-calibrator/linear.json` (~200 bytes)
- Metrics: TAR@FAR=1e-3, EER, calibration curves per age-gap bin

### Step 3: Evaluate Performance
```bash
python scripts/evaluate-calibrator.py --dataset agedb-30 --calibrator linear
```

**Metrics to report**:
- TAR@FAR=1e-3, 1e-4 by age gap (0-5, 5-15, 15-30, 30+)
- ECE (Expected Calibration Error) <= 10%
- Brier score
- Comparison plots: uncalibrated vs calibrated ROC curves

## Implementation Status

| Phase | Component | Status | Size | Notes |
|-------|-----------|--------|------|-------|
| 1 | MobileFaceNet | ✅ Complete | 13 MB | Face embeddings |
| 2 | Age Probe (FairFace) | ✅ Complete | 0.32 MB | 8.62y MAE (CC BY 4.0) |
| 2* | Age Probe (UTKFace) | 🔴 Deprecated | 0.30 MB | 4.38y MAE (research-only) |
| 3 | Calibrator | ⚠️ Baseline | 0.0002 MB | Penalty (synthetic pairs) |
| 3+ | Calibrator | ⏳ Next | TBD | Linear (AgeDB-30/CACD-VS) |

**Total production size**: 13.32 MB (vs 90MB yu4u = 85% reduction)

**Licensing status**:
- MobileFaceNet: Apache 2.0 ✅
- Age Probe: Trained on FairFace (CC BY 4.0) ✅
- Calibrator: Needs AgeDB-30 (research) or MORPH II (commercial) for production

## Next Steps

1. **Acquire AgeDB-30** via iBUG (email request)
2. **Train proper calibrator** using `train-linear-calibrator.py`
3. **Evaluate** with proper metrics (TAR@FAR by age gap, ECE)
4. **Integrate** into browser inference pipeline
5. **(Optional) Add APPA-REAL** to improve age probe accuracy
6. **(Optional) Add CACD-VS** for more calibration training data

## References

**AgeDB**:
- Moschoglou et al. "AgeDB: the first manually collected, in-the-wild age database" CVPR Workshops 2017

**CALFW**:
- Zheng et al. "Cross-age lfw: A database for studying cross-age face recognition in unconstrained environments" arXiv:1708.08197 2017

**APPA-REAL**:
- Agustsson et al. "Apparent and real age estimation in still images with deep residual regressors on appa-real database" FG 2017
