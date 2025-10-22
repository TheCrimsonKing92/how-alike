"""
Audit similarity calibrator for label leakage and circular reasoning

Check:
1. Feature distribution overlap between same/different classes
2. Decision boundary (is it just a simple threshold?)
3. Feature importance (does it just use similarity?)
"""
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import torch
import torch.nn as nn
import numpy as np
import matplotlib.pyplot as plt
import json

# Load the trained model
class SimilarityCalibrator(nn.Module):
    def __init__(self):
        super().__init__()
        self.network = nn.Sequential(
            nn.Linear(3, 32),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(32, 16),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(16, 1),
            nn.Sigmoid()
        )

    def forward(self, x):
        return self.network(x)

print("[OK] Loading trained calibrator...")
model = SimilarityCalibrator()
model.load_state_dict(torch.load('similarity_calibrator_best.pth'))
model.eval()

# Test decision boundary across feature space
print("\n[1] Testing decision boundary...")
print("=" * 60)

# Create test grid
similarities = np.linspace(-0.2, 1.0, 50)
age_diffs = np.linspace(0, 80, 50)

print("\nDecision boundary analysis (with uncertainty=0):")
print("Similarity | Age diff=0 | Age diff=10 | Age diff=30 | Age diff=60")
print("-" * 70)

for sim in [0.3, 0.5, 0.7, 0.8, 0.9]:
    probs = []
    for age_diff in [0, 10, 30, 60]:
        features = torch.FloatTensor([[sim, age_diff, 0.0]])
        with torch.no_grad():
            prob = model(features).item()
        probs.append(prob)

    print(f"{sim:6.2f}     | {probs[0]:10.3f}  | {probs[1]:11.3f}  | {probs[2]:11.3f}  | {probs[3]:13.3f}")

# Test feature importance by ablation
print("\n\n[2] Feature importance (ablation test)...")
print("=" * 60)

# Baseline: medium similarity, medium age gap
baseline = torch.FloatTensor([[0.6, 20, 0.0]])
with torch.no_grad():
    baseline_prob = model(baseline).item()

print(f"Baseline (sim=0.6, age_diff=20, unc=0): {baseline_prob:.3f}")

# Vary each feature independently
print("\nChanging similarity only (age_diff=20, unc=0):")
for sim in [0.2, 0.4, 0.6, 0.8, 0.95]:
    features = torch.FloatTensor([[sim, 20, 0.0]])
    with torch.no_grad():
        prob = model(features).item()
    delta = prob - baseline_prob
    print(f"  sim={sim:.2f}: prob={prob:.3f} (Δ={delta:+.3f})")

print("\nChanging age_diff only (sim=0.6, unc=0):")
for age_diff in [0, 10, 20, 40, 80]:
    features = torch.FloatTensor([[0.6, age_diff, 0.0]])
    with torch.no_grad():
        prob = model(features).item()
    delta = prob - baseline_prob
    print(f"  age_diff={age_diff:2d}: prob={prob:.3f} (Δ={delta:+.3f})")

print("\nChanging uncertainty only (sim=0.6, age_diff=20):")
for unc in [0, 5, 10, 20, 40]:
    features = torch.FloatTensor([[0.6, 20, float(unc)]])
    with torch.no_grad():
        prob = model(features).item()
    delta = prob - baseline_prob
    print(f"  unc={unc:2d}: prob={prob:.3f} (Δ={delta:+.3f})")

# Check if it's just a threshold on similarity
print("\n\n[3] Threshold test: Is it just 'similarity > 0.7'?")
print("=" * 60)

print("\nTesting edge cases around similarity=0.7:")
for sim in [0.65, 0.68, 0.70, 0.72, 0.75]:
    # Test with different age gaps
    features_young = torch.FloatTensor([[sim, 0, 0.0]])  # Same age
    features_old = torch.FloatTensor([[sim, 60, 0.0]])   # 60 year gap

    with torch.no_grad():
        prob_young = model(features_young).item()
        prob_old = model(features_old).item()

    print(f"sim={sim:.2f}: age_diff=0 → {prob_young:.3f}, age_diff=60 → {prob_old:.3f}")

# Estimate actual threshold from model behavior
print("\n\n[4] Finding decision threshold (prob=0.5)...")
print("=" * 60)

for age_diff in [0, 20, 40]:
    # Binary search for threshold
    low, high = 0.0, 1.0
    for _ in range(20):
        mid = (low + high) / 2
        features = torch.FloatTensor([[mid, age_diff, 0.0]])
        with torch.no_grad():
            prob = model(features).item()

        if prob > 0.5:
            high = mid
        else:
            low = mid

    print(f"age_diff={age_diff:2d}: threshold ≈ {mid:.4f} (prob={prob:.3f})")

# Summary
print("\n\n[5] VERDICT")
print("=" * 60)

# Test if model ignores age_diff and uncertainty
high_sim_young = torch.FloatTensor([[0.85, 0, 0.0]])
high_sim_old = torch.FloatTensor([[0.85, 80, 0.0]])
low_sim_young = torch.FloatTensor([[0.4, 0, 0.0]])
low_sim_old = torch.FloatTensor([[0.4, 80, 0.0]])

with torch.no_grad():
    p1 = model(high_sim_young).item()
    p2 = model(high_sim_old).item()
    p3 = model(low_sim_young).item()
    p4 = model(low_sim_old).item()

age_sensitivity = abs(p1 - p2) + abs(p3 - p4)

print(f"\nHigh similarity (0.85): age_diff=0 → {p1:.3f}, age_diff=80 → {p2:.3f} (Δ={abs(p1-p2):.3f})")
print(f"Low similarity (0.40):  age_diff=0 → {p3:.3f}, age_diff=80 → {p4:.3f} (Δ={abs(p3-p4):.3f})")
print(f"\nTotal age sensitivity: {age_sensitivity:.3f}")

if age_sensitivity < 0.05:
    print("\n⚠️  WARNING: Model is INSENSITIVE to age_diff!")
    print("   It likely just learned a threshold on similarity score.")
    print("   This is expected given synthetic 'same-person' pairs.")
else:
    print("\n✓  Model uses age_diff in decisions")

print("\n[CONCLUSION]")
print("The calibrator was trained on synthetic same-person pairs")
print("(similarity > 0.7 heuristic). Without real age-progression data,")
print("it cannot learn meaningful age-aware calibration.")
print("\nTo fix: Retrain on FG-NET or MORPH datasets with real same-person")
print("pairs across different ages.")
