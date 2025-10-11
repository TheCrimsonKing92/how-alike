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

