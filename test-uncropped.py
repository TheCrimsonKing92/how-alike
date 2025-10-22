#!/usr/bin/env python3
"""
Test yu4u model on uncropped UTKFace images with face detection + margin
Uses OpenCV Haar Cascade (simpler than dlib, no compilation needed)
"""

import os
import sys
import cv2
import numpy as np
from tensorflow.keras.applications import ResNet50
from tensorflow.keras.layers import Dense
from tensorflow.keras.models import Model

def load_model():
    """Load yu4u age model"""
    print("Loading yu4u model...")
    base = ResNet50(
        include_top=False,
        weights='imagenet',
        input_shape=(224, 224, 3),
        pooling='avg'
    )
    pred = Dense(
        units=101,
        kernel_initializer='he_normal',
        use_bias=False,
        activation='softmax',
        name='pred_age'
    )(base.output)
    model = Model(inputs=base.input, outputs=pred)
    model.load_weights('web/scripts/model-conversion/models/age_only_resnet50_weights.061-3.300-4.410.hdf5', by_name=True)
    return model

def predict_age(model, img_bgr):
    """Predict age from BGR image"""
    img_resized = cv2.resize(img_bgr, (224, 224)).astype(np.float32)
    img_batch = np.expand_dims(img_resized, axis=0)
    probs = model.predict(img_batch, verbose=0)[0]
    return sum(probs[i] * i for i in range(101))

def main():
    # Load face detector (Haar Cascade)
    cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
    face_cascade = cv2.CascadeClassifier(cascade_path)
    if face_cascade.empty():
        print("Error: Could not load face cascade")
        sys.exit(1)

    print("Face detector loaded\n")

    # Load model
    model = load_model()
    print("Model loaded\n")

    # Test images - random sample across age range
    test_images = [
        'utkface-uncropped/part1/1_0_2_20161219161621566.jpg',
        'utkface-uncropped/part1/3_0_2_20161219221758967.jpg',
        'utkface-uncropped/part1/8_1_0_20170109201107015.jpg',
        'utkface-uncropped/part1/16_0_0_20170110232757924.jpg',
        'utkface-uncropped/part1/21_0_4_20170103223143358.jpg',
        'utkface-uncropped/part2/25_0_0_20170117143430849.jpg',
        'utkface-uncropped/part1/35_1_3_20170104235206234.jpg',
        'utkface-uncropped/part1/38_1_0_20170104192820567.jpg',
        'utkface-uncropped/part2/39_0_1_20170116193433706.jpg',
        'utkface-uncropped/part2/40_1_0_20170117182524092.jpg',
        'utkface-uncropped/part2/43_0_0_20170117171818356.jpg',
        'utkface-uncropped/part1/51_0_0_20170104205242540.jpg',
        'utkface-uncropped/part2/54_0_3_20170117171017251.jpg',
        'utkface-uncropped/part1/55_0_0_20170104205336259.jpg',
        'utkface-uncropped/part3/55_0_3_20170119202440701.jpg',
        'utkface-uncropped/part2/56_0_1_20170113174030713.jpg',
        'utkface-uncropped/part1/64_0_0_20170105183706463.jpg',
        'utkface-uncropped/part1/68_0_0_20170104184826326.jpg',
        'utkface-uncropped/part1/90_1_0_20170110183149030.jpg',
        'utkface-uncropped/part2/100_1_2_20170112213615815.jpg',
    ]

    print("Testing on uncropped images with face detection + 40% margin:\n")
    print("=" * 70)

    errors = []

    for img_path in test_images:
        if not os.path.exists(img_path):
            print(f"SKIP: {img_path} (not found)")
            continue

        # Extract true age from filename
        filename = os.path.basename(img_path)
        true_age = int(filename.split('_')[0])

        # Load image
        img = cv2.imread(img_path)
        if img is None:
            print(f"SKIP: {img_path} (could not read)")
            continue

        h, w = img.shape[:2]

        # Detect faces
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))

        if len(faces) == 0:
            print(f"SKIP: {filename} (no face detected)")
            continue

        # Use largest face
        face = max(faces, key=lambda f: f[2] * f[3])
        x, y, fw, fh = face

        # Add 40% margin (matching yu4u demo.py default)
        margin = 0.4
        xw1 = max(int(x - margin * fw), 0)
        yw1 = max(int(y - margin * fh), 0)
        xw2 = min(int(x + fw + margin * fw), w - 1)
        yw2 = min(int(y + fh + margin * fh), h - 1)

        # Crop with margin
        face_crop = img[yw1:yw2, xw1:xw2]

        # Predict age
        pred_age = predict_age(model, face_crop)
        error = abs(pred_age - true_age)
        errors.append(error)

        print(f"Age {true_age:2d} -> predicted {pred_age:5.1f} (error: {error:5.1f})")

    print("=" * 70)
    if errors:
        mae = sum(errors) / len(errors)
        print(f"\nMAE: {mae:.2f} years ({len(errors)} images)")
    else:
        print("\nNo successful predictions")

if __name__ == '__main__':
    main()
