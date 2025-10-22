"""
Train age probe: MobileFaceNet embeddings -> (age, uncertainty)

Architecture:
  Input: 512D embeddings
  Hidden: Dense(128, ReLU) -> Dense(64, ReLU)
  Output: age (Dense(1, ReLU)), uncertainty (Dense(1, Softplus))

Loss: Combined MAE for age + uncertainty regularization
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

# ============================================================================
# Age Probe Model
# ============================================================================

class AgeProbe(nn.Module):
    """Tiny MLP for age prediction from face embeddings"""

    def __init__(self, embedding_dim=512):
        super().__init__()

        # Feature extractor
        self.features = nn.Sequential(
            nn.Linear(embedding_dim, 128),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Dropout(0.1),
        )

        # Age prediction head
        self.age_head = nn.Sequential(
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
            nn.ReLU(),  # Age is always positive
        )

        # Uncertainty head (epistemic uncertainty)
        self.uncertainty_head = nn.Sequential(
            nn.Linear(64, 16),
            nn.ReLU(),
            nn.Linear(16, 1),
            nn.Softplus(),  # Uncertainty is always positive
        )

    def forward(self, x):
        features = self.features(x)
        age = self.age_head(features)
        uncertainty = self.uncertainty_head(features)
        return age, uncertainty

# ============================================================================
# Dataset
# ============================================================================

class UTKFaceEmbeddingDataset(Dataset):
    """Dataset of precomputed MobileFaceNet embeddings and ages"""

    def __init__(self, embeddings, ages):
        self.embeddings = torch.FloatTensor(embeddings)
        self.ages = torch.FloatTensor(ages).reshape(-1, 1)

    def __len__(self):
        return len(self.embeddings)

    def __getitem__(self, idx):
        return self.embeddings[idx], self.ages[idx]

# ============================================================================
# Embedding Extraction
# ============================================================================

def extract_embeddings_from_utkface(model_session, utkface_dirs, max_samples=None):
    """Extract MobileFaceNet embeddings from UTKFace images"""
    embeddings = []
    ages = []

    print("\n[OK] Extracting embeddings from UTKFace...", flush=True)

    for utkface_dir in utkface_dirs:
        if not os.path.exists(utkface_dir):
            print(f"[SKIP] {utkface_dir} not found", flush=True)
            continue

        print(f"[OK] Processing directory: {utkface_dir}", flush=True)
        files = sorted(os.listdir(utkface_dir))
        if max_samples:
            remaining = max_samples - len(embeddings)
            if remaining <= 0:
                break
            files = files[:remaining]

        print(f"[OK] Found {len(files)} files to process", flush=True)

        for idx, filename in enumerate(files, 1):
            try:
                # Parse age from filename (format: age_gender_race_timestamp.jpg)
                parts = filename.split('_')
                if len(parts) < 4:
                    continue

                age = int(parts[0])
                if age > 100:  # Filter outliers
                    continue

                # Load and preprocess image
                img_path = os.path.join(utkface_dir, filename)
                img = cv2.imread(img_path)
                if img is None:
                    continue

                img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                img_resized = cv2.resize(img_rgb, (112, 112))
                img_normalized = (img_resized.astype(np.float32) - 127.5) / 127.5
                img_input = np.transpose(img_normalized, (2, 0, 1))
                img_input = np.expand_dims(img_input, axis=0)

                # Extract embedding
                outputs = model_session.run(None, {model_session.get_inputs()[0].name: img_input})
                embedding = outputs[0][0]

                embeddings.append(embedding)
                ages.append(age)

                # Progress update every 50 images
                if len(embeddings) % 50 == 0:
                    print(f"[OK] Processed {len(embeddings)} images (age {age}, dir {utkface_dir})", flush=True)

            except Exception as e:
                continue

    print(f"[OK] Extracted {len(embeddings)} embeddings")
    return np.array(embeddings), np.array(ages)

# ============================================================================
# Training
# ============================================================================

def train_age_probe(model, train_loader, val_loader, num_epochs=50, lr=0.001, device='cpu'):
    """Train age probe with uncertainty estimation"""

    model = model.to(device)
    optimizer = optim.Adam(model.parameters(), lr=lr, weight_decay=1e-5)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='min', factor=0.5, patience=5)

    best_val_loss = float('inf')
    patience_counter = 0

    for epoch in range(num_epochs):
        # Training
        model.train()
        train_loss = 0.0
        train_mae = 0.0

        for embeddings, ages in train_loader:
            embeddings = embeddings.to(device)
            ages = ages.to(device)

            optimizer.zero_grad()

            pred_age, pred_unc = model(embeddings)

            # Combined loss: MAE + uncertainty regularization
            # Encourage lower uncertainty when predictions are accurate
            mae = torch.abs(pred_age - ages)
            loss = (mae + 0.1 * pred_unc).mean()

            loss.backward()
            optimizer.step()

            train_loss += loss.item()
            train_mae += mae.mean().item()

        train_loss /= len(train_loader)
        train_mae /= len(train_loader)

        # Validation
        model.eval()
        val_loss = 0.0
        val_mae = 0.0

        with torch.no_grad():
            for embeddings, ages in val_loader:
                embeddings = embeddings.to(device)
                ages = ages.to(device)

                pred_age, pred_unc = model(embeddings)

                mae = torch.abs(pred_age - ages)
                loss = (mae + 0.1 * pred_unc).mean()

                val_loss += loss.item()
                val_mae += mae.mean().item()

        val_loss /= len(val_loader)
        val_mae /= len(val_loader)

        # Learning rate scheduling
        scheduler.step(val_loss)

        print(f"Epoch {epoch+1}/{num_epochs}: "
              f"train_mae={train_mae:.2f} val_mae={val_mae:.2f} "
              f"lr={optimizer.param_groups[0]['lr']:.6f}")

        # Early stopping
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            patience_counter = 0
            # Save best model
            torch.save(model.state_dict(), 'age_probe_best.pth')
        else:
            patience_counter += 1
            if patience_counter >= 10:
                print(f"[OK] Early stopping at epoch {epoch+1}")
                break

    # Load best model
    model.load_state_dict(torch.load('age_probe_best.pth'))
    return model

# ============================================================================
# Export to ONNX
# ============================================================================

def export_to_onnx(model, output_path='web/public/models/age-probe/age_probe.onnx'):
    """Convert PyTorch model to ONNX"""
    model.eval()

    # Dummy input
    dummy_input = torch.randn(1, 512)

    # Export
    torch.onnx.export(
        model,
        dummy_input,
        output_path,
        input_names=['embeddings'],
        output_names=['age', 'uncertainty'],
        dynamic_axes={
            'embeddings': {0: 'batch_size'},
            'age': {0: 'batch_size'},
            'uncertainty': {0: 'batch_size'}
        },
        opset_version=14
    )

    # Get file size
    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"[OK] Exported to {output_path} ({size_mb:.2f} MB)")

# ============================================================================
# Main
# ============================================================================

if __name__ == '__main__':
    # Load MobileFaceNet
    print("[OK] Loading MobileFaceNet...")
    model_path = 'web/public/models/mobilefacenet/mobilefacenet.onnx'
    session = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])

    # Extract embeddings from UTKFace
    utkface_dirs = ['utkface-uncropped/part1', 'utkface-uncropped/part2', 'utkface-uncropped/part3']
    embeddings, ages = extract_embeddings_from_utkface(session, utkface_dirs, max_samples=500)

    print(f"\n[OK] Dataset: {len(embeddings)} samples")
    print(f"    Age range: {ages.min()}-{ages.max()}")
    print(f"    Age mean: {ages.mean():.1f} +/- {ages.std():.1f}")

    # Train/val split
    X_train, X_val, y_train, y_val = train_test_split(
        embeddings, ages, test_size=0.15, random_state=42
    )

    print(f"\n[OK] Split: {len(X_train)} train, {len(X_val)} val")

    # Create datasets
    train_dataset = UTKFaceEmbeddingDataset(X_train, y_train)
    val_dataset = UTKFaceEmbeddingDataset(X_val, y_val)

    train_loader = DataLoader(train_dataset, batch_size=64, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=64, shuffle=False)

    # Train model
    print("\n[OK] Training age probe...")
    model = AgeProbe(embedding_dim=512)

    # Print model size
    num_params = sum(p.numel() for p in model.parameters())
    print(f"    Model params: {num_params:,} (~{num_params*4/1024/1024:.2f} MB)")

    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"    Device: {device}")

    model = train_age_probe(model, train_loader, val_loader, num_epochs=100, device=device)

    # Export to ONNX
    print("\n[OK] Exporting to ONNX...")
    os.makedirs('web/public/models/age-probe', exist_ok=True)
    export_to_onnx(model)

    print("\n[OK] Training complete!")
    print("    Model saved to: age_probe_best.pth")
    print("    ONNX exported to: web/public/models/age-probe/age_probe.onnx")
