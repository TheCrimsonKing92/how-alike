#!/usr/bin/env node

/**
 * Ingest a stratified sample of UTKFace images into the age-calibration fixtures.
 *
 * Usage:
 *   node scripts/ingest-utkface.mjs --source "C:\\path\\to\\UTKFace"
 *
 * Optional flags:
 *   --per-decade 4        Number of samples to select per decade (default 4)
 *   --out "path"          Destination fixtures directory
 */

import fs from "fs/promises";
import path from "path";

const args = process.argv.slice(2);

function parseArgs() {
  let sourceDir;
  let perDecade = 4;
  let outDir = path.resolve("web/src/__tests__/fixtures/age-calibration");

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--source") {
      sourceDir = args[++i];
    } else if (arg === "--per-decade") {
      perDecade = Number(args[++i]);
    } else if (arg === "--out") {
      outDir = path.resolve(args[++i]);
    }
  }

  if (!sourceDir) {
    console.error("Usage: node scripts/ingest-utkface.mjs --source <sourceDir>");
    process.exit(1);
  }

  return { sourceDir, perDecade, outDir };
}

const genderMap = {
  "0": "male",
  "1": "female",
};

const raceMap = {
  "0": "white",
  "1": "black",
  "2": "asian",
  "3": "indian",
  "4": "other",
};

function parseFilename(filename) {
  const parts = filename.split("_");
  if (parts.length < 4) {
    throw new Error(`Unexpected UTKFace filename format: ${filename}`);
  }

  const age = Number(parts[0]);
  const genderCode = parts[1];
  const raceCode = parts[2];

  return {
    age,
    gender: genderMap[genderCode] ?? "unknown",
    race: raceMap[raceCode] ?? "unknown",
  };
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function selectSamplesForDecade(items, perDecade) {
  if (items.length <= perDecade) {
    return items;
  }

  const targetPerGender = Math.max(1, Math.floor(perDecade / 2));
  const males = shuffle(items.filter((item) => item.gender === "male").slice());
  const females = shuffle(items.filter((item) => item.gender === "female").slice());

  function pickByRace(list, limit) {
    if (list.length === 0 || limit === 0) return [];

    const raceSeen = new Set();
    const chosen = [];

    for (const item of list) {
      if (chosen.length >= limit) break;
      if (!raceSeen.has(item.race)) {
        raceSeen.add(item.race);
        chosen.push(item);
      }
    }

    if (chosen.length < limit) {
      for (const item of list) {
        if (chosen.length >= limit) break;
        if (!chosen.includes(item)) {
          chosen.push(item);
        }
      }
    }

    return chosen;
  }

  const selected = [
    ...pickByRace(males, Math.min(targetPerGender, males.length)),
    ...pickByRace(females, Math.min(targetPerGender, females.length)),
  ];

  if (selected.length >= perDecade) {
    return selected.slice(0, perDecade);
  }

  const remaining = shuffle(
    items.filter((item) => !selected.includes(item)).slice()
  );

  for (const item of remaining) {
    if (selected.length >= perDecade) break;
    selected.push(item);
  }

  return selected;
}

async function main() {
  const { sourceDir, perDecade, outDir } = parseArgs();

  await fs.mkdir(outDir, { recursive: true });

  const files = (await fs.readdir(sourceDir)).filter((file) =>
    file.endsWith(".jpg.chip.jpg")
  );

  if (files.length === 0) {
    console.error("No UTKFace files found in", sourceDir);
    process.exit(1);
  }

  const byDecade = new Map();

  for (const filename of files) {
    try {
      const parsed = parseFilename(filename);

      const decade = Math.min(Math.floor(parsed.age / 10) * 10, 110);
      const entry = {
        ...parsed,
        file: filename,
        fullPath: path.join(sourceDir, filename),
        decade,
      };

      if (!byDecade.has(decade)) {
        byDecade.set(decade, []);
      }
      byDecade.get(decade).push(entry);
    } catch (error) {
      console.warn("Skipping file due to parse failure:", filename, error);
    }
  }

  const selections = [];

  for (const [decade, items] of [...byDecade.entries()].sort(
    (a, b) => a[0] - b[0]
  )) {
    const picks = selectSamplesForDecade(items, perDecade);
    selections.push(...picks);
    console.log(
      `Decade ${decade}s: selected ${picks.length} of ${items.length} candidates`
    );
  }

  const metadataPath = path.join(outDir, "metadata.json");
  let existing = [];
  try {
    const raw = await fs.readFile(metadataPath, "utf8");
    existing = JSON.parse(raw);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const existingFiles = new Set(existing.map((entry) => entry.file));
  let added = 0;

  for (const selection of selections) {
    if (!existingFiles.has(selection.file)) {
      existing.push({
        file: selection.file,
        age: selection.age,
        gender: selection.gender,
        race: selection.race,
        source: "UTKFace",
      });
      added += 1;
    }

    const destination = path.join(outDir, selection.file);
    try {
      await fs.access(destination);
    } catch {
      await fs.copyFile(selection.fullPath, destination);
    }
  }

  existing.sort((a, b) => {
    if (a.age !== b.age) return a.age - b.age;
    return a.file.localeCompare(b.file);
  });

  await fs.writeFile(metadataPath, `${JSON.stringify(existing, null, 2)}\n`);

  console.log(
    `Ingestion complete: ${selections.length} samples processed, ${added} new metadata entries`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

