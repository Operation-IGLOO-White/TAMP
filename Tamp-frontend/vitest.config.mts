import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Frontend unit tests. Node environment; `@/` resolves to ./src.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
