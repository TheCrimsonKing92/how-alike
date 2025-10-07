# Rules for Agents

## Implementation
- Prefer modern techniques and standards

## Quality
- All code must be tested, and all tests must pass, to be considered acceptable
- Add or update tests for the code you change, even if nobody asked
- When any test errors are found, resolve them until the entire test suite is green
- After moving files or changing imports, run tests to confirm everything still passes

## E2E Smoke Test — Best Practices
- When to run in CI
  - On main branch merges and release builds
  - Nightly (to catch CDN/model or browser updates)
  - On PRs that touch any of:
    - `web/src/models/**`, `web/src/app/**`, `web/src/lib/**`, `web/next.config.*`, `web/playwright.config.*`
    - Dependency bumps affecting Next.js, Playwright, TensorFlow.js, or MediaPipe
- When to run locally
  - Before pushing changes to detector init, routing, or build config
  - After upgrading TFJS/face-landmarks-detection/Next.js
  - If Analyze breaks or model fails to load
  - Quick loop: keep `npm run dev` running and use `npm run e2e` (Playwright is configured to `reuseExistingServer`)
- Performance tips
  - Run only Chromium locally (`--project=chromium`)
  - Use headless and disable tracing (defaults set)
  - Cache Playwright browsers (`npx playwright install`) and npm modules
- Health route
  - The smoke test targets `/health/detector` which calls `getDetector()` and returns `ok` on success. Ensure this route remains lightweight and client-only.

## E2E Smoke Test — Required
- The Playwright smoke test must remain green. Failing smoke tests block merges.
- Do not skip, quarantine, or disable the smoke test to merge code.
- If the smoke test breaks due to external causes (e.g., CDN outage), either:
  - Add a temporary, clearly documented retry with a short timeout, or
  - Mark the build as unstable and create a tracking issue. Do not merge unrelated code until green.
- Run the smoke test locally before merging changes affecting model init, routing, or build config.

## Self-Improvement
- After each interaction, reflect on any way to update this AGENTS.md file to improve future interactions
