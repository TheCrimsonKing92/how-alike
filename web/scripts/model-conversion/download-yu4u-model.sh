#!/bin/bash
#
# Download yu4u age estimation pre-trained model
#
# Model: age_only_resnet50_weights.061-3.300-4.410.hdf5
# MAE: 4.41 years on APPA-REAL dataset
# Source: https://github.com/yu4u/age-gender-estimation/releases/tag/v0.5

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODEL_DIR="$SCRIPT_DIR/models"
MODEL_URL="https://github.com/yu4u/age-gender-estimation/releases/download/v0.5/age_only_resnet50_weights.061-3.300-4.410.hdf5"
MODEL_FILE="age_only_resnet50_weights.061-3.300-4.410.hdf5"

echo "Creating model directory..."
mkdir -p "$MODEL_DIR"

echo "Downloading yu4u age estimation model (ResNet50, 4.41 MAE)..."
echo "Source: $MODEL_URL"

if [ -f "$MODEL_DIR/$MODEL_FILE" ]; then
  echo "Model already exists at $MODEL_DIR/$MODEL_FILE"
  echo "File size: $(du -h "$MODEL_DIR/$MODEL_FILE" | cut -f1)"
  exit 0
fi

# Download model
curl -L -o "$MODEL_DIR/$MODEL_FILE" "$MODEL_URL"

echo "Download complete!"
echo "Model saved to: $MODEL_DIR/$MODEL_FILE"
echo "File size: $(du -h "$MODEL_DIR/$MODEL_FILE" | cut -f1)"
