/**
 * Unit 2 (ADR-0030) — pure schema spec for procedure documents.
 *
 * RED-GREEN-REFACTOR. These tests exist BEFORE the implementation. They
 * encode the locked decisions L1–L3 from ADR-0030:
 *
 *   L1. Tools block is optional (procedureTools? in the content sequence).
 *   L2. Steps have an optional title attr; numbering is auto-positional.
 *   L3. Steps are a flat list — no nested procedureStep allowed.
 *
 * The library is dependency-free (mirrors content-json.ts and
 * prosemirror-to-text.ts).
 */

import { describe, expect, it } from "vitest";
import {
  buildEmptyProcedure,
  isValidProcedureDoc,
  wrapNoteAsProcedure,
  type ProcedureDoc,
} from "./procedure-schema";

describe("buildEmptyProcedure", () => {
  it("returns a procedureDoc with title node and one empty step (L1: no tools by default)", () => {
    const doc = buildEmptyProcedure("How to open a box");
    expect(doc.type).toBe("procedureDoc");
    expect(Array.isArray(doc.content)).toBe(true);
    expect(doc.content.length).toBe(2);

    expect(doc.content[0]).toEqual({
      type: "procedureTitle",
      content: [{ type: "text", text: "How to open a box" }],
    });

    const step = doc.content[1];
    expect(step.type).toBe("procedureStep");
    // L2: title attr defaults to null when blank
    expect((step as { attrs?: { title?: unknown } }).attrs?.title).toBeNull();
  });

  it("accepts an empty title (validation lives elsewhere, builder is tolerant)", () => {
    const doc = buildEmptyProcedure("");
    const titleNode = doc.content[0] as { type: string; content?: unknown[] };
    expect(titleNode.type).toBe("procedureTitle");
    // Empty title => content array is empty (no zero-length text nodes per
    // ProseMirror invariant).
    expect(titleNode.content).toEqual([]);
  });

  it("the result of buildEmptyProcedure validates as a procedure doc", () => {
    expect(isValidProcedureDoc(buildEmptyProcedure("anything"))).toBe(true);
  });
});

describe("isValidProcedureDoc", () => {
  it("rejects null and undefined", () => {
    expect(isValidProcedureDoc(null)).toBe(false);
    expect(isValidProcedureDoc(undefined)).toBe(false);
  });

  it("rejects non-objects and arrays", () => {
    expect(isValidProcedureDoc("string")).toBe(false);
    expect(isValidProcedureDoc(42)).toBe(false);
    expect(isValidProcedureDoc([])).toBe(false);
  });

  it("rejects a regular note doc (type='doc' is the notes shape, not procedureDoc)", () => {
    expect(
      isValidProcedureDoc({
        type: "doc",
        content: [{ type: "paragraph" }],
      }),
    ).toBe(false);
  });

  it("rejects when the title node is missing", () => {
    expect(
      isValidProcedureDoc({
        type: "procedureDoc",
        content: [
          {
            type: "procedureStep",
            attrs: { title: null },
            content: [{ type: "paragraph" }],
          },
        ],
      }),
    ).toBe(false);
  });

  it("rejects when there are zero steps (1+ steps required by L3)", () => {
    expect(
      isValidProcedureDoc({
        type: "procedureDoc",
        content: [
          { type: "procedureTitle", content: [{ type: "text", text: "x" }] },
        ],
      }),
    ).toBe(false);
  });

  it("rejects when content order is wrong (step before title)", () => {
    expect(
      isValidProcedureDoc({
        type: "procedureDoc",
        content: [
          {
            type: "procedureStep",
            attrs: { title: null },
            content: [{ type: "paragraph" }],
          },
          { type: "procedureTitle", content: [{ type: "text", text: "x" }] },
        ],
      }),
    ).toBe(false);
  });

  it("rejects nested procedureStep (L3: steps are flat, not a tree)", () => {
    expect(
      isValidProcedureDoc({
        type: "procedureDoc",
        content: [
          { type: "procedureTitle", content: [{ type: "text", text: "x" }] },
          {
            type: "procedureStep",
            attrs: { title: null },
            content: [
              {
                type: "procedureStep",
                attrs: { title: null },
                content: [{ type: "paragraph" }],
              },
            ],
          },
        ],
      }),
    ).toBe(false);
  });

  it("accepts a valid doc with no tools block (L1: tools optional)", () => {
    expect(
      isValidProcedureDoc({
        type: "procedureDoc",
        content: [
          { type: "procedureTitle", content: [{ type: "text", text: "x" }] },
          {
            type: "procedureStep",
            attrs: { title: null },
            content: [{ type: "paragraph" }],
          },
        ],
      }),
    ).toBe(true);
  });

  it("accepts a valid doc with the optional tools block (L1)", () => {
    expect(
      isValidProcedureDoc({
        type: "procedureDoc",
        content: [
          { type: "procedureTitle", content: [{ type: "text", text: "x" }] },
          { type: "procedureTools", content: [{ type: "paragraph" }] },
          {
            type: "procedureStep",
            attrs: { title: "Inspect" },
            content: [{ type: "paragraph" }],
          },
        ],
      }),
    ).toBe(true);
  });

  it("accepts multiple steps (L2 numbering is positional, not stored)", () => {
    expect(
      isValidProcedureDoc({
        type: "procedureDoc",
        content: [
          { type: "procedureTitle", content: [{ type: "text", text: "x" }] },
          {
            type: "procedureStep",
            attrs: { title: null },
            content: [{ type: "paragraph" }],
          },
          {
            type: "procedureStep",
            attrs: { title: "Verify" },
            content: [{ type: "paragraph" }],
          },
          {
            type: "procedureStep",
            attrs: { title: null },
            content: [{ type: "paragraph" }],
          },
        ],
      }),
    ).toBe(true);
  });
});

