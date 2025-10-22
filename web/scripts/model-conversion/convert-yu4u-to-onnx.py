#!/usr/bin/env python3
"""
Convert yu4u age estimation model from Keras HDF5 to ONNX format

Model: age_only_resnet50_weights.061-3.300-4.410.hdf5
MAE: 4.41 years on APPA-REAL dataset
Source: https://github.com/yu4u/age-gender-estimation

Input: 64x64x3 RGB image ([0, 255] range)
Output: 101-class probability distribution (ages 0-100)
Age prediction: weighted sum of probabilities
"""

import os
import sys
import site

# Add user site-packages to path (for --user installed packages)
user_site = site.getusersitepackages()
if user_site not in sys.path:
    sys.path.insert(0, user_site)

def install_dependencies():
    """Install required packages"""
    import subprocess

    packages = [
        'numpy',
        'tensorflow==2.15.0',
        'keras==2.15.0',
        'tf2onnx',
        'onnx',
        'onnxruntime'
    ]

    print("Installing dependencies...")
    for package in packages:
        print(f"  Installing {package}...")
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--user', '-q', package])
    print("Dependencies installed successfully!\n")

def create_age_model(img_size=224):
    """
    Use yu4u's EXACT model creation from model.py (old Keras 2.x API)

    Args:
        img_size: Input image size (default: 224)

    Returns:
        Keras model
    """
    # Use old keras (not tensorflow.keras) to match their trained model
    from keras.applications import ResNet50
    from keras.layers import Dense
    from keras.models import Model

    # Exact copy of yu4u's get_model() function for ResNet50
    base_model = ResNet50(include_top=False, weights='imagenet', input_shape=(224, 224, 3), pooling="avg")
    prediction = Dense(units=101, kernel_initializer="he_normal", use_bias=False, activation="softmax",
                       name="pred_age")(base_model.output)
    model = Model(inputs=base_model.input, outputs=prediction)

    return model

def convert_to_onnx(keras_model_path, onnx_output_path, img_size=224):
    """
    Convert Keras HDF5 model to ONNX format

    Args:
        keras_model_path: Path to .hdf5 weights file
        onnx_output_path: Output path for .onnx file
        img_size: Input image size
    """
    import tf2onnx
    import onnx
    from tensorflow import keras

    print(f"Creating model architecture (input size: {img_size}x{img_size})...")
    model = create_age_model(img_size=img_size)

    print(f"Loading weights from {keras_model_path}...")
    # Load weights by topology (not by name) - HDF5 uses old Keras layer names
    model.load_weights(keras_model_path, by_name=False)

    print("Model summary:")
    model.summary()

    print("\nConverting to ONNX...")
    # Convert using tf2onnx
    onnx_model, _ = tf2onnx.convert.from_keras(
        model,
        input_signature=None,
        opset=13,
        output_path=onnx_output_path
    )

    print(f"\nONNX model saved to: {onnx_output_path}")

    # Validate ONNX model
    print("\nValidating ONNX model...")
    onnx_model_check = onnx.load(onnx_output_path)
    onnx.checker.check_model(onnx_model_check)
    print("[OK] ONNX model is valid")

    # Print model info
    file_size_mb = os.path.getsize(onnx_output_path) / (1024 * 1024)
    print(f"[OK] Model size: {file_size_mb:.2f} MB")

    # Print input/output specs
    print("\nModel specifications:")
    print(f"  Input: {onnx_model_check.graph.input[0].name}")
    print(f"         shape: {[dim.dim_value for dim in onnx_model_check.graph.input[0].type.tensor_type.shape.dim]}")
    print(f"  Output: {onnx_model_check.graph.output[0].name}")
    print(f"          shape: {[dim.dim_value for dim in onnx_model_check.graph.output[0].type.tensor_type.shape.dim]}")
    print(f"          interpretation: 101-class probabilities for ages 0-100")
    print(f"          age = sum(prob[i] * i for i in range(101))")

    return onnx_output_path

def test_conversion(onnx_path):
    """
    Test the converted ONNX model with a dummy input

    Args:
        onnx_path: Path to ONNX model
    """
    import onnxruntime as ort
    import numpy as np

    print("\n" + "="*60)
    print("Testing ONNX model...")
    print("="*60)

    # Create ONNX Runtime session
    session = ort.InferenceSession(onnx_path)

    print(f"[OK] ONNX Runtime session created")
    print(f"  Providers: {session.get_providers()}")

    # Create dummy input (224x224 RGB image with random values)
    input_name = session.get_inputs()[0].name
    input_shape = session.get_inputs()[0].shape
    # Replace dynamic batch dimension (0 or symbolic) with 1
    input_shape = tuple(1 if (isinstance(dim, str) or dim == 0) else int(dim) for dim in input_shape)
    dummy_input = np.random.randint(0, 255, size=input_shape).astype(np.float32)

    print(f"\nRunning inference with dummy input...")
    print(f"  Input shape: {input_shape}")
    print(f"  Input name: {input_name}")

    # Run inference
    outputs = session.run(None, {input_name: dummy_input})
    probabilities = outputs[0][0]  # Shape: (101,)

    # Calculate predicted age (weighted sum)
    predicted_age = sum(prob * age for age, prob in enumerate(probabilities))

    print(f"\n[OK] Inference successful!")
    print(f"  Output shape: {probabilities.shape}")
    print(f"  Predicted age: {predicted_age:.1f} years")
    print(f"  Top 3 classes:")

    top_indices = np.argsort(probabilities)[-3:][::-1]
    for idx in top_indices:
        print(f"    Age {idx}: {probabilities[idx]*100:.2f}%")

def main():
    """Main conversion workflow"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    models_dir = os.path.join(script_dir, 'models')

    keras_model_path = os.path.join(models_dir, 'age_only_resnet50_weights.061-3.300-4.410.hdf5')
    onnx_output_path = os.path.join(models_dir, 'yu4u_age_resnet50.onnx')

    print("="*60)
    print("yu4u Age Estimation Model Converter")
    print("Keras HDF5 -> ONNX")
    print("="*60)
    print()

    # Check if Keras model exists
    if not os.path.exists(keras_model_path):
        print(f"Error: Keras model not found at {keras_model_path}")
        print("Please run download-yu4u-model.sh first")
        sys.exit(1)

    # Install dependencies
    install_dependencies()

    # Convert to ONNX
    try:
        convert_to_onnx(keras_model_path, onnx_output_path, img_size=224)

        # Test the converted model
        test_conversion(onnx_output_path)

        print("\n" + "="*60)
        print("[SUCCESS] Conversion completed successfully!")
        print("="*60)
        print(f"\nONNX model ready at: {onnx_output_path}")
        print("\nNext steps:")
        print("1. Copy model to web/public/models/age-gender/")
        print("2. Update age-estimation.ts to use new model")
        print("3. Test with UTKFace samples")

    except Exception as e:
        print(f"\n[ERROR] Conversion failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()
