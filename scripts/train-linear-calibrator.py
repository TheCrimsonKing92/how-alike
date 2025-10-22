"""
Train constrained linear calibrator for age-aware similarity

Features: [similarity, |age_diff|, |age_diff|^2, uncertainty]
Constraints: w_sim > 0, w_age <= 0, w_age2 <= 0, w_unc <= 0

This ensures:
- Higher similarity increases same-person probability
- Larger age gaps decrease probability (with quadratic effect)
- Higher uncertainty decreases confidence

Requires real cross-age identity data (AgeDB-30, CALFW, or CACD-VS)
"""
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import numpy as np
import json
import os
import argparse
from pathlib import Path
from scipy.optimize import minimize
from sklearn.model_selection import train_test_split
from sklearn.isotonic import IsotonicRegression
import matplotlib.pyplot as plt

# ============================================================================
# Dataset Loaders
# ============================================================================

def load_agedb30(data_dir='agedb-30'):
    """Load AgeDB-30 dataset with verification pairs"""
    print(f"[OK] Loading AgeDB-30 from {data_dir}...")

    pairs_file = os.path.join(data_dir, 'agedb_pairs.txt')
    if not os.path.exists(pairs_file):
        raise FileNotFoundError(f"Pairs file not found: {pairs_file}")

    with open(pairs_file, 'r') as f:
        lines = f.readlines()

    # Parse pairs (format: name1 idx1 name2 idx2 for negative, name idx1 idx2 for positive)
    pairs = []
    for line in lines[1:]:  # Skip header
        parts = line.strip().split('\t')
        if len(parts) == 3:  # Positive pair
            name, idx1, idx2 = parts
            img1 = f"{name}/{name}_{idx1}.jpg"
            img2 = f"{name}/{name}_{idx2}.jpg"
            label = 1
        elif len(parts) == 4:  # Negative pair
            name1, idx1, name2, idx2 = parts
            img1 = f"{name1}/{name1}_{idx1}.jpg"
            img2 = f"{name2}/{name2}_{idx2}.jpg"
            label = 0
        else:
            continue

        pairs.append((img1, img2, label))

    print(f"  Found {len(pairs)} pairs")
    return pairs, data_dir

def load_calfw(data_dir='calfw'):
    """Load CALFW dataset with verification pairs"""
    print(f"[OK] Loading CALFW from {data_dir}...")

    pairs_file = os.path.join(data_dir, 'calfw_pairs.txt')
    if not os.path.exists(pairs_file):
        raise FileNotFoundError(f"Pairs file not found: {pairs_file}")

    with open(pairs_file, 'r') as f:
        lines = f.readlines()

    pairs = []
    for line in lines[1:]:  # Skip header
        parts = line.strip().split()
        if len(parts) == 3:  # Positive pair: name idx1 idx2
            name, idx1, idx2 = parts
            img1 = f"{name}/{name}_{int(idx1):04d}.jpg"
            img2 = f"{name}/{name}_{int(idx2):04d}.jpg"
            label = 1
        elif len(parts) == 4:  # Negative pair
            name1, idx1, name2, idx2 = parts
            img1 = f"{name1}/{name1}_{int(idx1):04d}.jpg"
            img2 = f"{name2}/{name2}_{int(idx2):04d}.jpg"
            label = 0
        else:
            continue

        pairs.append((img1, img2, label))

    print(f"  Found {len(pairs)} pairs")
    return pairs, os.path.join(data_dir, 'ca-aligned')

def auto_detect_dataset():
    """Auto-detect available dataset"""
    if os.path.exists('agedb-30/agedb_pairs.txt'):
        return load_agedb30()
    elif os.path.exists('calfw/calfw_pairs.txt'):
        return load_calfw()
    else:
        raise FileNotFoundError(
            "No dataset found. Please download AgeDB-30 or CALFW.\n"
            "See DATASET_INSTRUCTIONS.md for details."
        )

# ============================================================================
# Feature Extraction
# ============================================================================

