# Cross-Age Face Verification Dataset Instructions

## Required Dataset

To train the age-aware similarity calibrator properly, you need a cross-age face verification dataset with **real same-person pairs across different ages**.

## Recommended Datasets

### Option 1: AgeDB-30 (RECOMMENDED)

**Description**: 16,488 images with age labels and 600 verification pairs per fold (10 folds)

**Download**:
- **Official iBUG**: https://ibug.doc.ic.ac.uk/resources/agedb/
  - Requires email request for password
  - Contact: s.moschoglou@imperial.ac.uk

**Installation**:
```bash
# Extract downloaded zip
unzip agedb.zip -d agedb-30/
```

**Expected structure**:
```
agedb-30/
  ├── AgeDB/
  │   ├── 1_Actor-Activis...
  │   ├── 2_Writer_Scient...
  │   └── ...
  └── agedb_pairs.txt
```

### Option 2: CALFW (Cross-Age LFW)

**Description**: 3,000 positive + 3,000 negative cross-age pairs from LFW

**Download**:
1. **Official** (currently down): http://whdeng.cn/CALFW/index.html
2. **Alternative mirrors**:
   - Check Papers with Code: https://paperswithcode.com/dataset/calfw
   - Search Google Scholar for recent papers using CALFW (often include mirrors)

**Expected structure**:
```
calfw/
  ├── ca-aligned/
  │   ├── Aaron_Eckhart_0001.jpg
  │   └── ...
  └── calfw_pairs.txt
```

### Option 3: CACD-VS (Cross-Age Celebrity Dataset - Verification Subset)

**Description**: 2,000 positive and 2,000 negative celebrity face pairs with age labels

**Download**: Search for "CACD-VS dataset download" on academic repositories

## Once Dataset is Downloaded

Place the dataset in the project root:

```bash
# For AgeDB-30
mv <downloaded_path> agedb-30/

# For CALFW
mv <downloaded_path> calfw/

# For CACD-VS
mv <downloaded_path> cacd-vs/
```

Then run the calibrator training:

```bash
# Automatic detection of available dataset
python scripts/train-linear-calibrator.py

# Or specify dataset explicitly
python scripts/train-linear-calibrator.py --dataset agedb-30
python scripts/train-linear-calibrator.py --dataset calfw
```

## Fallback: Baseline Penalty Calibrator

If datasets are unavailable, you can train a baseline penalty-based calibrator using synthetic pairs from UTKFace:

```bash
python scripts/train-penalty-calibrator.py
```

**Note**: This baseline is NOT suitable for production as it uses unrealistic heuristics for same-person pairs. It should only be used for testing the pipeline before obtaining real data.

## Citation Requirements

**AgeDB**:
```
@inproceedings{moschoglou2017agedb,
  title={AgeDB: the first manually collected, in-the-wild age database},
  author={Moschoglou, Stylianos and Papaioannou, Athanasios and Sagonas, Christos and Deng, Jiankang and Kotsia, Irene and Zafeiriou, Stefanos},
  booktitle={CVPR Workshops},
  year={2017}
}
```

**CALFW**:
```
@article{zheng2017cross,
  title={Cross-age lfw: A database for studying cross-age face recognition in unconstrained environments},
  author={Zheng, Tianyue and Deng, Weihong and Hu, Jiani},
  journal={arXiv preprint arXiv:1708.08197},
  year={2017}
}
```
