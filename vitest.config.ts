import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    pool: "threads",
    include: [
      "core/**/*.test.ts",
      "server/**/*.test.ts",
      "relay/**/*.test.ts",
    ],
  },
});
