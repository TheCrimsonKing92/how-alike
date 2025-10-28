# OpenAI API Errors with Consult Script

Date: 2025-10-27

## Context
Attempted to use the consult script to validate eyebrow arch measurement approach. Encountered multiple API compatibility issues with the newer OpenAI models.

## Errors Encountered

### Error 1: `max_tokens` Parameter Deprecated
```
OpenAI API 400: {
  "error": {
    "message": "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
    "type": "invalid_request_error",
    "param": "max_tokens",
    "code": "unsupported_parameter"
  }
}
```

**Fix Applied:** Changed `max_tokens` to `max_completion_tokens` in consult-openai.mjs:117

### Error 2: `temperature` Parameter Not Supported
```
OpenAI API 400: {
  "error": {
    "message": "Unsupported value: 'temperature' does not support 0.2 with this model. Only the default (1) value is supported.",
    "type": "invalid_request_error",
    "param": "temperature",
    "code": "unsupported_value"
  }
}
```

**Fix Applied:** Removed `temperature: 0.2` from API request in consult-openai.mjs:117

### Error 3: Empty Response Despite Token Usage
After fixing the above errors, the API call succeeded but returned empty SUMMARY and DETAILS sections, despite showing:
```
Model: gpt-5-mini | tokens: in 385, out 500, total 885 | est $0.0009
Model: gpt-5-mini | tokens: in 412, out 2000, total 2412 | est $0.0032
Model: gpt-5-nano | tokens: in 210, out 2000, total 2210 | est $0.0006
```

**Root Cause (Hypothesis):**
- The system prompt format may not be compatible with current OpenAI models
- The regex pattern for extracting SUMMARY/DETAILS sections may not match the actual response format
- Models may be using reasoning tokens that don't produce visible output

## Script Changes Required

### consult-openai.mjs Updates Made:
1. Line 117: Changed `max_tokens` → `max_completion_tokens`
2. Line 117: Removed `temperature: 0.2` parameter

### Additional Investigation Needed:
1. Test with raw API call to see actual response format
2. Update system prompt to match current model capabilities
3. Fix SUMMARY/DETAILS extraction regex
4. Handle reasoning tokens appropriately

## Workaround
For this session, I provided direct analysis of the eyebrow measurement approach based on geometric principles and anthropometric standards, bypassing the broken consult script.
