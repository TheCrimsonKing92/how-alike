// consult-openai.mjs
// Usage:
//   node consult-openai.mjs "your question"
//   node consult-openai.mjs --model gpt-5 --max 800 --temp 0.3 "summarize X"
//
// Env: set OPENAI_API_KEY

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import OpenAI from 'openai';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env.local') });

const argv = yargs(hideBin(process.argv))
  .usage('node consult-openai.mjs [--model MODEL] [--max N] [--temp T] "prompt"')
  .option('model', { type: 'string', default: 'gpt-5-mini' })
  .option('max',   { type: 'number', default: 600, describe: 'max output tokens' })
  .option('temp',  { type: 'number', describe: 'temperature (only if supported)' })
  .strict()
  .demandCommand(1)
  .parse();

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = argv.model;
const max_output_tokens = argv.max;
const temp = argv.temp;

// Minis/nanos often lock temperature to default. Only send when explicitly set and not locked.
const temperatureAllowed = !( /(?:mini|nano)/i.test(model) ) && typeof temp === 'number';

const responseSchema = {
  name: 'ConsultReply',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      summary: { type: 'string' },
      details: { type: 'string' },
      caveats: { type: 'string' }
    },
    required: ['summary', 'details', 'caveats']
  }
};

const systemPrompt = [
  'You are a terse, technical consultant.',
  'Return strict JSON with fields: summary, details, caveats.',
  'Be specific. Use concise bullets in details. No markdown.'
].join(' ');

const userPrompt = argv._.join(' ');

try {
  const resp = await client.responses.create({
    model,
    input: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: responseSchema.name,
        schema: responseSchema.schema
      }
    },
    max_output_tokens,
    ...(temperatureAllowed ? { temperature: temp } : {})
  });

  // Debug: log response structure
  console.error('[DEBUG] Response keys:', Object.keys(resp));
  console.error('[DEBUG] text field:', resp.text);
  console.error('[DEBUG] output field:', resp.output?.slice(0, 2));
  console.error('[DEBUG] output_text:', resp.output_text?.slice(0, 200));

  const raw = resp.output_text ?? resp.text?.content ?? resp.output?.[0]?.content ?? '';
  console.error('[DEBUG] Extracted raw:', raw.slice(0, 200));

  let out;
  try {
    out = JSON.parse(raw);
  } catch (e) {
    console.error('[DEBUG] JSON parse failed:', e.message);
    // Fallback if the model ignored schema (rare)
    out = { summary: raw.slice(0, 400), details: raw, caveats: '' };
  }

  // Pretty console output
  console.log('\n=== SUMMARY ===\n' + (out.summary || '(none)'));
  console.log('\n=== DETAILS ===\n' + (out.details || '(none)'));
  if (out.caveats) console.log('\n=== CAVEATS ===\n' + out.caveats);

  // Optional usage line (when provided by SDK)
  const u = resp.usage;
  if (u && (u.input_tokens || u.output_tokens)) {
    console.log(
      `\n[usage] model=${model} | in=${u.input_tokens ?? 0} out=${u.output_tokens ?? 0} total=${(u.input_tokens ?? 0)+(u.output_tokens ?? 0)}`
    );
  }
} catch (err) {
  const body = err?.response?.data || err?.error || err;
  console.error('OpenAI API error:', JSON.stringify(body, null, 2));
  process.exit(1);
}
