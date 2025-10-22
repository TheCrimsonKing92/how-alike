# How Alike -- Face Similarity Web App

A privacy-first, browser-based app that compares two faces and explains their resemblance across regions (eyes, nose, mouth, jawline, etc.). All processing runs locally on the user's device.

- Frontend: Next.js (App Router) + React + TailwindCSS
- ML: MediaPipe FaceMesh (TF.js) for landmarks; optional local embeddings (ONNX Runtime Web)
- UX: Canvas overlays + textual summaries
- PWA: Installable with offline shell and cached models (planned)

## Monorepo Layout

- `web/` -- Next.js app (TypeScript, Tailwind v4, ESLint, Vitest)

## Quick Start

- Dev: `cd web && npm run dev`
- Tests: `cd web && npm test`
- Lint: `cd web && npm run lint`
- Format: `cd web && npm run format`

## Model Assets (not in Git)

Large ONNX binaries stay out of version control. After cloning, download the heavy models locally before running the app:

1. **Age regressor (yu4u ResNet50, ~90 MB)**
   ```bash
   bash web/scripts/model-conversion/download-yu4u-model.sh
   python web/scripts/model-conversion/convert-yu4u-to-onnx.py \
     web/scripts/model-conversion/models/age_only_resnet50_weights.061-3.300-4.410.hdf5 \
     web/public/models/age-gender/yu4u_age_resnet50.onnx
   ```
   (The conversion script installs dependencies on first run; the large `.hdf5` stays outside `web/public`.)

2. **Face embeddings (MobileFaceNet, ~13 MB)**
   ```bash
   pip install --user insightface onnxruntime
   python scripts/download-mobilefacenet.py
   ```
   Copies `mobilefacenet.onnx` into `web/public/models/mobilefacenet/`.

3. **Face parsing segmentation (ResNet34, ~90 MB)**
   ```bash
   npx --yes @xenova/transformers convert \
     --model jonathandinu/face-parsing \
     --task image-segmentation \
     --format onnx \
     --output web/public/models/parsing/face-parsing-resnet34
   ```
   Produces `model.onnx` plus tokenizer/config files expected by the app.

Keep these binaries local (or in your own artifact store); do **not** commit them to Git to avoid the GitHub size limits noted above.

## Project Docs

- Project: `PROJECT.md`
- Architecture: `ARCHITECTURE.md`
- Implementation plan: `IMPLEMENTATION.md`
- Agent rules: `AGENTS.md`

## Status

**Current**: Detailed feature axis analysis complete (8 morphological categories, 20+ axes)

Completed:
- Stage 0: Base project with tooling
- Stage 1: Geometry-only MVP with FaceMesh landmarks
- Stage 2: Workerization with PWA shell
- Detailed feature axes (Phases 1-6): Comprehensive facial analysis across eyes, brows, nose, mouth, cheeks, jaw, forehead, and face shape

Next steps:
- Visual QA on diverse images
- Stage 3+: Local embeddings (Balanced mode), enhanced UX, offline completion

---

How Alike emphasizes resemblance and explainability -- it is not intended for biometric identity or verification.
