# Archived Planning Documents

This directory contains historical planning documents that were used during development but are now superseded by current documentation or completed implementations.

## Contents

### FEATURE_AXES_PLAN.md
**Status**: ✅ Completed

Detailed plan for implementing 8-axis morphological feature analysis. This work was completed and is now documented in:
- Implementation: `web/src/lib/feature-axes.ts`, `axis-classifiers.ts`, `feature-comparisons.ts`, `feature-narratives.ts`
- Work log: `TASKS.md` (Done section)

### AGE_CALIBRATION_PLAN.md
**Status**: ✅ Completed

Original plan for fixing age estimation calibration. This work was completed with 3-segment piecewise regression. Current status documented in:
- Status: `CALIBRATION_STATUS.md`
- Implementation: `web/src/lib/age-estimation.ts`
- Tooling: `web/scripts/fit-calibration.mjs`, `web/scripts/batch-calibrate.mjs`

### AGE_SCALE_PLAN.md
**Status**: 📋 Superseded by NEXT_IMPROVEMENTS.md

Comprehensive plan for age-aware and maturity-aware feature comparison. Core concepts preserved in:
- Future roadmap: `NEXT_IMPROVEMENTS.md` (#2: Age model upgrade, #3: Gender-specific calibration)
- Some concepts (ML age estimation) already implemented differently

### IMPLEMENTATION.md
**Status**: ✅ Mostly Completed

Original stage-by-stage implementation plan (Stage 0-6). Project is currently at Stage 2+ (workerized, PWA shell, transformers.js parsing). Useful code style preferences extracted to `CLAUDE.md`.

---

## Why Archived?

These documents were valuable during development but are now superseded by:
1. **Completed implementations** (feature axes, age calibration)
2. **Current status documents** (CALIBRATION_STATUS.md, TASKS.md)
3. **Future roadmap** (NEXT_IMPROVEMENTS.md)

They are preserved here for historical reference and to understand the evolution of the project's approach.

---

Last updated: 2025-10
