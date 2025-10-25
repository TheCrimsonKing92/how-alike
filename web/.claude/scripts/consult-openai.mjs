#!/usr/bin/env node

/**
 * Consult OpenAI API with a prompt
 * Usage: node consult-openai.mjs [--model MODEL] "your question here"
 * Models: gpt-5 (flagship), gpt-5-mini (default, balanced), gpt-5-nano (fastest)
 *
 * Reads OPENAI_API_KEY from:
 * 1. .env.local file in project root (if exists)
 * 2. Environment variable
 */

import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env.local if it exists
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '..', '.env.local');
config({ path: envPath });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY not found');
  console.error('Set it in .env.local or as an environment variable');
  process.exit(1);
}

// Parse arguments
const args = process.argv.slice(2);
let model = 'gpt-5-mini'; // default
let promptArgs = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--model' && i + 1 < args.length) {
    model = args[i + 1];
    i++; // skip next arg
  } else if (args[i].startsWith('--model=')) {
    model = args[i].substring(8);
  } else {
    promptArgs.push(args[i]);
  }
}

const prompt = promptArgs.join(' ');

if (!prompt) {
  console.error('Error: Please provide a prompt as an argument');
  console.error('Usage: node consult-openai.mjs [--model MODEL] "your question here"');
  console.error('Models: gpt-5 (flagship), gpt-5-mini (default), gpt-5-nano (fastest)');
  process.exit(1);
}

async function consultOpenAI(userPrompt, modelName) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

try {
  console.log(`Consulting OpenAI (${model})...\n`);
  const answer = await consultOpenAI(prompt, model);
  console.log(answer);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
