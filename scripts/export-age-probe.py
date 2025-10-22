"""
Export trained age probe to ONNX format
"""
import torch
import torch.nn as nn
import os
import sys

# Import the model class from train script
sys.path.insert(0, os.path.dirname(__file__))

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

# Load trained model
print("[OK] Loading trained model...")
model = AgeProbe(embedding_dim=512)
model.load_state_dict(torch.load('age_probe_best.pth'))
model.eval()

# Export to ONNX
output_path = 'web/public/models/age-probe/age_probe.onnx'
os.makedirs(os.path.dirname(output_path), exist_ok=True)

print("[OK] Exporting to ONNX...")
dummy_input = torch.randn(1, 512)

torch.onnx.export(
    model,
    dummy_input,
    output_path,
    input_names=['embeddings'],
    output_names=['age', 'uncertainty'],
    opset_version=18,
    dynamo=False  # Use legacy exporter to avoid dynamic_shapes issue
)

# Get file size
size_mb = os.path.getsize(output_path) / (1024 * 1024)
print(f"[OK] Exported to {output_path} ({size_mb:.2f} MB)")
print(f"[OK] ONNX export complete!")
