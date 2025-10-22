#!/usr/bin/env node
import { AutoProcessor, env } from "@xenova/transformers";

env.allowLocalModels = false;

console.log("Loading processor...");
const processor = await AutoProcessor.from_pretrained("jonathandinu/face-parsing");

console.log("\n=== Processor Methods ===");
const proto = Object.getPrototypeOf(processor);
const methods = Object.getOwnPropertyNames(proto).filter((k) => !k.startsWith("_"));
console.log("Methods:", methods);

console.log("\n=== All Properties ===");
console.log("All keys:", Object.keys(processor));

console.log("\n=== Checking for post_process methods ===");
const postMethods = [...methods, ...Object.keys(processor)].filter((k) => k.includes("post"));
console.log("Post-process methods:", postMethods.length ? postMethods : "None found");
