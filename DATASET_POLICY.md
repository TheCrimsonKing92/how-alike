# Dataset Chooser Policy

## 🟢 Allowed for TRAIN & SHIP
- Datasets with explicit commercial-reuse license (e.g., CC BY, paid-licensed for redistribution).
- Example: [If purchased] MORPH II (identity + age, commercial license obtained)
- Example: Self-collected data with proper consent/licensing
- **Note**: No free age/identity datasets with verified commercial licenses found as of 2024

## 🔵 Allowed for INTERNAL EVAL ONLY
- Datasets labelled "research-only" or that lack explicit commercial reuse rights.
- Must *not* be used for TRAINING models you will ship or for live inference.
- Examples: AgeDB-30/45, CALFW, CPLFW, CACD-VS, FG-NET

## 🔴 Prohibited for SHIP
- Any dataset that requires manual request without clear commercial reuse terms or asks for non-commercial only.
- Any dataset where you cannot verify redistribution rights.
- Examples: UTKFace, Adience (if license is "research-only"), unlabeled web scrapes.

## 🚀 Implementation Guidance
- **Age probe**: train on commercial-okay datasets (section 🟢) or internal datasets you own.
- **Similarity calibrator**: train on identity+age datasets, but if shipping weights rely on datasets in section 🔵, plan to retrain on 🟢 dataset before product release.
- **Eval data**: can include both 🟢 and 🔵 sets, but clearly mark 🔵 usage as "internal only, not shipped".

## 📜 Licensing Checklist
Before using any dataset:
1. Verify **license agreement text** allows commercial redistribution.
2. Ensure the dataset owners retain rights or assign a license that permits your use.
3. Document the dataset name, version, access date, and license in `DATASET_POLICY.md`.
4. Maintain attribution/rights documentation alongside production assets.

## ✅ Enforcement
- All team members must comply.
- Any model weights trained on 🔵 datasets cannot be shipped; require retraining or rights audit.
- Store "train data origin" metadata for audit: dataset name, split, license.

---

## Current Dataset Usage

### Age Probe Training
**Current**: FairFace (🔵 CC BY 4.0 - acceptable for development)
**Status**: ✅ TRAINED - 8.62y MAE (5000 samples)
**Previous**: UTKFace baseline (🔴 4.38y MAE - research-only, not for production)
**Action Required**: Performance acceptable for development; consider MORPH II for improved accuracy before production

### Similarity Calibrator Training
**Current**: Synthetic pairs from UTKFace (🔴 Prohibited)
**Status**: ⚠️ BASELINE ONLY - not suitable for production
**Action Required**:
1. Obtain AgeDB-30 for internal evaluation (🔵)
2. Train production calibrator
3. Before shipping: Either (a) retrain on commercial dataset, or (b) verify AgeDB license allows commercial use

### Evaluation Datasets
**Allowed**:
- AgeDB-30/45 (🔵 internal eval only)
- CALFW (🔵 internal eval only)
- CACD-VS (🔵 internal eval only)

**Documentation**: All evaluation results must be marked "internal only, not shipped"

---

## Dataset License Audit

| Dataset | Category | License | Commercial Use | Notes |
|---------|----------|---------|----------------|-------|
| UTKFace | 🔴 | Research-only | ❌ No | Cannot ship models trained on this |
| FairFace | 🔵 | CC BY 4.0 (official) | ⚠️ Use with caution | Official CC BY 4.0, but derived from YFCC-100M (mixed sources). Safe for development; verify before shipping. |
| APPA-REAL | 🔵 | Unclear (registration required) | ⚠️ Unverified | License terms not publicly available |
| AgeDB-30 | 🔵 | Research (email request) | ⚠️ Unclear | Internal eval only unless verified |
| CALFW | 🔵 | Research-only | ❌ No | Internal eval only |
| CACD-VS | 🔵 | Research-only | ❌ No | Internal eval only |
| FG-NET | 🔵 | Research-only | ❌ No | Internal eval only |
| MORPH II | 🟢 | Paid commercial license | ✅ Yes (if purchased) | ~$2k academic, more for commercial |

---

## Action Items for Production Deployment

### Before Shipping Age-Aware Similarity Feature:

1. **Age Probe** (choose one path):

   **Path A: Purchase Commercial Dataset**
   - [ ] Purchase MORPH II commercial license
   - [ ] Retrain age probe on MORPH II
   - [ ] Verify MAE performance (target: <4y)
   - [ ] Document training data provenance

   **Path B: Collect Own Data**
   - [ ] Design data collection protocol with legal review
   - [ ] Obtain proper consent for commercial use
   - [ ] Collect minimum 5k+ diverse age samples
   - [ ] Train and validate age probe

   **Path C: Verify APPA-REAL License** (if pursuing)
   - [ ] Register on ChaLearn platform
   - [ ] Review full license agreement
   - [ ] Confirm commercial use is explicitly permitted
   - [ ] Obtain written confirmation if needed
   - [ ] Then proceed with training

2. **Similarity Calibrator**:
   - [ ] Obtain AgeDB-30 for evaluation (🔵)
   - [ ] Train calibrator on AgeDB-30
   - [ ] Evaluate performance (TAR@FAR, ECE)
   - [ ] Either:
     - [ ] Verify AgeDB license permits commercial use, OR
     - [ ] Acquire and retrain on commercial dataset (e.g., MORPH II)
   - [ ] Document final training data provenance

3. **Documentation**:
   - [ ] Update model cards with dataset attributions
   - [ ] Store license agreements in legal/compliance folder
   - [ ] Create audit trail: dataset → model version → deployment date

### Current Status: BASELINE DEVELOPMENT ONLY
All models currently trained on 🔴 datasets. NOT approved for production deployment.
