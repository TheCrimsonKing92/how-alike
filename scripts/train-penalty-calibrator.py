"""
Train penalty-based age-aware similarity calibrator

When cross-age identity data is unavailable, use a penalty function:
  score' = s - alpha*clip(|Deltaage| - tau, 0, M)

Where:
  s = raw similarity score (cosine similarity)
  alpha = penalty coefficient (how much to penalize per year)
  tau = threshold (age gap below which no penalty applies)
  M = max penalty (cap the total penalty)

This is interpretable, requires minimal data, and captures the intuition:
"Same person at different ages should have lower similarity, but we shouldn't
 reject them entirely just because of age difference."
"""
import numpy as np
import json
import os
from pathlib import Path
from scipy.optimize import minimize
import matplotlib.pyplot as plt

def penalty_calibration(similarity, age_diff, alpha, tau, M):
    """Apply age-aware penalty to similarity score"""
    penalty = alpha * np.clip(age_diff - tau, 0, M)
    return similarity - penalty

def evaluate_calibration(params, same_pairs, diff_pairs, verbose=False):
    """
    Evaluate calibration parameters

    Metrics:
    - True Positive Rate at low False Positive Rate
    - Equal Error Rate (EER)
    - Area Under ROC Curve
    """
    alpha, tau, M = params

    # Apply calibration
    same_scores = penalty_calibration(
        same_pairs['similarity'],
        same_pairs['age_diff'],
        alpha, tau, M
    )
    diff_scores = penalty_calibration(
        diff_pairs['similarity'],
        diff_pairs['age_diff'],
        alpha, tau, M
    )

    # Compute EER (Equal Error Rate)
    # Find threshold where FPR = FNR
    thresholds = np.linspace(0, 1, 1000)

    best_eer = 1.0
    best_threshold = 0.5

    for threshold in thresholds:
        # True positives: same pairs with score >= threshold
        tp = np.sum(same_scores >= threshold)
        fn = len(same_scores) - tp

        # True negatives: different pairs with score < threshold
        tn = np.sum(diff_scores < threshold)
        fp = len(diff_scores) - tn

        fnr = fn / len(same_scores) if len(same_scores) > 0 else 0
        fpr = fp / len(diff_scores) if len(diff_scores) > 0 else 0

        eer = (fnr + fpr) / 2

        if eer < best_eer:
            best_eer = eer
            best_threshold = threshold

    # Compute TAR @ FAR=1e-3
    # Find threshold where FPR ≈ 1e-3
    target_fpr = 1e-3

    for threshold in np.linspace(1, 0, 10000):
        fp = np.sum(diff_scores >= threshold)
        fpr = fp / len(diff_scores) if len(diff_scores) > 0 else 0

        if fpr >= target_fpr:
            # Compute TAR at this threshold
            tp = np.sum(same_scores >= threshold)
            tar = tp / len(same_scores) if len(same_scores) > 0 else 0
            break
    else:
        tar = 0.0

    if verbose:
        print(f"  alpha={alpha:.4f}, tau={tau:.1f}, M={M:.1f}")
        print(f"  EER: {best_eer:.2%}")
        print(f"  TAR@FAR=1e-3: {tar:.2%}")

    # Return EER as loss (lower is better)
    return best_eer

def fit_penalty_calibrator(same_pairs, diff_pairs):
    """
    Fit penalty calibrator parameters

    Optimize alpha, tau, M to minimize Equal Error Rate
    """
    print("[OK] Fitting penalty calibrator...")
    print(f"    Same-person pairs: {len(same_pairs['similarity'])}")
    print(f"    Different-person pairs: {len(diff_pairs['similarity'])}")

    # Initial guess
    initial_params = [0.005, 5.0, 30.0]  # alpha=0.005/year, tau=5 years, M=30 years

    # Bounds
    bounds = [
        (0.0, 0.02),   # alpha: 0 to 2% penalty per year
        (0.0, 20.0),   # tau: 0 to 20 year threshold
        (10.0, 80.0)   # M: 10 to 80 year max penalty
    ]

    print("\n[OK] Optimizing parameters...")

    result = minimize(
        lambda p: evaluate_calibration(p, same_pairs, diff_pairs),
        initial_params,
        method='L-BFGS-B',
        bounds=bounds,
        options={'disp': True, 'maxiter': 100}
    )

    alpha, tau, M = result.x

    print("\n[OK] Optimal parameters:")
    print(f"    alpha (penalty/year): {alpha:.6f}")
    print(f"    tau (threshold): {tau:.2f} years")
    print(f"    M (max penalty): {M:.2f} years")

    print("\n[OK] Final performance:")
    evaluate_calibration(result.x, same_pairs, diff_pairs, verbose=True)

    return alpha, tau, M

