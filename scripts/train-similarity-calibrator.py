"""
Train similarity calibrator: p(same | similarity, Δage, uncertainty)

This model learns to predict whether two faces are of the same person,
given:
  - Face similarity score (cosine similarity of embeddings)
  - Age difference (Δage) from age probe
  - Uncertainty from age probe

Architecture: Small MLP with 3 inputs → probability output
"""
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import onnxruntime as ort
import numpy as np
import os
import json
from pathlib import Path
import cv2
from sklearn.model_selection import train_test_split
from itertools import combinations
import random

# ============================================================================
# Similarity Calibrator Model
# ============================================================================

class SimilarityCalibrator(nn.Module):
    """Tiny MLP for same-person prediction from similarity + age features"""

    def __init__(self):
        super().__init__()

        # Input: [similarity_score, age_diff, uncertainty]
        self.network = nn.Sequential(
            nn.Linear(3, 32),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(32, 16),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(16, 1),
            nn.Sigmoid()  # Output probability
        )

    def forward(self, x):
        return self.network(x)

# ============================================================================
# Dataset
# ============================================================================

class FacePairDataset(Dataset):
    """Dataset of face pairs with similarity and age features"""

    def __init__(self, features, labels):
        """
        features: [N, 3] array of [similarity, age_diff, uncertainty]
        labels: [N] array of 0/1 (different/same person)
        """
        self.features = torch.FloatTensor(features)
        self.labels = torch.FloatTensor(labels).reshape(-1, 1)

    def __len__(self):
        return len(self.features)

    def __getitem__(self, idx):
        return self.features[idx], self.labels[idx]

# ============================================================================
# Generate Training Data
# ============================================================================

