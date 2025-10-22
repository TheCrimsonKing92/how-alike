#!/usr/bin/env python3
"""
Validate ONNX model conversion by comparing Keras vs ONNX outputs
"""

import sys
import os
import numpy as np
import cv2

# Suppress TF warnings
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

def load_keras_model():
    """Load original Keras model"""
    from tensorflow.keras.applications import ResNet50
    from tensorflow.keras.layers import Dense
    from tensorflow.keras.models import Model

    print("Creating Keras model architecture...")
    base_model = ResNet50(
        include_top=False,
        weights=None,
        input_shape=(224, 224, 3),
        pooling='avg'
    )

    prediction = Dense(
        units=101,
        kernel_initializer='he_normal',
        use_bias=False,
        activation='softmax',
        name='pred_age'
    )(base_model.output)

    model = Model(inputs=base_model.input, outputs=prediction)

    print("Loading Keras weights...")
    weights_path = 'web/scripts/model-conversion/models/age_only_resnet50_weights.061-3.300-4.410.hdf5'
    model.load_weights(weights_path, by_name=False)

    return model

def load_onnx_model():
    """Load ONNX model"""
    import onnxruntime as ort

    print("Loading ONNX model...")
    onnx_path = 'web/scripts/model-conversion/models/yu4u_age_resnet50.onnx'
    session = ort.InferenceSession(onnx_path)

    return session

def predict_age(probabilities):
    """Calculate age from probability distribution"""
    ages = np.arange(0, 101)
    return np.sum(probabilities * ages)

def main():
    # Test image
    test_image_path = 'calibration-images-test/10_1_0_20170109204617417.jpg'

    if not os.path.exists(test_image_path):
        print(f"Test image not found: {test_image_path}")
        sys.exit(1)

    print(f"Testing with image: {test_image_path}")
    print(f"Expected age: 10 years\n")

    # Load and preprocess image
    print("Loading test image...")
    img = cv2.imread(test_image_path)
    img_resized = cv2.resize(img, (224, 224))

    print(f"Image shape: {img_resized.shape}")
    print(f"Image dtype: {img_resized.dtype}")
    print(f"Image value range: [{img_resized.min()}, {img_resized.max()}]")
    print(f"Sample pixel (BGR): {img_resized[100, 100]}\n")

    # Prepare input for Keras (expects BGR, float32, no normalization)
    keras_input = img_resized.astype(np.float32)
    keras_input = np.expand_dims(keras_input, axis=0)  # Add batch dimension

    # Prepare input for ONNX (same as Keras)
    onnx_input = keras_input.copy()

    # Test Keras model
    print("=" * 60)
    print("KERAS MODEL")
    print("=" * 60)
    keras_model = load_keras_model()
    keras_probs = keras_model.predict(keras_input, verbose=0)[0]
    keras_age = predict_age(keras_probs)

    print(f"Predicted age: {keras_age:.1f} years")
    print(f"Top 5 probabilities:")
    top5_indices = np.argsort(keras_probs)[-5:][::-1]
    for idx in top5_indices:
        print(f"  Age {idx}: {keras_probs[idx]*100:.2f}%")

    # Test ONNX model
    print("\n" + "=" * 60)
    print("ONNX MODEL")
    print("=" * 60)
    onnx_session = load_onnx_model()
    input_name = onnx_session.get_inputs()[0].name
    onnx_probs = onnx_session.run(None, {input_name: onnx_input})[0][0]
    onnx_age = predict_age(onnx_probs)

    print(f"Predicted age: {onnx_age:.1f} years")
    print(f"Top 5 probabilities:")
    top5_indices = np.argsort(onnx_probs)[-5:][::-1]
    for idx in top5_indices:
        print(f"  Age {idx}: {onnx_probs[idx]*100:.2f}%")

    # Compare outputs
    print("\n" + "=" * 60)
    print("COMPARISON")
    print("=" * 60)
    diff = np.abs(keras_probs - onnx_probs)
    max_diff = diff.max()
    mean_diff = diff.mean()

    print(f"Age prediction difference: {abs(keras_age - onnx_age):.2f} years")
    print(f"Probability max difference: {max_diff:.6f}")
    print(f"Probability mean difference: {mean_diff:.6f}")

    if max_diff < 0.001:
        print("\n[OK] Models are equivalent!")
    elif max_diff < 0.01:
        print("\n[WARNING] Small differences detected (likely acceptable)")
    else:
        print("\n[ERROR] Significant differences detected!")
        print("The ONNX conversion may be incorrect.")

if __name__ == '__main__':
    main()
