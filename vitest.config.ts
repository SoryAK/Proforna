import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Coverage is opt-in via `--coverage` flag (review:phase invokes it for
    // the R step gate). Normal `npm test` skips instrumentation entirely so
    // the TDD inner loop stays fast.
    //
    // Scope mirrors ADR-0018 TDD applyTo: src/lib, src/app/api, src/data.
    // Other folders (components/, app/(app)/, hooks/) are deliberately
    // excluded — the existing test-stack doesn't cover them (no jsdom; see
    // parked entry "UI test stack" in /memories/repo/parked-ideas.md).
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "./coverage",
      include: [
        "src/lib/**/*.ts",
        "src/app/api/**/*.ts",
        "src/data/**/*.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.d.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
