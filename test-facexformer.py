"""
Quick test script for FaceXFormer on CPU
"""
import os
import sys
import numpy as np
import cv2
import torch

# Add facexformer to path
sys.path.insert(0, 'facexformer')

from network import FaceXFormer
from facenet_pytorch import MTCNN
import torchvision
from torchvision.transforms import InterpolationMode
from PIL import Image

def expand_bbox(x_min, y_min, x_max, y_max, img_w, img_h, expansion_factor=0.2):
    """Expand bounding box"""
    bbox_width = x_max - x_min
    bbox_height = y_max - y_min

    x_expansion = bbox_width * expansion_factor
    y_expansion = bbox_height * expansion_factor

    x_min_adjusted = max(0, x_min - x_expansion)
    y_min_adjusted = max(0, y_min - y_expansion)
    x_max_adjusted = min(img_w, x_max + x_expansion)
    y_max_adjusted = min(img_h, y_max + y_expansion)

    return int(x_min_adjusted), int(y_min_adjusted), int(x_max_adjusted), int(y_max_adjusted)

def test_image(model, device, image_path, detector):
    """Test a single image"""
    transforms_image = torchvision.transforms.Compose([
        torchvision.transforms.Resize(size=(224,224), interpolation=InterpolationMode.BICUBIC),
        torchvision.transforms.ToTensor(),
        torchvision.transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])

    # Load image
    im_pil = Image.open(image_path).convert('RGB')
    im_numpy = np.array(im_pil)

    # Detect face
    boxes, probs = detector.detect(im_pil)

    if boxes is None or len(boxes) == 0:
        return None, "No face detected"

    # Use first face
    box = boxes[0]
    img_h, img_w, _ = im_numpy.shape
    x_min, y_min, x_max, y_max = expand_bbox(box[0], box[1], box[2], box[3],
                                              img_w, img_h, expansion_factor=0.2)

    # Crop and transform
    face_crop = im_numpy[y_min:y_max, x_min:x_max]
    face_pil = Image.fromarray(face_crop)
    face_tensor = transforms_image(face_pil).unsqueeze(0).to(device)

    # Run inference
    with torch.no_grad():
        task = torch.tensor([4]).to(device)  # Task 4 = age/gender/race

        # Create dummy labels dict (required by model but not used for inference)
        labels = {
            "segmentation": torch.zeros([1, 224, 224]).to(device),
            "lnm_seg": torch.zeros([1, 5, 2]).to(device),
            "landmark": torch.zeros([1, 68, 2]).to(device),
            "headpose": torch.zeros([1, 3]).to(device),
            "attribute": torch.zeros([1, 40]).to(device),
            "a_g_e": torch.zeros([1, 3]).to(device),
            'visibility': torch.zeros([1, 29]).to(device)
        }

        landmark_output, headpose_output, attribute_output, visibility_output, age_output, gender_output, race_output, seg_output = model(face_tensor, labels, task)

        # Debug: check shapes and values
        print(f"  Debug - age_output shape: {age_output.shape}")
        print(f"  Debug - age_output values (first 10): {age_output[0][:10].cpu().numpy()}")
        print(f"  Debug - age_output max value: {age_output.max().item():.3f}")

        # Extract predictions - age is classification (argmax), not regression
        age_pred = torch.argmax(age_output, dim=1)[0].cpu().item()
        gender_pred = torch.argmax(gender_output, dim=1)[0].cpu().item()
        race_pred = torch.argmax(race_output, dim=1)[0].cpu().item()

        gender_label = 'Male' if gender_pred == 0 else 'Female'
        race_labels = ['White', 'Black', 'Asian', 'Indian', 'Others']
        race_label = race_labels[race_pred]

    return {
        'age': age_pred,
        'gender': gender_label,
        'race': race_label
    }, None

def main():
    # Use CPU
    device = "cpu"
    print(f"Using device: {device}")

    # Load model
    print("Loading FaceXFormer model...")
    model = FaceXFormer().to(device)
    weights_path = "facexformer/ckpts/model.pt"
    checkpoint = torch.load(weights_path, map_location=device)
    model.load_state_dict(checkpoint['state_dict_backbone'])
    model.eval()
    print("Model loaded!")

    # Load MTCNN detector
    print("Loading MTCNN detector...")
    detector = MTCNN(keep_all=False, device=device)
    print("Detector loaded!")

    # Test just one image for debugging
    test_images = [
        ("utkface-uncropped/part1/30_0_0_20170103181149464.jpg", 30),
    ]

    print("\n" + "="*60)
    for img_path, true_age in test_images:
        if not os.path.exists(img_path):
            print(f"Image not found: {img_path}")
            continue

        print(f"\nTesting: {os.path.basename(img_path)}")
        print(f"True age: {true_age}")

        result, error = test_image(model, device, img_path, detector)

        if error:
            print(f"Error: {error}")
        else:
            print(f"Predicted age: {result['age']:.1f}")
            print(f"Error: {abs(result['age'] - true_age):.1f} years")
            print(f"Gender: {result['gender']}")
            print(f"Race: {result['race']}")
        print("-"*60)

if __name__ == "__main__":
    main()