def extract_features_from_pairs(pairs, images_dir, mobilefacenet_session, age_probe_session):
    """Extract features for all pairs"""
    import cv2

    print("\n[OK] Extracting features from pairs...")

    features = []
    labels = []

    for idx, (img1_path, img2_path, label) in enumerate(pairs):
        try:
            # Load images
            img1_full = os.path.join(images_dir, img1_path)
            img2_full = os.path.join(images_dir, img2_path)

            img1 = cv2.imread(img1_full)
            img2 = cv2.imread(img2_full)

            if img1 is None or img2 is None:
                continue

            # Preprocess and extract embeddings
            def get_embedding_and_age(img):
                img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                img_resized = cv2.resize(img_rgb, (112, 112))
                img_normalized = (img_resized.astype(np.float32) - 127.5) / 127.5
                img_input = np.transpose(img_normalized, (2, 0, 1))
                img_input = np.expand_dims(img_input, axis=0)

                # Get embedding
                emb_outputs = mobilefacenet_session.run(
                    None, {mobilefacenet_session.get_inputs()[0].name: img_input}
                )
                embedding = emb_outputs[0][0]

                # Get age and uncertainty
                age_outputs = age_probe_session.run(
                    None, {age_probe_session.get_inputs()[0].name: embedding.reshape(1, -1).astype(np.float32)}
                )
                age = age_outputs[0][0][0]
                uncertainty = age_outputs[1][0][0]

                return embedding, age, uncertainty

            emb1, age1, unc1 = get_embedding_and_age(img1)
            emb2, age2, unc2 = get_embedding_and_age(img2)

            # Compute similarity (cosine)
            emb1_norm = emb1 / np.linalg.norm(emb1)
            emb2_norm = emb2 / np.linalg.norm(emb2)
            similarity = float(np.dot(emb1_norm, emb2_norm))

            # Compute features
            age_diff = abs(age1 - age2)
            avg_uncertainty = (unc1 + unc2) / 2

            # Feature vector: [s, |Δage|, |Δage|^2, u]
            feature_vec = [similarity, age_diff, age_diff**2, avg_uncertainty]

            features.append(feature_vec)
            labels.append(label)

            if (idx + 1) % 100 == 0:
                print(f"  Processed {idx + 1}/{len(pairs)} pairs")

        except Exception as e:
            print(f"  [WARN] Failed on pair {idx}: {e}")
            continue

    features = np.array(features)
    labels = np.array(labels)

    print(f"\n[OK] Extracted {len(features)} feature vectors")
    print(f"  Positive pairs: {labels.sum()}")
    print(f"  Negative pairs: {len(labels) - labels.sum()}")

    return features, labels

# ============================================================================
# Constrained Linear Calibrator
# ============================================================================

def constrained_linear_calibrator(features, labels, regularization=0.01):
    """
    Train constrained linear calibrator

    Model: logit(p) = w0 + w1*s + w2*|Δage| + w3*|Δage|^2 + w4*u
    Constraints: w1 > 0, w2 <= 0, w3 <= 0, w4 <= 0
    """
    print("\n[OK] Training constrained linear calibrator...")

    def logistic_loss(params):
        """Logistic regression loss with L2 regularization"""
        w = params
        logits = features @ w[1:] + w[0]
        probs = 1 / (1 + np.exp(-logits))

        # Binary cross-entropy
        eps = 1e-15
        probs = np.clip(probs, eps, 1 - eps)
        bce = -np.mean(labels * np.log(probs) + (1 - labels) * np.log(1 - probs))

        # L2 regularization (exclude bias)
        l2 = regularization * np.sum(w[1:]**2)

        return bce + l2

    # Initial parameters
    initial_params = np.array([0.0, 1.0, -0.01, -0.0001, -0.01])  # [bias, w_sim, w_age, w_age2, w_unc]

    # Bounds: [bias unrestricted, w_sim > 0, w_age <= 0, w_age2 <= 0, w_unc <= 0]
    bounds = [
        (None, None),     # bias
        (0.0, None),      # w_sim >= 0
        (None, 0.0),      # w_age <= 0
        (None, 0.0),      # w_age2 <= 0
        (None, 0.0),      # w_unc <= 0
    ]

    print("  Optimizing parameters...")
    result = minimize(
        logistic_loss,
        initial_params,
        method='L-BFGS-B',
        bounds=bounds,
        options={'disp': True, 'maxiter': 1000}
    )

    params = result.x
    print(f"\n[OK] Optimal parameters:")
    print(f"  bias:        {params[0]:.4f}")
    print(f"  w_sim:       {params[1]:.4f}  (similarity weight)")
    print(f"  w_age:       {params[2]:.6f}  (age diff penalty)")
    print(f"  w_age2:      {params[3]:.8f}  (age diff^2 penalty)")
    print(f"  w_unc:       {params[4]:.6f}  (uncertainty penalty)")

    return params

# ============================================================================
# Evaluation
# ============================================================================

