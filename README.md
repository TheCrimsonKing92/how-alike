# How Alike -- Face Similarity Web App

A privacy-first, browser-based app that compares two faces and explains their resemblance across regions (eyes, nose, mouth, jawline, etc.). All processing runs locally on the user's device.

- Frontend: Next.js (App Router) + React + TailwindCSS
- ML: MediaPipe FaceMesh (TF.js) for landmarks; optional Transformers.js segmentation
- UX: Canvas overlays + textual summaries
- PWA: Installable with offline shell and cached models (planned)

## Monorepo Layout

- `web/` -- Next.js app (TypeScript, Tailwind v4, ESLint, Vitest)

## Quick Start

- Requires Node.js 22.13.1 and npm 10.9.2 (`nvm use` reads `web/.nvmrc`)
- Dev: `cd web && npm run dev`
- Tests: `cd web && npm test`
- Lint: `cd web && npm run lint`
- Format: `cd web && npm run format`

## Environment Flags

- `NEXT_PUBLIC_PARSING_NECK_GUARD` (default `false`): when `true`, the Transformers.js parsing adapter clamps SegFormer neck/necklace/cloth logits well above the jaw (~12 % inwards, 6 % outwards), requires ≥0.85 margin for true neck pixels, and removes small neck islands. Enable while tuning segmentation thresholds or validating jaw-leak fixes.
- `NEXT_PUBLIC_PARSING_TRACE` (default `false`): enable verbose trace logging from the parsing adapter (model load, logits histograms, neck guard stats, etc.) while debugging segmentation behavior.

## Model Assets (not in Git)

Large ONNX binaries stay out of version control. After cloning, download the heavy models locally before running the app:

1. **Face parsing segmentation (ResNet34, ~90 MB)**
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
