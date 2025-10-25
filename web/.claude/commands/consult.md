# Consult OpenAI

You should call OpenAI's API to get a second opinion or additional context.

## When to use this

- When the user explicitly asks you to consult OpenAI/GPT/Copilot
- When you need fresh information about libraries or APIs
- When you want to verify an approach with another AI model
- When the user wants comparison between different AI perspectives

## Process

1. **Prepare the question**: Format a clear, specific prompt with:
   - Necessary code context (keep it minimal)
   - Specific question or task
   - Any constraints from the project

2. **Call the script**:
   ```bash
   # Default (gpt-5-mini - balanced speed/quality)
   node .claude/scripts/consult-openai.mjs "your detailed prompt here"

   # For tough cases (gpt-5 - flagship model)
   node .claude/scripts/consult-openai.mjs --model gpt-5 "complex question"

   # For simple/fast queries (gpt-5-nano - fastest)
   node .claude/scripts/consult-openai.mjs --model gpt-5-nano "simple question"
   ```

3. **Report the response**: Share OpenAI's answer with the user and optionally:
   - Integrate useful suggestions
   - Compare with your own approach
   - Ask the user which direction they prefer

## Example prompts

Good:
```
"In a Next.js 14 app using TypeScript, what's the recommended way to handle Web Worker communication with ImageBitmap transfer? Show typed message protocol example."
```

Too vague:
```
"How do I use Web Workers?"
```

## Model selection

- **gpt-5-mini** (default): Balanced speed/cost/quality for most tasks
- **gpt-5**: Flagship model for complex reasoning, architectural decisions
- **gpt-5-nano**: Fastest/cheapest for simple, well-defined queries

## Setup

The script needs `OPENAI_API_KEY` which it reads from:
1. `.env.local` file in the project root (recommended)
2. Environment variable

To set up, create `.env.local`:
```bash
OPENAI_API_KEY=your-api-key-here
```

(Already in .gitignore, won't be committed)

## Important notes

- Defaults to gpt-5-mini for balanced performance
- Keep prompts focused and specific for best results
- Always share the response with the user, don't act on it silently