def generate_pair_data(mobilefacenet_session, age_probe_session, utkface_dirs,
                       num_pairs=1000, max_images=500):
    """
    Generate training pairs from UTKFace

    Note: All UTKFace pairs are different people, so this is a simplified
    training set. In production, we'd need same-person pairs from age-progression
    datasets like FG-NET or MORPH.
    """
    print("[OK] Loading images and extracting features...", flush=True)

    # Load images
    images = []
    ages = []

    for utkface_dir in utkface_dirs:
        if not os.path.exists(utkface_dir):
            continue

        files = sorted(os.listdir(utkface_dir))
        if max_images and len(images) >= max_images:
            break

        for filename in files[:max_images - len(images)]:
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

                images.append((img_path, age))
                ages.append(age)

                if len(images) % 100 == 0:
                    print(f"[OK] Loaded {len(images)} images", flush=True)

            except:
                continue

    print(f"[OK] Loaded {len(images)} images total", flush=True)

    # Extract embeddings and age predictions
    print("[OK] Extracting embeddings and age predictions...", flush=True)

    embeddings = []
    predicted_ages = []
    uncertainties = []

    for idx, (img_path, _) in enumerate(images):
        try:
            # Load and preprocess for MobileFaceNet
            img = cv2.imread(img_path)
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            img_resized = cv2.resize(img_rgb, (112, 112))
            img_normalized = (img_resized.astype(np.float32) - 127.5) / 127.5
            img_input = np.transpose(img_normalized, (2, 0, 1))
            img_input = np.expand_dims(img_input, axis=0)

            # Extract embedding
            emb_outputs = mobilefacenet_session.run(
                None,
                {mobilefacenet_session.get_inputs()[0].name: img_input}
            )
            embedding = emb_outputs[0][0]

            # Predict age and uncertainty
            age_outputs = age_probe_session.run(
                None,
                {age_probe_session.get_inputs()[0].name: embedding.reshape(1, -1).astype(np.float32)}
            )
            pred_age = age_outputs[0][0][0]
            uncertainty = age_outputs[1][0][0]

            embeddings.append(embedding)
            predicted_ages.append(pred_age)
            uncertainties.append(uncertainty)

            if (idx + 1) % 50 == 0:
                print(f"[OK] Processed {idx + 1}/{len(images)} images", flush=True)

        except Exception as e:
            print(f"[ERROR] Failed on {img_path}: {e}")
            embeddings.append(None)
            predicted_ages.append(None)
            uncertainties.append(None)

    # Filter out failed extractions
    valid_indices = [i for i in range(len(embeddings)) if embeddings[i] is not None]
    embeddings = [embeddings[i] for i in valid_indices]
    predicted_ages = [predicted_ages[i] for i in valid_indices]
    uncertainties = [uncertainties[i] for i in valid_indices]
    images = [images[i] for i in valid_indices]

    print(f"[OK] Successfully processed {len(embeddings)} images", flush=True)

    # Generate pairs
    print(f"[OK] Generating {num_pairs} training pairs...", flush=True)

    features = []
    labels = []

    # All UTKFace pairs are different people (label=0)
    # Generate random pairs across different age ranges
    for _ in range(num_pairs):
        i, j = random.sample(range(len(embeddings)), 2)

        # Compute similarity
        emb_i = embeddings[i] / np.linalg.norm(embeddings[i])
        emb_j = embeddings[j] / np.linalg.norm(embeddings[j])
        similarity = float(np.dot(emb_i, emb_j))

        # Age difference
        age_diff = abs(predicted_ages[i] - predicted_ages[j])

        # Average uncertainty
        avg_uncertainty = (uncertainties[i] + uncertainties[j]) / 2

        features.append([similarity, age_diff, avg_uncertainty])
        labels.append(0)  # Different people

    # TODO: Add same-person pairs from age-progression dataset
    # For now, simulate a few high-similarity pairs as "same person"
    # This is imperfect but helps the model learn
    print("[WARN] No same-person pairs available - using high-similarity heuristic", flush=True)

    # Find pairs with very high similarity and small age gap
    high_sim_pairs = []
    for i in range(len(embeddings)):
        for j in range(i + 1, min(i + 100, len(embeddings))):
            emb_i = embeddings[i] / np.linalg.norm(embeddings[i])
            emb_j = embeddings[j] / np.linalg.norm(embeddings[j])
            similarity = float(np.dot(emb_i, emb_j))

            if similarity > 0.7:  # High similarity threshold
                age_diff = abs(predicted_ages[i] - predicted_ages[j])
                avg_uncertainty = (uncertainties[i] + uncertainties[j]) / 2
                high_sim_pairs.append(([similarity, age_diff, avg_uncertainty], 1))

    # Add some synthetic "same person" pairs
    num_same = min(num_pairs // 4, len(high_sim_pairs))  # 25% same-person pairs
    for feat, label in random.sample(high_sim_pairs, num_same):
        features.append(feat)
        labels.append(label)

    print(f"[OK] Generated {len(features)} pairs ({num_same} same-person, {num_pairs} different-person)", flush=True)

    return np.array(features), np.array(labels)

# ============================================================================
# Training
# ============================================================================

def train_calibrator(model, train_loader, val_loader, num_epochs=100, lr=0.001, device='cpu'):
    """Train similarity calibrator"""

    model = model.to(device)
    optimizer = optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)
    criterion = nn.BCELoss()
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='min', factor=0.5, patience=5)

    best_val_loss = float('inf')
    patience_counter = 0

    for epoch in range(num_epochs):
        # Training
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0

        for features, labels in train_loader:
            features = features.to(device)
            labels = labels.to(device)

            optimizer.zero_grad()

            outputs = model(features)
            loss = criterion(outputs, labels)

            loss.backward()
            optimizer.step()

            train_loss += loss.item()

            # Accuracy
            predictions = (outputs > 0.5).float()
            train_correct += (predictions == labels).sum().item()
            train_total += labels.size(0)

        train_loss /= len(train_loader)
        train_acc = 100.0 * train_correct / train_total

        # Validation
        model.eval()
        val_loss = 0.0
        val_correct = 0
        val_total = 0

        with torch.no_grad():
            for features, labels in val_loader:
                features = features.to(device)
                labels = labels.to(device)

                outputs = model(features)
                loss = criterion(outputs, labels)

                val_loss += loss.item()

                predictions = (outputs > 0.5).float()
                val_correct += (predictions == labels).sum().item()
                val_total += labels.size(0)

        val_loss /= len(val_loader)
        val_acc = 100.0 * val_correct / val_total

        # Learning rate scheduling
        scheduler.step(val_loss)

        print(f"Epoch {epoch+1}/{num_epochs}: "
              f"train_loss={train_loss:.4f} train_acc={train_acc:.1f}% "
              f"val_loss={val_loss:.4f} val_acc={val_acc:.1f}% "
              f"lr={optimizer.param_groups[0]['lr']:.6f}")

        # Early stopping
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            patience_counter = 0
            torch.save(model.state_dict(), 'similarity_calibrator_best.pth')
        else:
            patience_counter += 1
            if patience_counter >= 15:
                print(f"[OK] Early stopping at epoch {epoch+1}")
                break

    # Load best model
    model.load_state_dict(torch.load('similarity_calibrator_best.pth'))
    return model

