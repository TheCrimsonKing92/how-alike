# Consult OpenAI

You should call OpenAI's API to get a second opinion or additional context.

## When to use this

- When the user explicitly asks you to consult OpenAI/GPT/Copilot
- When you need fresh information about libraries or APIs
- When you want to verify an approach with another AI model
- When the user wants comparison between different AI perspectives

## Two-stage flow (defaults safe for context & cost)

1) **Summary first (default)**  
   Returns a compact SUMMARY (default cap: 500 tokens). No long DETAILS are generated or saved.  
   Use this to scope the problem cheaply and avoid chat bloat.

2) **Expand when approved**  
   Re-run with `--expand` to generate full DETAILS and **persist them to disk**.  
   The tool saves DETAILS to Markdown and prints only a short SUMMARY to chat.

## Process

1. Prepare the question:
   - Minimal code context (paths/snippets > giant pastes)
   - One specific ask + constraints

2. Call the tool:

   # Summary first (default mode)
   node .claude/scripts/consult-openai.mjs "your detailed prompt"

   # Expand to full details and persist to file (reasonable default limits)
   node .claude/scripts/consult-openai.mjs --expand "your detailed prompt"

   # Choose model
   node .claude/scripts/consult-openai.mjs --model gpt-5 "hard problem"
   node .claude/scripts/consult-openai.mjs --model gpt-5-nano "quick lookup"

   # Persist DETAILS to a specific file (used with --expand)
   node .claude/scripts/consult-openai.mjs --expand --out docs/ai/consult-log.md --append "prompt"

   # Guardrails: preflight budget check (no API call if worst-case cost exceeds budget)
   node .claude/scripts/consult-openai.mjs --budget 0.50 --max-out-tokens 500 "prompt"
   # For expand runs you can also control the max detail tokens:
   node .claude/scripts/consult-openai.mjs --expand --max-details-tokens 1800 --budget 1.50 "prompt"

3. Report the response:
   - Paste the printed SUMMARY
   - If you expanded, reference the saved DETAILS file path
   - Ask which next actions to take

## Auto-expand policy

You may run `--expand` without asking first ONLY when all the following conditions are met:

1. Intent is clearly one of:
   - Drafting or updating an ADR (architecture decision record)
   - Producing or updating an API contract
   - Writing or extending a migration runbook
   - Conducting library/tool research where detailed findings are expected

2. You include ALL of the following flags:
   - `--budget <USD>` (hard preflight guard)
   - `--max-details-tokens <N>` (hard length cap)
   - `--out <path>.md` (details must be persisted, not lost to chat)
   - Use `--append` when updating an existing consultation log

3. The preflight worst-case cost estimate ≤ the specified `--budget`.
   If not, do NOT call. Ask how to adjust the constraints.

4. After the call completes:
   - Paste ONLY the SUMMARY into chat
   - Log a compact receipt including file path, model, token usage, and estimated cost

Outside these intents, or if any flag is missing, you must ask before using `--expand`.

## Example prompts

Good:
"In a Next.js 14 app using TypeScript, what's the recommended way to handle Web Worker communication with ImageBitmap transfer? Show a typed message protocol example."

Good:
"In Spring Boot 3.x with Oracle UCP, how should I configure per-call timeouts vs SQLNet timeouts for read heavy services? Provide concrete properties and trade-offs."

Too vague:
"How do I use Web Workers?"

## Model selection

- gpt-5-mini (default): balanced speed/cost/quality
- gpt-5: toughest reasoning/architecture
- gpt-5-nano: fastest & cheapest

## Setup

OPENAI_API_KEY must be available in:
1. .env.local
2. or environment

Example .env.local:
OPENAI_API_KEY=your-api-key

## Important

- Default run produces a compact SUMMARY only (no long DETAILS fetched)
- Use --expand to generate and **persist** full DETAILS (SUMMARY still printed)
- Preflight budget check: if worst-case cost > --budget, the tool aborts before calling the API
- Keep prompts lean; use file paths/snippets instead of dumping large blobs
