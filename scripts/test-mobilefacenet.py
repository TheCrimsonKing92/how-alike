"""
Test MobileFaceNet ONNX model and check embedding dimensions
"""
import onnxruntime as ort
import numpy as np
import cv2
import os

# Load model
model_path = 'web/public/models/mobilefacenet/mobilefacenet.onnx'
print(f"Loading model from: {model_path}")
session = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])

# Print model info
print("\n=== Model Metadata ===")
for input_meta in session.get_inputs():
    print(f"Input: {input_meta.name}, shape: {input_meta.shape}, type: {input_meta.type}")

for output_meta in session.get_outputs():
    print(f"Output: {output_meta.name}, shape: {output_meta.shape}, type: {output_meta.type}")

# Test with dummy image
print("\n=== Test Inference ===")
dummy_input = np.random.randn(1, 3, 112, 112).astype(np.float32)
print(f"Input shape: {dummy_input.shape}")

outputs = session.run(None, {session.get_inputs()[0].name: dummy_input})
print(f"Output shape: {outputs[0].shape}")
print(f"Embedding dimension: {outputs[0].shape[-1]}")

# Test with real image if available
test_images = [
    'utkface-uncropped/part1/30_0_0_20170103181149464.jpg',
    'utkface-uncropped/part1/1_0_0_20161219140623097.jpg',
]

for img_path in test_images:
    if os.path.exists(img_path):
        print(f"\n=== Testing with: {os.path.basename(img_path)} ===")

        # Load and preprocess image
        img = cv2.imread(img_path)
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        # Resize to 112x112
        img_resized = cv2.resize(img_rgb, (112, 112))

        # Normalize  (as per InsightFace: mean=127.5, std=127.5)
        img_normalized = (img_resized.astype(np.float32) - 127.5) / 127.5

        # Convert to NCHW format
        img_input = np.transpose(img_normalized, (2, 0, 1))
        img_input = np.expand_dims(img_input, axis=0)

        print(f"Preprocessed shape: {img_input.shape}")
        print(f"Value range: [{img_input.min():.3f}, {img_input.max():.3f}]")

        # Run inference
        embeddings = session.run(None, {session.get_inputs()[0].name: img_input})
        embedding = embeddings[0][0]

        print(f"Embedding shape: {embedding.shape}")
        print(f"Embedding norm: {np.linalg.norm(embedding):.3f}")
        print(f"Embedding sample (first 10): {embedding[:10]}")

print("\n=== Summary ===")
print(f"✅ Model loaded successfully")
print(f"✅ Input: [batch, 3, 112, 112]")
print(f"✅ Output: [batch, {outputs[0].shape[-1]}] (embedding dimension)")
print(f"✅ Ready for browser integration")
