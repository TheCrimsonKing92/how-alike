# Face Similarity Web App -- Project Description

## Overview
The **Face Similarity Web App** is a browser-based tool which compares two human faces and highlights how similar they are across specific regions -- eyes, nose, mouth, jawline, and more.  
It runs entirely on the client, leveraging on-device machine learning for both **speed** and **privacy**. Users can upload or capture two images directly from desktop or mobile browsers and receive visual and textual analyses of resemblance.

The app is responsive but not mobile-first -- it provides an identical experience across devices via a single codebase. It can also function offline as a **Progressive Web App (PWA)**.

---

## Core Concept
1. **Upload / Capture:** Users provide two photos (front-facing, well-lit).
2. **Analyze:** The app detects facial landmarks using **MediaPipe FaceMesh (TF.js)** and extracts semantic face regions using **Transformers.js (SegFormer)**.
3. **Compare:** It computes regional similarity using segmentation masks (Dice coefficient for shape, centroid distance for position, area ratio for size) with Procrustes alignment as fallback.
4. **Visualize:** It overlays segmentation-derived contours with similarity-colored strokes and generates narrative descriptions explaining regional resemblance.
5. **Result:** The output is interpretable ("nearly identical eye shape," "nose differs in width") rather than opaque AI scoring.

---

## Guiding Principles
- **Privacy-first:** No images or data leave the user's device.
- **Explainable:** Users can see *why* two faces are deemed similar.
- **Portable:** Runs in any modern browser; installable as a PWA.
- **Evolvable:** Architecture supports stepwise enhancement--geometry only -> embeddings -> parsing--without breaking earlier layers.
- **Inclusive:** Works with diverse faces, lighting, and devices through adaptive modes.

---

## Functional Summary
| Category | Description |
|-----------|--------------|
| **Input** | Dual uploads or camera captures (desktop & mobile) |
| **Detection** | MediaPipe FaceMesh (468 landmarks) |
| **Parsing** | Transformers.js (SegFormer) for semantic face segmentation |
| **Analysis** | Segmentation-based regional similarity (shape + position + size) with Procrustes fallback |
| **Visualization** | Canvas overlay with segmentation-derived contours + narrative descriptions |
| **Modes** | Transformers.js (SegFormer), ONNX Runtime (ResNet34), Landmarks only (MediaPipe) |
| **Platform** | Next.js + React + Tailwind + shadcn/ui |
| **Performance** | Web Worker inference + model lazy-loading + connected component analysis |
| **Offline** | PWA manifest + service worker caching |
| **Security** | On-device inference; no backend storage |

---

## Target Use Cases
- Casual curiosity ("Why do we look alike?")
- Fun resemblance challenges on mobile or desktop
- ML demos / teaching tools
- Visual explainability projects (showing ML transparency)

---

## Project Outcome
A **lightweight, privacy-friendly facial resemblance analyzer** that:
- Runs seamlessly in-browser on any platform.
- Provides fast, interpretable, visual and textual feedback.
- Evolves gracefully from a toy MVP into a full offline-capable PWA.

The emphasis is not on biometric identity or verification; it's on **perceived similarity** through transparent, user-visible computation.