# ============================================================================
# Export to ONNX
# ============================================================================

def export_to_onnx(model, output_path='web/public/models/similarity-calibrator/calibrator.onnx'):
    """Convert PyTorch model to ONNX"""
    model.eval()

    # Dummy input: [similarity, age_diff, uncertainty]
    dummy_input = torch.randn(1, 3)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    torch.onnx.export(
        model,
        dummy_input,
        output_path,
        input_names=['features'],
        output_names=['probability'],
        opset_version=18,
        dynamo=False
    )

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"[OK] Exported to {output_path} ({size_mb:.2f} MB)")

# ============================================================================
# Main
# ============================================================================

if __name__ == '__main__':
    # Load models
    print("[OK] Loading MobileFaceNet...")
    mobilefacenet_path = 'web/public/models/mobilefacenet/mobilefacenet.onnx'
    mobilefacenet_session = ort.InferenceSession(mobilefacenet_path, providers=['CPUExecutionProvider'])

    print("[OK] Loading Age Probe...")
    age_probe_path = 'web/public/models/age-probe/age_probe.onnx'
    age_probe_session = ort.InferenceSession(age_probe_path, providers=['CPUExecutionProvider'])

    # Generate training data
    utkface_dirs = ['utkface-uncropped/part1', 'utkface-uncropped/part2', 'utkface-uncropped/part3']
    features, labels = generate_pair_data(
        mobilefacenet_session,
        age_probe_session,
        utkface_dirs,
        num_pairs=1000,
        max_images=300
    )

    print(f"\n[OK] Dataset: {len(features)} pairs")
    print(f"    Same-person pairs: {labels.sum()}")
    print(f"    Different-person pairs: {len(labels) - labels.sum()}")
    print(f"    Feature ranges:")
    print(f"      Similarity: [{features[:, 0].min():.3f}, {features[:, 0].max():.3f}]")
    print(f"      Age diff: [{features[:, 1].min():.1f}, {features[:, 1].max():.1f}]")
    print(f"      Uncertainty: [{features[:, 2].min():.3f}, {features[:, 2].max():.3f}]")

    # Train/val split
    X_train, X_val, y_train, y_val = train_test_split(
        features, labels, test_size=0.2, random_state=42, stratify=labels
    )

    print(f"\n[OK] Split: {len(X_train)} train, {len(X_val)} val")

    # Create datasets
    train_dataset = FacePairDataset(X_train, y_train)
    val_dataset = FacePairDataset(X_val, y_val)

    train_loader = DataLoader(train_dataset, batch_size=32, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=32, shuffle=False)

    # Train model
    print("\n[OK] Training similarity calibrator...")
    model = SimilarityCalibrator()

    num_params = sum(p.numel() for p in model.parameters())
    print(f"    Model params: {num_params:,} (~{num_params*4/1024/1024:.2f} MB)")

    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"    Device: {device}")

    model = train_calibrator(model, train_loader, val_loader, num_epochs=200, device=device)

    # Export to ONNX
    print("\n[OK] Exporting to ONNX...")
    export_to_onnx(model)

    print("\n[OK] Training complete!")
    print("    Model saved to: similarity_calibrator_best.pth")
    print("    ONNX exported to: web/public/models/similarity-calibrator/calibrator.onnx")
    print("\n[WARN] Training used synthetic same-person pairs (high-similarity heuristic)")
    print("       For production, use real age-progression datasets like FG-NET or MORPH")
