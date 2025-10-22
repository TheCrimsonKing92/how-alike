"""
Download CALFW (Cross-Age LFW) dataset

CALFW is specifically designed for cross-age face verification:
- 3,000 positive face pairs with age gaps
- 3,000 negative pairs (same gender/race)
- Real age-invariant identity matching

Official website: http://whdeng.cn/CALFW/index.html
"""
import os
import requests
import zipfile
from pathlib import Path

# CALFW download URLs (from official website)
CALFW_IMAGES_URL = "http://whdeng.cn/CALFW/ca-aligned.zip"  # Aligned images
CALFW_PAIRS_URL = "http://whdeng.cn/CALFW/calfw_pairs.txt"  # Verification pairs

OUTPUT_DIR = "calfw"

def download_file(url, output_path):
    """Download file with progress bar"""
    print(f"[OK] Downloading {url}")

    response = requests.get(url, stream=True)
    response.raise_for_status()

    total_size = int(response.headers.get('content-length', 0))
    downloaded = 0

    with open(output_path, 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
            downloaded += len(chunk)
            if total_size > 0:
                pct = 100 * downloaded / total_size
                print(f"\r  Progress: {pct:.1f}% ({downloaded / 1024 / 1024:.1f} MB)", end='', flush=True)

    print(f"\n[OK] Downloaded: {output_path}")
    return output_path

def download_calfw():
    """Download CALFW dataset"""

    print("[OK] Downloading CALFW dataset...")
    print(f"    Output: {OUTPUT_DIR}")

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Download aligned images
    images_zip = os.path.join(OUTPUT_DIR, "ca-aligned.zip")
    if not os.path.exists(images_zip):
        download_file(CALFW_IMAGES_URL, images_zip)

        # Extract
        print(f"[OK] Extracting images...")
        with zipfile.ZipFile(images_zip, 'r') as zip_ref:
            zip_ref.extractall(OUTPUT_DIR)
        print(f"[OK] Extracted to {OUTPUT_DIR}")
    else:
        print(f"[OK] Images already exist: {images_zip}")

    # Download pairs file
    pairs_file = os.path.join(OUTPUT_DIR, "calfw_pairs.txt")
    if not os.path.exists(pairs_file):
        download_file(CALFW_PAIRS_URL, pairs_file)
    else:
        print(f"[OK] Pairs file already exists: {pairs_file}")

    # Parse pairs file
    print(f"\n[OK] Parsing pairs file...")
    with open(pairs_file, 'r') as f:
        lines = f.readlines()

    num_folds = int(lines[0].strip())
    print(f"    Number of folds: {num_folds}")

    # Count positive and negative pairs
    pos_pairs = 0
    neg_pairs = 0

    for line in lines[1:]:
        parts = line.strip().split()
        if len(parts) == 3:  # Positive pair: name idx1 idx2
            pos_pairs += 1
        elif len(parts) == 4:  # Negative pair: name1 idx1 name2 idx2
            neg_pairs += 1

    print(f"    Positive pairs: {pos_pairs}")
    print(f"    Negative pairs: {neg_pairs}")
    print(f"    Total pairs: {pos_pairs + neg_pairs}")

    # Count images
    images_dir = os.path.join(OUTPUT_DIR, "ca-aligned")
    if os.path.exists(images_dir):
        num_images = len([f for f in os.listdir(images_dir) if f.endswith('.jpg')])
        print(f"    Images: {num_images}")

    print(f"\n[OK] CALFW dataset ready!")
    print(f"    Images: {OUTPUT_DIR}/ca-aligned/")
    print(f"    Pairs: {OUTPUT_DIR}/calfw_pairs.txt")

if __name__ == '__main__':
    try:
        download_calfw()
    except Exception as e:
        print(f"\n[ERROR] Failed to download CALFW: {e}")
        print("\n[INFO] If download fails, try manually downloading from:")
        print("  http://whdeng.cn/CALFW/index.html")
        raise
