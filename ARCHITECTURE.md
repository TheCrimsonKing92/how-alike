# Face Similarity Web App -- High-Level Architecture

## Overview
A single responsive web app that compares two faces entirely on-device, using browser-based machine learning.  
It starts with simple geometric comparison (facial landmarks) and can optionally add local embeddings for appearance-based similarity.  
No backend or cloud inference is required -- everything runs locally for speed and privacy.  
The app is installable as a Progressive Web App (PWA), functioning seamlessly across desktop and mobile browsers.

---

## Core Components
| Component | Purpose |
|------------|----------|
| **UI Layer (React + Tailwind)** | Handles image upload/capture, result display, mode switching, and glossary popovers (shared `DefinitionTooltip`, lazy-loaded glossary JSON, `IntersectionObserver` defer, `<abbr title>` fallback). |
| **Canvas Overlay** | Draws landmarks and colored similarity regions; supports touch gestures. |
| **Mode Manager** | Chooses between *Fast* (geometry only) and *Balanced* (geometry + embeddings) modes based on device capability. |
| **Analysis Worker** | Runs ML inference and math off the main thread for smooth UX. |
| **Models** | MediaPipe FaceMesh (TF.js) for landmarks, and ONNX Runtime Web for optional embeddings. |
| **PWA Shell** | Caches models and assets for offline use (no user images stored). |

---

## Data Flow
1. **Input:** User uploads or captures two images.  
2. **Preprocess:** Correct EXIF orientation, downscale to ~1024-1280 px, send to Web Worker.  
3. **Landmark Detection:** FaceMesh model extracts 468 landmarks per face.  
4. **Alignment:** Normalize by eye centers and interpupillary distance.  
5. **Similarity Computation:**  
   - Geometry comparison (angles, distances, ratios).  
   - *(If enabled)* Embedding comparison (region crops -> cosine similarity).  
   - Weighted fusion of both results.  
6. **Output:** Visual overlays and textual breakdown of regional resemblance.

---

## Execution Modes
- **Fast:** Geometry-only; runs instantly on all devices.  
- **Balanced:** Adds local embeddings for better robustness to lighting/pose.  
- **Accurate (Future):** Adds optional parsing or 3D normalization.  

Automatic mode selection is based on detected hardware (threads, SIMD).

---

## Key Interfaces
- `detectLandmarks(image): Landmark[]`  
- `analyze(pair, mode): { regions: RegionScore[], overall: number }`  
- Worker messages: `INIT`, `ANALYZE`, `PROGRESS`, `RESULT`, `ERROR`

---

## Directory Structure
- /app/ React components and pages
- /workers/analyze.worker.ts Worker that runs all analysis logic
- /lib/geometry.ts Face alignment and ratio calculations
- /lib/regions.ts Landmark region definitions
- /lib/fusion.ts Scoring and fusion logic
- /lib/caps.ts Device capability detection
- /models/facemesh-adapter.ts FaceMesh model loader
- /models/embeddings-adapter.ts Embedding model loader (optional)
- /pwa/manifest.webmanifest PWA metadata
- /pwa/sw.ts Service worker (Workbox)
- /public/models/<version>/ Model binaries cached offline

---

## Performance Principles
- Heavy ML work in a **Web Worker**, never blocking UI.  
- Downscale large images before inference.  
- Lazy-load and reuse models across runs.  
- Enable **WASM SIMD + threads** when supported.  
- Target <2s load time on mid-range phones; <400ms comparison on desktops.

---

## Privacy & Safety
- 100% client-side processing -- no network or data retention.  
- Only static assets and models cached by the service worker.  
- Temporary data cleared immediately after use.  
- Messaging framed as *feature resemblance*, not identity or kinship.

---

## Extensibility
- Swap between TF.js and ONNX FaceMesh adapters with no UI change.  
- Add or remove embedding logic through a modular adapter system.  
- Future extensions:
  - Face parsing for better region isolation  
  - 3D normalization for pose correction  
  - Multi-photo averaging for higher stability  

---

## TL;DR
Responsive web UI -> workerized FaceMesh -> optional local embeddings -> fused regional similarity -> visual + textual results.  
Private by design, fast on mobile, and extendable without any backend (at least for now).
