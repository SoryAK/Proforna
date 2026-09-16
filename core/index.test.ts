import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PRODUCT } from "./index";

const coreDir = dirname(fileURLToPath(import.meta.url));

describe("core", () => {
  it("names personal career management", () => {
    expect(PRODUCT).toEqual({
      name: "Proforna",
      kind: "personal-career-management",
    });
  });

  it("does not import HTTP, React, or SQLite", () => {
    const sources = readdirSync(coreDir).filter(
      (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
    );
    expect(sources.length).toBeGreaterThan(0);
    for (const name of sources) {
      const src = readFileSync(join(coreDir, name), "utf8");
      expect(src, name).not.toMatch(/from ["']hono/);
      expect(src, name).not.toMatch(/from ["']react/);
      expect(src, name).not.toMatch(/from ["']node:sqlite/);
    }
  });
});
