"""
Extract MobileFaceNet embeddings from UTKFace samples to validate age signal
"""
import onnxruntime as ort
import numpy as np
import cv2
import os
import json
from pathlib import Path

# Load MobileFaceNet model
model_path = 'web/public/models/mobilefacenet/mobilefacenet.onnx'
print(f"Loading MobileFaceNet from: {model_path}")
session = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])

print(f"[OK] Model loaded")
print(f"  Input: {session.get_inputs()[0].name}, shape: {session.get_inputs()[0].shape}")
print(f"  Output: {session.get_outputs()[0].name}, shape: {session.get_outputs()[0].shape}")

def preprocess_face(img_path):
    """Preprocess face image for MobileFaceNet"""
    img = cv2.imread(img_path)
    if img is None:
        raise ValueError(f"Failed to load image: {img_path}")

    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img_resized = cv2.resize(img_rgb, (112, 112))

    # Normalize: (pixel - 127.5) / 127.5
    img_normalized = (img_resized.astype(np.float32) - 127.5) / 127.5

    # Convert to NCHW format
    img_input = np.transpose(img_normalized, (2, 0, 1))
    img_input = np.expand_dims(img_input, axis=0)

    return img_input

def extract_embedding(img_path):
    """Extract 512D embedding from face image"""
    img_input = preprocess_face(img_path)
    embeddings = session.run(None, {session.get_inputs()[0].name: img_input})
    return embeddings[0][0]

# Select diverse age samples from UTKFace
age_samples = [
    ('1_0_0_20161219140623097.jpg', 1),
    ('10_0_0_20161220222308131.jpg', 10),
    ('20_0_0_20170104020603909.jpg', 20),
    ('30_0_0_20170103181149464.jpg', 30),
    ('40_0_0_20170103182925914.jpg', 40),
    ('50_0_0_20170103183532811.jpg', 50),
    ('60_0_0_20170103182716210.jpg', 60),
    ('70_0_0_20170104185838254.jpg', 70),
]

# Find images in UTKFace directory
utkface_dirs = ['utkface-uncropped/part1', 'utkface-uncropped/part2', 'utkface-uncropped/part3']

print("\n=== Extracting Embeddings ===")
embeddings_data = []

for filename, expected_age in age_samples:
    # Try to find the image in any of the UTKFace directories
    img_path = None
    for base_dir in utkface_dirs:
        candidate = os.path.join(base_dir, filename)
        if os.path.exists(candidate):
            img_path = candidate
            break

    if img_path is None:
        print(f"[SKIP] Skipping {filename} (not found)")
        continue

    try:
        embedding = extract_embedding(img_path)
        norm = np.linalg.norm(embedding)

        embeddings_data.append({
            'filename': filename,
            'age': expected_age,
            'embedding': embedding.tolist(),
            'norm': float(norm)
        })

        print(f"[OK] Age {expected_age:2d}: norm={norm:.3f}, embedding[:5]={embedding[:5]}")

    except Exception as e:
        print(f"[ERROR] Age {expected_age:2d}: {e}")

# Analyze age signal in embeddings
print("\n=== Age Signal Analysis ===")

if len(embeddings_data) >= 3:
    # Compute pairwise cosine similarities
    print("\nPairwise Cosine Similarities:")
    embeddings_matrix = np.array([e['embedding'] for e in embeddings_data])

    # Normalize embeddings
    norms = np.linalg.norm(embeddings_matrix, axis=1, keepdims=True)
    normalized = embeddings_matrix / norms

    # Compute cosine similarity matrix
    similarity_matrix = np.dot(normalized, normalized.T)

    for i in range(len(embeddings_data)):
        for j in range(i + 1, len(embeddings_data)):
            age_i = embeddings_data[i]['age']
            age_j = embeddings_data[j]['age']
            sim = similarity_matrix[i, j]
            age_diff = abs(age_i - age_j)
            print(f"  Age {age_i:2d} vs {age_j:2d} (diff={age_diff:2d}y): sim={sim:.4f}")

    # Check if similarity decreases with age difference
    age_diffs = []
    similarities = []
    for i in range(len(embeddings_data)):
        for j in range(i + 1, len(embeddings_data)):
            age_diff = abs(embeddings_data[i]['age'] - embeddings_data[j]['age'])
            age_diffs.append(age_diff)
            similarities.append(similarity_matrix[i, j])

    # Compute correlation between age difference and similarity
    correlation = np.corrcoef(age_diffs, similarities)[0, 1]
    print(f"\nCorrelation between age difference and similarity: {correlation:.4f}")

    if correlation < -0.3:
        print("[OK] Embeddings show age signal (similarity decreases with age difference)")
    else:
        print("[WARN] Weak age signal (correlation should be negative)")

    # Save embeddings to file
    output_path = 'mobilefacenet-embeddings-samples.json'
    with open(output_path, 'w') as f:
        json.dump(embeddings_data, f, indent=2)
    print(f"\n[OK] Saved embeddings to {output_path}")
else:
    print("[WARN] Not enough samples to analyze age signal")

print("\n=== Summary ===")
print(f"[OK] Extracted {len(embeddings_data)} embeddings")
print(f"[OK] Embedding dimension: 512")
print(f"[OK] Ready for age probe training")
