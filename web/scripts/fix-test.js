// Quick script to add missing properties to FeatureClassifications test mocks
const fs = require("fs");
const path = require("path");

const testFilePath = path.join(__dirname, "../src/__tests__/feature-comparisons.test.ts");
let content = fs.readFileSync(testFilePath, "utf8");

// Replace pattern: add missing properties after existing ones
content = content.replace(/(\s+)(eyes: \[)/g, "$1eyes: [");
content = content.replace(
  /(\s+)(nose: \[\],\n)(\s+)(mouth: \[\],\n)(\s+)(jaw: \[\],)/g,
  "$1brows: [],\n$1nose: [],\n$1mouth: [],\n$1cheeks: [],\n$1jaw: [],\n$1forehead: [],\n$1faceShape: [],",
);

// Handle eyes: [], cases
content = content.replace(
  /(\s+)(eyes: \[\],\n)(\s+)(nose: \[\],\n)(\s+)(mouth: \[\],\n)(\s+)(jaw: \[\],)/g,
  "$1eyes: [],\n$1brows: [],\n$1nose: [],\n$1mouth: [],\n$1cheeks: [],\n$1jaw: [],\n$1forehead: [],\n$1faceShape: [],",
);

// Handle nose: [], cases at the start
content = content.replace(
  /(\s+)(nose: \[\n\s+\],\n)(\s+)(eyes: \[\],\n)(\s+)(mouth: \[\],\n)(\s+)(jaw: \[\],)/g,
  "$1nose: [$2      ],\n$1eyes: [],\n$1brows: [],\n$1mouth: [],\n$1cheeks: [],\n$1jaw: [],\n$1forehead: [],\n$1faceShape: [],",
);

// Handle mouth: [], cases at the start
content = content.replace(
  /(\s+)(mouth: \[\n\s+\],\n)(\s+)(eyes: \[\],\n)(\s+)(nose: \[\],\n)(\s+)(jaw: \[\],)/g,
  "$1mouth: [$2      ],\n$1eyes: [],\n$1brows: [],\n$1nose: [],\n$1cheeks: [],\n$1jaw: [],\n$1forehead: [],\n$1faceShape: [],",
);

fs.writeFileSync(testFilePath, content);
console.log("Test file fixed!");
