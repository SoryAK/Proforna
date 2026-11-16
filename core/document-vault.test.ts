import { describe, expect, it } from "vitest";
import {
  DOCUMENT_MAX_BYTES,
  prepareDocumentChange,
  prepareDocumentRemoval,
  prepareStoredDocument,
} from "./document-vault";

describe("document vault", () => {
  it("stores a named file and defaults a blank kind to evidence", () => {
    expect(prepareStoredDocument({ name: " offer.pdf ", size: 12, kind: "" })).toEqual({
      ok: true,
      value: { name: "offer.pdf", kind: "evidence" },
    });
  });

  it("rejects an empty file, an oversized file, and an unknown kind", () => {
    expect(prepareStoredDocument({ name: "a.txt", size: 0, kind: "evidence" }).ok).toBe(false);
    expect(prepareStoredDocument({ name: "a.txt", size: DOCUMENT_MAX_BYTES + 1, kind: "evidence" })).toEqual({
      ok: false,
      error: "file-too-large",
    });
    expect(prepareStoredDocument({ name: "a.txt", size: 4, kind: "archive" })).toEqual({
      ok: false,
      error: "kind-invalid",
    });
  });

  it("changes the name and kind together, and requires an id to remove", () => {
    expect(prepareDocumentChange({ name: "  Notes ", kind: "certificate" })).toEqual({
      ok: true,
      value: { name: "Notes", kind: "certificate" },
    });
    expect(prepareDocumentChange({ name: "Notes", kind: "" })).toEqual({
      ok: false,
      error: "kind-invalid",
    });
    expect(prepareDocumentRemoval("  doc-1  ")).toEqual({ ok: true, value: "doc-1" });
    expect(prepareDocumentRemoval("")).toEqual({ ok: false, error: "id-required" });
  });
});
