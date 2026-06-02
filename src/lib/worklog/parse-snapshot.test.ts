/**
 * Unit tests for parseSnapshot — pure JSON parsing utility.
 * No mocks needed.
 */

import { parseSnapshot } from "@/lib/worklog/parse-snapshot";

// ─────────────────────────────────────────────────────────
// Invalid / rejected inputs
// ─────────────────────────────────────────────────────────

describe("parseSnapshot — invalid inputs", () => {
  it("returns undefined for empty string", () => {
    expect(parseSnapshot("")).toBeUndefined();
  });

  it("returns undefined for invalid JSON", () => {
    expect(parseSnapshot("not json")).toBeUndefined();
  });

  it("returns undefined for malformed JSON", () => {
    expect(parseSnapshot("{bad:json}")).toBeUndefined();
  });

  it("returns undefined for JSON null", () => {
    expect(parseSnapshot("null")).toBeUndefined();
  });

  it("returns undefined for JSON false", () => {
    expect(parseSnapshot("false")).toBeUndefined();
  });

  it("returns undefined for JSON number", () => {
    expect(parseSnapshot("42")).toBeUndefined();
  });

  it("returns undefined for JSON string primitive", () => {
    expect(parseSnapshot('"just a string"')).toBeUndefined();
  });

  it("returns undefined for empty JSON array", () => {
    expect(parseSnapshot("[]")).toBeUndefined();
  });

  it("returns undefined for JSON array with items", () => {
    expect(parseSnapshot("[1, 2, 3]")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────
// Valid snapshot objects
// ─────────────────────────────────────────────────────────

describe("parseSnapshot — valid inputs", () => {
  it("parses a well-formed snapshot object", () => {
    const snapshot = {
      store: { "shape:abc": { id: "shape:abc", type: "geo" } },
      schema: { schemaVersion: 2, sequences: {} },
    };
    expect(parseSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it("parses a minimal empty-store snapshot", () => {
    const snapshot = { store: {}, schema: { schemaVersion: 2, sequences: {} } };
    expect(parseSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it("parses an empty object (pass-through — no structural validation)", () => {
    expect(parseSnapshot("{}")).toEqual({});
  });

  it("preserves nested structure", () => {
    const snapshot = {
      store: {},
      schema: { schemaVersion: 2, sequences: { "com.tldraw.shape": 1 } },
    };
    const result = parseSnapshot(JSON.stringify(snapshot));
    expect(result).not.toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).schema.sequences["com.tldraw.shape"]).toBe(1);
  });
});
