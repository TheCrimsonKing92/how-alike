"""
Download InsightFace buffalo_sc model and extract MobileFaceNet ONNX
"""
import os
from insightface.app import FaceAnalysis

# Initialize with buffalo_sc (16MB, most compact)
print("Downloading buffalo_sc model pack...")
app = FaceAnalysis(name='buffalo_sc', providers=['CPUExecutionProvider'])
app.prepare(ctx_id=0, det_size=(640, 640))

# The models are downloaded to ~/.insightface/models/buffalo_sc/
# Find the recognition model
models_dir = os.path.expanduser('~/.insightface/models/buffalo_sc')
print(f"\nModels downloaded to: {models_dir}")
print("\nContents:")
for file in os.listdir(models_dir):
    filepath = os.path.join(models_dir, file)
    size_mb = os.path.getsize(filepath) / (1024 * 1024)
    print(f"  {file}: {size_mb:.2f} MB")

# Find the recognition model (w600k_r50.onnx)
rec_model = None
for file in os.listdir(models_dir):
    if 'w600k' in file.lower() or 'r50' in file.lower():
        rec_model = file
        break

if rec_model:
    print(f"\nRecognition model: {rec_model}")
    rec_path = os.path.join(models_dir, rec_model)
    size_mb = os.path.getsize(rec_path) / (1024 * 1024)
    print(f"Size: {size_mb:.2f} MB")

    # Copy to project
    import shutil
    dest = 'web/public/models/mobilefacenet/'
    os.makedirs(dest, exist_ok=True)
    dest_path = os.path.join(dest, 'mobilefacenet.onnx')
    shutil.copy(rec_path, dest_path)
    print(f"\nCopied to: {dest_path}")
else:
    print("\nRecognition model not found!")
    print("Available files:")
    for file in os.listdir(models_dir):
        print(f"  - {file}")
