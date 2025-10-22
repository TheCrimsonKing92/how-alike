#!/usr/bin/env node
/**
 * Download InsightFace genderage.onnx model from HuggingFace
 *
 * Model: InsightFace Antelopev2 Gender-Age Classifier
 * Source: https://huggingface.co/fofr/comfyui
 * Input: 1 × 3 × 96 × 96 (NCHW, RGB)
 * Output: 1 × 3 [female_score, male_score, age]
 */

import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { pipeline } from "stream/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MODEL_URL =
  "https://huggingface.co/fofr/comfyui/resolve/main/insightface/models/antelopev2/genderage.onnx?download=true";
const MODEL_PATH = `${__dirname}/../public/models/age-gender/genderage.onnx`;
const EXPECTED_SHA256 = "4fde69b1c810857b88c64a335084f1c3fe8f01246c9a191b48c7bb756d6652fb";

async function downloadModel() {
  console.log("📥 Downloading InsightFace genderage.onnx...");
  console.log(`   Source: ${MODEL_URL}`);
  console.log(`   Target: ${MODEL_PATH}`);

  // Ensure directory exists
  await mkdir(dirname(MODEL_PATH), { recursive: true });

  // Download model
  const response = await fetch(MODEL_URL);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }

  // Stream to file
  const fileStream = createWriteStream(MODEL_PATH);
  await pipeline(response.body, fileStream);

  console.log("✅ Download complete!");

  // Verify size
  const { size } = await import("fs/promises").then((fs) => fs.stat(MODEL_PATH));
  console.log(`   File size: ${(size / (1024 * 1024)).toFixed(2)} MB`);

  // Compute SHA256 (optional verification)
  try {
    const { createHash } = await import("crypto");
    const { readFile } = await import("fs/promises");
    const buffer = await readFile(MODEL_PATH);
    const hash = createHash("sha256").update(buffer).digest("hex");

    if (hash === EXPECTED_SHA256) {
      console.log("✅ SHA256 verification passed");
    } else {
      console.warn("⚠️  SHA256 mismatch:");
      console.warn(`   Expected: ${EXPECTED_SHA256}`);
      console.warn(`   Got:      ${hash}`);
    }
  } catch (err) {
    console.warn("⚠️  Could not verify SHA256:", err.message);
  }
}

downloadModel().catch((err) => {
  console.error("❌ Download failed:", err);
  process.exit(1);
});