def generate_synthetic_pairs(embeddings, ages, num_same=200, num_diff=1000):
    """
    Generate synthetic same/different pairs for calibration

    Without real cross-age identity data, use heuristics:
    - Same: High similarity (>0.75) pairs as proxy for same person
    - Different: Random pairs with varying similarity
    """
    print("\n[OK] Generating synthetic calibration pairs...")

    # Normalize embeddings
    embeddings_norm = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)

    # Find high-similarity pairs (proxy for same person)
    print("    Finding high-similarity pairs...")
    same_pairs = {'similarity': [], 'age_diff': []}

    checked = 0
    for i in range(len(embeddings)):
        for j in range(i + 1, min(i + 200, len(embeddings))):
            sim = float(np.dot(embeddings_norm[i], embeddings_norm[j]))
            if sim > 0.75:  # High similarity threshold
                same_pairs['similarity'].append(sim)
                same_pairs['age_diff'].append(abs(ages[i] - ages[j]))

                if len(same_pairs['similarity']) >= num_same:
                    break

            checked += 1

        if len(same_pairs['similarity']) >= num_same:
            break

        if (i + 1) % 50 == 0:
            print(f"      Checked {checked} pairs, found {len(same_pairs['similarity'])} same-person pairs")

    print(f"    Found {len(same_pairs['similarity'])} high-similarity pairs")

    # Generate random different-person pairs
    print("    Generating different-person pairs...")
    diff_pairs = {'similarity': [], 'age_diff': []}

    for _ in range(num_diff):
        i, j = np.random.choice(len(embeddings), 2, replace=False)
        sim = float(np.dot(embeddings_norm[i], embeddings_norm[j]))
        diff_pairs['similarity'].append(sim)
        diff_pairs['age_diff'].append(abs(ages[i] - ages[j]))

    # Convert to numpy arrays
    same_pairs = {k: np.array(v) for k, v in same_pairs.items()}
    diff_pairs = {k: np.array(v) for k, v in diff_pairs.items()}

    print(f"\n[OK] Generated pairs:")
    print(f"    Same-person: {len(same_pairs['similarity'])} pairs")
    print(f"      Similarity: [{same_pairs['similarity'].min():.3f}, {same_pairs['similarity'].max():.3f}]")
    print(f"      Age diff: [{same_pairs['age_diff'].min():.1f}, {same_pairs['age_diff'].max():.1f}]")
    print(f"    Different-person: {len(diff_pairs['similarity'])} pairs")
    print(f"      Similarity: [{diff_pairs['similarity'].min():.3f}, {diff_pairs['similarity'].max():.3f}]")
    print(f"      Age diff: [{diff_pairs['age_diff'].min():.1f}, {diff_pairs['age_diff'].max():.1f}]")

    return same_pairs, diff_pairs

