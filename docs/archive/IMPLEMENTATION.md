# Face Similarity Web App -- Implementation Plan

## Overview
This document outlines the development plan for the **Face Similarity Web App**, from an empty repository to a feature-complete, offline-capable browser application.  
The approach is incremental -- each stage produces a usable, testable version that builds directly on the last.

---

## Stage 0 -- Foundations
**Goal:** Create a clean, functional base environment.

**Deliverables**
- Initialize Next.js project with TypeScript.
- Add TailwindCSS + shadcn/ui for styling and components.
- Configure ESLint, Prettier, and Vitest for consistency and testing.
- Implement base layout: header, footer, responsive grid container.
- Include placeholder components for upload, results, and canvas.

**Outcome:** Running scaffold with dev tooling, style system, and layout structure.

---

## Stage 1 -- MVP (Geometry-Only Comparison)
**Goal:** Full local pipeline from image upload to geometric similarity output.

**Features**
- Dual image upload or camera capture.
- Orientation correction (EXIF) and image downscaling.
- MediaPipe FaceMesh (TF.js) inference for 468 landmarks per face.
- Face alignment (normalize by eye centers and interpupillary distance).
- Landmark region grouping (eyes, brows, nose, mouth, jaw, cheek).
- Geometric similarity computation (angles, ratios, cosine distance).
- Canvas overlays highlighting matching regions.
- Textual results summarizing top similarities/differences.
- Basic error and loading handling.

**Outcome:** Working demo that compares two faces purely via landmark geometry, fully client-side.

---

## Stage 2 -- Performance & Workerization
**Goal:** Make the MVP fast, responsive, and scalable to mobile.

**Features**
- Move FaceMesh inference into a Web Worker.
- Add OffscreenCanvas support for background rendering.
- Implement progress and status updates from the worker.
- Lazy-load models on demand.
- Add performance logging and quality-of-life improvements (e.g., retry, fallback on main thread).
- Introduce PWA shell (manifest + service worker caching for static assets).

**Outcome:** Smooth, non-blocking UI that runs efficiently across desktop and mobile.

---

## Stage 3 -- Local Embeddings (Balanced Mode)
**Goal:** Add optional appearance-based similarity for improved accuracy.

**Features**
- Integrate ONNX Runtime Web.
- Add lightweight embedding model for cropped regions (eyes, mouth, etc.).
- Implement crop and embedding pipelines in the worker.
- Fuse geometric and embedding similarities using weighted averages.
- Automatic mode selection: *Fast* (geometry-only) or *Balanced* (geometry + embeddings).
- Device capability detection (SIMD, threads) to choose execution path.
- Benchmark and tune performance.

**Outcome:** More intelligent resemblance scoring that remains private and offline.

---

## Stage 4 -- Enhanced UX & Stability
**Goal:** Refine user experience and ensure robustness.

**Features**
- Touch gestures for zoom/pan on canvas.
- Expanded error handling (bad lighting, multiple faces, etc.).
- Download/share comparison card (generated client-side).
- Animated loading states and progress feedback.
- Adjustable mode switch UI.
- Expanded mobile responsiveness and accessibility (contrast, ARIA labels).

**Outcome:** Polished and intuitive web experience suitable for public release.

---

## Stage 5 -- PWA & Offline Completion
**Goal:** Finalize offline functionality and reliability.

**Features**
- Full PWA manifest with install support.
- Service worker caching of app shell and model binaries.
- Graceful degradation in offline mode.
- "New version available" update mechanism.
- Local storage for user preferences (theme, last-used mode).

**Outcome:** Fully offline-capable, installable PWA that feels native on all devices.

---

## Stage 6 -- Optional Enhancements (Post-v1)
**Goal:** Extend app intelligence and appeal beyond MVP.

**Potential Additions**
- Face parsing model for better region cropping.
- 3D normalization for cross-angle consistency.
- Multi-photo averaging for better comparison stability.
- Adjustable weight tuning per facial region.
- Theming and localization options.

**Outcome:** Mature, extensible version ready for advanced experimentation or public deployment.

---

## Milestone Summary

| Stage | Focus | Deliverable | Duration |
|--------|--------|-------------|-----------|
| **0** | Setup | Base project + tooling | 1 day |
| **1** | MVP | Geometry-only resemblance | 2-3 days |
| **2** | Performance | Workerization + PWA shell | 1-2 days |
| **3** | Accuracy | Local embeddings (Balanced mode) | 2-4 days |
| **4** | UX Polish | Interactivity + responsiveness | 2 days |
| **5** | Offline | PWA completion + persistence | 1 day |
| **6** | Extensions | Parsing, 3D, or future work | Optional |

---

## Code Style Preferences

### JavaScript/TypeScript
- **Prefer functional array methods** (`filter`, `map`, `reduce`) over imperative loops (`forEach` + `push`)
- While imperative operations aren't prohibited, functional style should be prioritized for clarity and immutability

Example:
```typescript
// Preferred
const agreements = axes.filter(axis => axis.agreement);
const shared = agreements.map(axis => `Both have ${axis.valueA}`);

// Avoid (unless necessary)
const shared = [];
for (const axis of axes) {
  if (axis.agreement) {
    shared.push(`Both have ${axis.valueA}`);
  }
}
```

### HTML/JSX
- **Use semantic HTML for visual elements** - never embed Unicode characters for visual formatting
- Lists must use `<ul>` and `<li>` tags, not text prefixes like "• "

Example:
```tsx
// Preferred
<ul className="list-disc list-inside">
  {items.map(item => <li key={item.id}>{item.text}</li>)}
</ul>

// Avoid
{items.map(item => <div key={item.id}>• {item.text}</div>)}
```

---

## Summary
The implementation path emphasizes **progressive capability** -- every milestone yields a functional product.
Starting from a simple, explainable geometry-based MVP, the app evolves into a fast, private, offline-ready tool that intelligently compares facial resemblance with a modern, mobile-friendly UX.
