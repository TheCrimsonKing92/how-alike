#!/usr/bin/env python3
"""
Test alternative gender_age.onnx model on UTKFace samples
"""

import os
import sys
import cv2
import numpy as np
import onnxruntime as ort

def test_model(model_path, test_images):
    """Test ONNX model on sample images"""

    # Load model
    print(f"Loading model: {model_path}")
    session = ort.InferenceSession(model_path)

    # Print model info
    print(f"\nModel inputs:")
    for inp in session.get_inputs():
        print(f"  Name: {inp.name}, Shape: {inp.shape}, Type: {inp.type}")

    print(f"\nModel outputs:")
    for out in session.get_outputs():
        print(f"  Name: {out.name}, Shape: {out.shape}, Type: {out.type}")

    # Test on images
    print(f"\n{'='*70}")
    print("Testing on UTKFace samples:")
    print(f"{'='*70}")

    errors = []

    for img_path, true_age in test_images:
        if not os.path.exists(img_path):
            print(f"SKIP: {img_path} (not found)")
            continue

        # Load and preprocess image
        img = cv2.imread(img_path)
        if img is None:
            print(f"SKIP: {img_path} (could not read)")
            continue

        filename = os.path.basename(img_path)

        # Try different preprocessing approaches
        # Approach 1: Resize to 224x224, normalize to [0,1], RGB
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        img_resized = cv2.resize(img_rgb, (224, 224))
        img_normalized = img_resized.astype(np.float32) / 255.0
        img_batch = np.expand_dims(img_normalized, axis=0)

        try:
            # Run inference
            input_name = session.get_inputs()[0].name
            outputs = session.run(None, {input_name: img_batch})

            # Parse outputs
            # Most models output [gender, age] or separate outputs
            if len(outputs) == 2:
                gender_output = outputs[0][0]
                age_output = outputs[1][0]
            elif len(outputs) == 1:
                # Single output - might be concatenated
                output = outputs[0][0]
                if len(output) == 2:
                    gender_output = output[0]
                    age_output = output[1]
                elif len(output) > 2:
                    # Might be age classes
                    age_output = np.argmax(output) if len(output) > 100 else output[0]
                    gender_output = None
                else:
                    print(f"SKIP: {filename} (unexpected output shape: {output.shape})")
                    continue
            else:
                print(f"SKIP: {filename} (unexpected number of outputs: {len(outputs)})")
                continue

            # Extract age prediction
            if isinstance(age_output, np.ndarray) and age_output.size > 1:
                # Might be age class probabilities
                pred_age = np.argmax(age_output)
            else:
                # Scalar age value (might be normalized)
                pred_age = float(age_output)
                if pred_age < 1:  # If normalized [0,1], scale to [0,100]
                    pred_age = pred_age * 100

            error = abs(pred_age - true_age)
            errors.append(error)

            print(f"Age {true_age:2d} → predicted {pred_age:5.1f} (error: {error:5.1f})")

        except Exception as e:
            print(f"ERROR: {filename} - {e}")
            continue

    print(f"{'='*70}")
    if errors:
        mae = sum(errors) / len(errors)
        print(f"\nMAE: {mae:.2f} years ({len(errors)} images)")
    else:
        print("\nNo successful predictions")

def main():
    # Test images from calibration set
    test_images = [
        ('calibration-images-test/10_1_0_20170109204617417.jpg', 10),
        ('calibration-images-test/26_1_2_20170104015910819.jpg', 26),
        ('calibration-images-test/3_1_3_20170103180407596.jpg', 3),
        ('calibration-images-test/59_1_0_20170110122554230.jpg', 59),
    ]

    model_path = 'web/scripts/model-conversion/models/alternative_gender_age.onnx'
    test_model(model_path, test_images)

if __name__ == '__main__':
    main()
