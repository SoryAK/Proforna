import { describe, expect, it } from "vitest";
import {
  PORTABLE_FORMAT_VERSION,
  validatePortableManifest,
} from "./portability";

describe("portable archives", () => {
  it("rejects archives from unsupported schema versions", () => {
    expect(
      validatePortableManifest({
        formatVersion: PORTABLE_FORMAT_VERSION + 1,
        product: "Proforna",
        exportedAt: "2026-09-19T20:00:00.000Z",
        occupantId: "local",
        dataFile: "data.json",
        fileCount: 0,
        checksums: {},
      }),
    ).toEqual({ ok: false, error: "format-unsupported" });
  });
});
