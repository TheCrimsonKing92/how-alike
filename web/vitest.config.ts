import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}", "__tests__/**/*.{ts,tsx}"]
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@/*": path.resolve(__dirname, "./src/*"),
    },
  },
});
