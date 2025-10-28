# Consult CLI — Documentation

**Purpose:**  
A lightweight CLI wrapper for OpenAI Responses API to get structured JSON answers for code or research validation.

---

## Usage
    node consult-openai.mjs "Explain eyebrow-arch measurement risks"
    node consult-openai.mjs --model gpt-5 --max 800 --temp 0.3 "Compare MobileFaceNet and ArcFace"

**Options**

| Flag   | Default     | Description                                             |
|--------|-------------|---------------------------------------------------------|
| --model| gpt-5-mini  | Model name ( gpt-5 , gpt-5-mini , gpt-5-nano )         |
| --max  | 600         | Max output tokens                                       |
| --temp | none        | Temperature (ignored for locked mini/nano models)       |

---

## Behavior
- Uses OpenAI **Responses API** (not chat completions).
- Structured output enforced with a **JSON schema**:

      { "summary": "short abstract", "details": "expanded analysis", "caveats": "optional notes" }

- No markdown, no free-form prose. Output is parsed as JSON only.
- Automatically ignores `temperature` for models that disallow custom values.
- Handles fallback parsing if schema is ignored.

---

## Output Example

    === SUMMARY ===
    MobileFaceNet achieves lightweight embedding generation with ~1.5M params.

    === DETAILS ===
    - Suitable for real-time browser inference
    - Tradeoff: slightly lower accuracy than ArcFace on age-diverse data
    - Best used when paired with a calibration model

    === CAVEATS ===
    Training data bias can degrade fairness across demographics.

---

## Error Handling
- API errors print JSON directly from the response.
- Empty or malformed output falls back to plaintext parsing.
- Usage tokens are logged when available.

---

## Model Policy

| Model       | Use Case                         | Temperature Support |
|-------------|----------------------------------|---------------------|
| gpt-5       | Deep analysis, long outputs      | ✅                  |
| gpt-5-mini  | Fast summaries                   | ❌ (locked = 1.0)   |
| gpt-5-nano  | Cheapest, tiny tasks             | ❌ (locked = 1.0)   |

---

## Notes
- Prefer **Responses API** for deterministic, structured tasks.
- Use **Chat Completions** only for interactive multi-turn sessions.
- You can safely pipe JSON output into tools:

      node consult-openai.mjs "Summarize feature importance" --max 800 | jq .

---

**Last Updated:** 2025-10-27
