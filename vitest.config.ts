import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
  test: { environment: "jsdom", setupFiles: ["./tests/setup.ts"], include: ["src/**/*.test.{ts,tsx}"], maxWorkers: 2 },
});

