import { describe, expect, it } from "vitest";

import { validateContentJson } from "./content-json";

describe("validateContentJson", () => {
  it("accepts null", () => {
    const result = validateContentJson(null);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it("accepts undefined", () => {
    const result = validateContentJson(undefined);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it("rejects non-objects", () => {
    expect(validateContentJson("doc")).toMatchObject({ ok: false });
    expect(validateContentJson(42)).toMatchObject({ ok: false });
    expect(validateContentJson([])).toMatchObject({ ok: false });
  });

  it("accepts a doc node with array content", () => {
    const result = validateContentJson({ type: "doc", content: [] });
    expect(result.ok).toBe(true);
  });

  it("rejects nodes with type other than doc or procedureDoc", () => {
    const result = validateContentJson({ type: "paragraph", content: [] });
    expect(result.ok).toBe(false);
  });

  it("rejects content that is not an array", () => {
    const result = validateContentJson({ type: "doc", content: "nope" });
    expect(result.ok).toBe(false);
  });

  // ADR-0030 — procedureDoc is a valid top-level node for procedure work logs.
  describe("procedureDoc support (ADR-0030)", () => {
    it("accepts procedureDoc root", () => {
      const result = validateContentJson({
        type: "procedureDoc",
        content: [
          { type: "procedureTitle", content: [{ type: "text", text: "Reset" }] },
          { type: "procedureStep", content: [{ type: "paragraph" }] },
        ],
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value?.type).toBe("procedureDoc");
      }
    });

    it("accepts procedureDoc with empty content array", () => {
      const result = validateContentJson({ type: "procedureDoc", content: [] });
      expect(result.ok).toBe(true);
    });

    it("rejects procedureDoc with non-array content", () => {
      const result = validateContentJson({ type: "procedureDoc", content: 5 });
      expect(result.ok).toBe(false);
    });
  });
});