if __name__ == '__main__':
    import onnxruntime as ort
    import cv2

    # Load MobileFaceNet
    print("[OK] Loading MobileFaceNet...")
    model_path = 'web/public/models/mobilefacenet/mobilefacenet.onnx'
    session = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])

    # Load Age Probe
    print("[OK] Loading Age Probe...")
    age_probe_path = 'web/public/models/age-probe/age_probe.onnx'
    age_session = ort.InferenceSession(age_probe_path, providers=['CPUExecutionProvider'])

    # Extract embeddings from UTKFace
    print("\n[OK] Extracting embeddings from UTKFace...")
    utkface_dirs = ['utkface-uncropped/part1', 'utkface-uncropped/part2', 'utkface-uncropped/part3']

    embeddings = []
    ages = []

    for utkface_dir in utkface_dirs:
        if not os.path.exists(utkface_dir):
            continue

        files = sorted(os.listdir(utkface_dir))[:300]  # Use 300 images per directory

        for idx, filename in enumerate(files, 1):
            try:
                parts = filename.split('_')
                if len(parts) < 4:
                    continue

                age = int(parts[0])
                if age > 100:
                    continue

                img_path = os.path.join(utkface_dir, filename)
                img = cv2.imread(img_path)
                if img is None:
                    continue

                img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                img_resized = cv2.resize(img_rgb, (112, 112))
                img_normalized = (img_resized.astype(np.float32) - 127.5) / 127.5
                img_input = np.transpose(img_normalized, (2, 0, 1))
                img_input = np.expand_dims(img_input, axis=0)

                outputs = session.run(None, {session.get_inputs()[0].name: img_input})
                embedding = outputs[0][0]

                embeddings.append(embedding)
                ages.append(age)

                if len(embeddings) % 100 == 0:
                    print(f"  Processed {len(embeddings)} images")

            except Exception as e:
                continue

    embeddings = np.array(embeddings)
    ages = np.array(ages)

    print(f"\n[OK] Extracted {len(embeddings)} embeddings")
    print(f"    Age range: {ages.min()}-{ages.max()}")

    # Generate synthetic pairs
    same_pairs, diff_pairs = generate_synthetic_pairs(embeddings, ages, num_same=200, num_diff=1000)

    # Fit calibrator
    alpha, tau, M = fit_penalty_calibrator(same_pairs, diff_pairs)

    # Save parameters
    print("\n[OK] Saving calibrator parameters...")
    os.makedirs('web/public/models/similarity-calibrator', exist_ok=True)

    calibrator_params = {
        'type': 'penalty',
        'alpha': float(alpha),
        'tau': float(tau),
        'M': float(M),
        'description': 'Age-aware similarity penalty: score\' = s - alpha*clip(|age_diff| - tau, 0, M)'
    }

    output_path = 'web/public/models/similarity-calibrator/penalty.json'
    with open(output_path, 'w') as f:
        json.dump(calibrator_params, f, indent=2)

    print(f"[OK] Saved to: {output_path}")

    # Create visualization
    print("\n[OK] Creating visualization...")

    age_diffs = np.linspace(0, 80, 100)
    base_sim = 0.7

    calibrated_scores = penalty_calibration(base_sim, age_diffs, alpha, tau, M)

    plt.figure(figsize=(10, 6))
    plt.plot(age_diffs, [base_sim] * len(age_diffs), 'r--', label='Uncalibrated', linewidth=2)
    plt.plot(age_diffs, calibrated_scores, 'b-', label='Calibrated', linewidth=2)
    plt.xlabel('Age Difference (years)', fontsize=12)
    plt.ylabel('Similarity Score', fontsize=12)
    plt.title(f'Age-Aware Similarity Calibration\n(alpha={alpha:.4f}, tau={tau:.1f}, M={M:.1f})', fontsize=14)
    plt.legend(fontsize=11)
    plt.grid(True, alpha=0.3)
    plt.ylim([0, 1])

    plot_path = 'penalty-calibration-curve.png'
    plt.savefig(plot_path, dpi=150, bbox_inches='tight')
    print(f"[OK] Saved plot to: {plot_path}")

    print("\n[OK] Training complete!")
    print("\n[SUMMARY]")
    print(f"  Model type: Penalty-based calibration")
    print(f"  Parameters: {len(calibrator_params)} values")
    print(f"  Size: ~100 bytes")
    print(f"  Formula: score' = s - {alpha:.4f}*clip(|age_diff| - {tau:.1f}, 0, {M:.1f})")
    print(f"\n  Interpretation:")
    print(f"    - No penalty for age gaps < {tau:.1f} years")
    print(f"    - Penalty of {alpha:.4f} per year beyond threshold")
    print(f"    - Max penalty: {alpha * M:.3f} ({M:.0f} years)")
