"""
Download and prepare AgeDB-30 dataset for age-aware similarity calibration

AgeDB-30: Cross-age face verification dataset with age labels
- Contains same-person pairs across different ages
- Balanced positive/negative pairs
- Age annotations available
"""
import os
import requests
import zipfile
from pathlib import Path

AGEDB_URL = "https://github.com/deepinsight/insightface/raw/master/recognition/_datasets_/agedb_30.zip"
OUTPUT_DIR = "agedb-30"

def download_agedb():
    """Download AgeDB-30 dataset"""

    print("[OK] Downloading AgeDB-30 dataset...")
    print(f"    URL: {AGEDB_URL}")
    print(f"    Output: {OUTPUT_DIR}")

    # Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Download zip file
    zip_path = os.path.join(OUTPUT_DIR, "agedb_30.zip")

    if not os.path.exists(zip_path):
        print(f"\n[OK] Downloading to {zip_path}...")
        response = requests.get(AGEDB_URL, stream=True)
        response.raise_for_status()

        total_size = int(response.headers.get('content-length', 0))
        downloaded = 0

        with open(zip_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
                downloaded += len(chunk)
                if total_size > 0:
                    pct = 100 * downloaded / total_size
                    print(f"\r    Progress: {pct:.1f}%", end='', flush=True)

        print(f"\n[OK] Downloaded {downloaded / 1024 / 1024:.1f} MB")
    else:
        print(f"[OK] Zip file already exists: {zip_path}")

    # Extract
    print(f"\n[OK] Extracting...")
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(OUTPUT_DIR)

    print(f"[OK] Extracted to {OUTPUT_DIR}")

    # List contents
    print(f"\n[OK] Dataset contents:")
    for root, dirs, files in os.walk(OUTPUT_DIR):
        level = root.replace(OUTPUT_DIR, '').count(os.sep)
        indent = ' ' * 2 * level
        print(f'{indent}{os.path.basename(root)}/')
        subindent = ' ' * 2 * (level + 1)
        for file in files[:10]:  # Show first 10 files
            print(f'{subindent}{file}')
        if len(files) > 10:
            print(f'{subindent}... and {len(files) - 10} more files')

if __name__ == '__main__':
    try:
        download_agedb()
    except Exception as e:
        print(f"\n[ERROR] Failed to download AgeDB-30: {e}")
        print("\n[FALLBACK] Trying alternative approach...")
        print("Visit: https://github.com/deepinsight/insightface/tree/master/recognition/_datasets_")
        print("Or use alternative dataset like CALFW or CACD-VS")
        raise