def evaluate_calibrator(params, features, labels):
    """Evaluate calibrator performance"""
    print("\n[OK] Evaluating calibrator...")

    # Compute probabilities
    logits = features @ params[1:] + params[0]
    probs = 1 / (1 + np.exp(-logits))

    # Compute metrics at various thresholds
    thresholds = np.linspace(0, 1, 1000)

    tpr_list = []
    fpr_list = []

    for threshold in thresholds:
        predictions = probs >= threshold

        tp = np.sum((predictions == 1) & (labels == 1))
        fp = np.sum((predictions == 1) & (labels == 0))
        tn = np.sum((predictions == 0) & (labels == 0))
        fn = np.sum((predictions == 0) & (labels == 1))

        tpr = tp / (tp + fn) if (tp + fn) > 0 else 0
        fpr = fp / (fp + tn) if (fp + tn) > 0 else 0

        tpr_list.append(tpr)
        fpr_list.append(fpr)

    tpr_list = np.array(tpr_list)
    fpr_list = np.array(fpr_list)

    # Compute AUC
    auc = np.trapz(tpr_list, fpr_list)

    # Find EER
    eer_idx = np.argmin(np.abs(tpr_list - (1 - fpr_list)))
    eer = (fpr_list[eer_idx] + (1 - tpr_list[eer_idx])) / 2

    # Find TAR @ FAR=1e-3
    far_target = 1e-3
    tar_at_far = 0.0
    for i, fpr_val in enumerate(fpr_list):
        if fpr_val <= far_target:
            tar_at_far = tpr_list[i]
            break

    print(f"  AUC: {auc:.4f}")
    print(f"  EER: {eer:.2%}")
    print(f"  TAR@FAR=1e-3: {tar_at_far:.2%}")

    return auc, eer, tar_at_far

# ============================================================================
# Main
# ============================================================================

def main(args):
    import onnxruntime as ort

    # Load dataset
    if args.dataset == 'auto':
        pairs, images_dir = auto_detect_dataset()
    elif args.dataset == 'agedb-30':
        pairs, images_dir = load_agedb30()
    elif args.dataset == 'calfw':
        pairs, images_dir = load_calfw()
    else:
        raise ValueError(f"Unknown dataset: {args.dataset}")

    # Load models
    print("\n[OK] Loading MobileFaceNet...")
    mobilefacenet_session = ort.InferenceSession(
        'web/public/models/mobilefacenet/mobilefacenet.onnx',
        providers=['CPUExecutionProvider']
    )

    print("[OK] Loading Age Probe...")
    age_probe_session = ort.InferenceSession(
        'web/public/models/age-probe/age_probe.onnx',
        providers=['CPUExecutionProvider']
    )

    # Extract features
    features, labels = extract_features_from_pairs(
        pairs, images_dir, mobilefacenet_session, age_probe_session
    )

    # Split train/val
    X_train, X_val, y_train, y_val = train_test_split(
        features, labels, test_size=0.2, random_state=42, stratify=labels
    )

    print(f"\n[OK] Split: {len(X_train)} train, {len(X_val)} val")

    # Train calibrator
    params = constrained_linear_calibrator(X_train, y_train, regularization=args.regularization)

    # Evaluate
    print("\n[OK] Training set performance:")
    evaluate_calibrator(params, X_train, y_train)

    print("\n[OK] Validation set performance:")
    evaluate_calibrator(params, X_val, y_val)

    # Save model
    print("\n[OK] Saving calibrator...")
    os.makedirs('web/public/models/similarity-calibrator', exist_ok=True)

    calibrator = {
        'type': 'constrained_linear',
        'bias': float(params[0]),
        'w_similarity': float(params[1]),
        'w_age_diff': float(params[2]),
        'w_age_diff_sq': float(params[3]),
        'w_uncertainty': float(params[4]),
        'description': 'Constrained linear calibrator: logit(p) = bias + w_sim*s + w_age*|Δage| + w_age2*|Δage|^2 + w_unc*u'
    }

    output_path = 'web/public/models/similarity-calibrator/linear.json'
    with open(output_path, 'w') as f:
        json.dump(calibrator, f, indent=2)

    print(f"[OK] Saved to: {output_path}")
    print(f"[OK] Model size: {os.path.getsize(output_path)} bytes")

    print("\n[OK] Training complete!")

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--dataset', default='auto', choices=['auto', 'agedb-30', 'calfw'])
    parser.add_argument('--regularization', type=float, default=0.01)
    args = parser.parse_args()

    main(args)