describe("wrapNoteAsProcedure (migration helper for Unit 5)", () => {
  it("wraps a freeform notes-shaped doc into a single 'Body' step", () => {
    const noteDoc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "step a" }] },
        { type: "paragraph", content: [{ type: "text", text: "step b" }] },
      ],
    };
    const wrapped = wrapNoteAsProcedure(noteDoc, "Lockout-tagout");

    expect(isValidProcedureDoc(wrapped)).toBe(true);
    expect(wrapped.content[0]).toEqual({
      type: "procedureTitle",
      content: [{ type: "text", text: "Lockout-tagout" }],
    });

    // Single step named "Body" (per ADR-0030 migration strategy)
    expect(wrapped.content.length).toBe(2);
    const step = wrapped.content[1] as {
      type: string;
      attrs: { title: string | null };
      content: unknown[];
    };
    expect(step.type).toBe("procedureStep");
    expect(step.attrs.title).toBe("Body");
    // Original content preserved verbatim inside the step
    expect(step.content).toEqual(noteDoc.content);
  });

  it("is idempotent: re-wrapping an already-shaped procedureDoc returns it unchanged", () => {
    const alreadyShaped: ProcedureDoc = {
      type: "procedureDoc",
      content: [
        { type: "procedureTitle", content: [{ type: "text", text: "x" }] },
        {
          type: "procedureStep",
          attrs: { title: null },
          content: [{ type: "paragraph" }],
        },
      ],
    };
    const result = wrapNoteAsProcedure(alreadyShaped, "different title");
    // Idempotency: do NOT touch the title even if the caller passes a new one.
    // The doc's own title node wins.
    expect(result).toEqual(alreadyShaped);
  });

  it("handles null/undefined input by returning an empty procedure with the given title", () => {
    const fromNull = wrapNoteAsProcedure(null, "Empty");
    const fromUndefined = wrapNoteAsProcedure(undefined, "Empty");

    expect(isValidProcedureDoc(fromNull)).toBe(true);
    expect(isValidProcedureDoc(fromUndefined)).toBe(true);

    // Same shape as buildEmptyProcedure
    expect(fromNull).toEqual(buildEmptyProcedure("Empty"));
    expect(fromUndefined).toEqual(buildEmptyProcedure("Empty"));
  });

  it("treats a malformed input (non-doc) as null and produces an empty procedure", () => {
    const wrapped = wrapNoteAsProcedure({ random: "garbage" }, "Recovered");
    expect(isValidProcedureDoc(wrapped)).toBe(true);
    expect(wrapped).toEqual(buildEmptyProcedure("Recovered"));
  });

  it("preserves the original note's content tree byte-for-byte (non-mutating)", () => {
    const noteDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "open the " },
            {
              type: "mention",
              attrs: { entityType: "asset", entityId: "a1", label: "box" },
            },
          ],
        },
      ],
    };
    const before = JSON.stringify(noteDoc);
    const wrapped = wrapNoteAsProcedure(noteDoc, "Open");
    const after = JSON.stringify(noteDoc);

    // The input must not be mutated.
    expect(after).toBe(before);

    // The mention atom must survive intact inside the step.
    const step = wrapped.content[1] as { content: unknown[] };
    expect(step.content).toEqual(noteDoc.content);
  });
});
