/**
 * RED tests for normalizeProcedurePaste — ADR-0030 Unit 7.
 *
 * Spec: when ProseMirror gives us a Slice's JSON content (an array of
 * top-level nodes from a paste), normalize it so every block ends up
 * inside a procedureStep. The function returns a new array suitable for
 * `replaceSelection`-ing under a procedureDoc.
 *
 * Edge cases covered:
 *   - All-paragraph paste (the common case from a markdown source) →
 *     wrap them ALL into a single procedureStep.
 *   - Mixed bullet list / heading / paragraph → wrap into one step.
 *   - Already-procedureStep content (paste from another procedure) →
 *     pass through unchanged.
 *   - Mix of step + paragraph → wrap orphan paragraphs into a NEW step,
 *     keep the existing step as-is, ordering preserved.
 *   - procedureTitle / procedureTools in pasted content → strip them
 *     (only allowed at doc-root, never inside a step).
 *   - Empty array → returns [] (caller decides what to do).
 *   - Heading in paste → demoted to paragraph (procedureStep doesn't
 *     accept headings as children — paragraph is the safest landing).
 */

import { describe, it, expect } from "vitest";
import { normalizeProcedurePaste } from "./procedure-paste";

describe("normalizeProcedurePaste", () => {
  it("returns [] for empty input", () => {
    expect(normalizeProcedurePaste([])).toEqual([]);
  });

  it("wraps a single paragraph into one procedureStep", () => {
    const input = [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }];
    const out = normalizeProcedurePaste(input);
    expect(out).toEqual([
      {
        type: "procedureStep",
        attrs: { title: null },
        content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
      },
    ]);
  });

  it("wraps multiple paragraphs into ONE procedureStep (not many)", () => {
    const input = [
      { type: "paragraph", content: [{ type: "text", text: "a" }] },
      { type: "paragraph", content: [{ type: "text", text: "b" }] },
    ];
    const out = normalizeProcedurePaste(input);
    expect(out).toHaveLength(1);
    expect((out[0] as { type: string }).type).toBe("procedureStep");
    expect((out[0] as { content: unknown[] }).content).toHaveLength(2);
  });

  it("wraps a bulletList + paragraph into one procedureStep", () => {
    const input = [
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }],
          },
        ],
      },
      { type: "paragraph", content: [{ type: "text", text: "after" }] },
    ];
    const out = normalizeProcedurePaste(input);
    expect(out).toHaveLength(1);
    expect((out[0] as { type: string }).type).toBe("procedureStep");
    expect((out[0] as { content: unknown[] }).content).toHaveLength(2);
  });

  it("passes through a single procedureStep unchanged", () => {
    const input = [
      {
        type: "procedureStep",
        attrs: { title: "Calibrate" },
        content: [{ type: "paragraph", content: [{ type: "text", text: "do it" }] }],
      },
    ];
    const out = normalizeProcedurePaste(input);
    expect(out).toEqual(input);
  });

  it("preserves order: orphan paragraph BEFORE step → wraps the orphan, keeps the step", () => {
    const input = [
      { type: "paragraph", content: [{ type: "text", text: "intro" }] },
      {
        type: "procedureStep",
        attrs: { title: "S1" },
        content: [{ type: "paragraph", content: [{ type: "text", text: "step content" }] }],
      },
    ];
    const out = normalizeProcedurePaste(input);
    expect(out).toHaveLength(2);
    expect((out[0] as { type: string; attrs: { title: string | null } }).type).toBe("procedureStep");
    expect((out[0] as { attrs: { title: string | null } }).attrs.title).toBe(null);
    expect((out[1] as { attrs: { title: string | null } }).attrs.title).toBe("S1");
  });

  it("preserves order: step then orphan paragraph → step first, then wrapped orphan", () => {
    const input = [
      {
        type: "procedureStep",
        attrs: { title: "S1" },
        content: [{ type: "paragraph", content: [{ type: "text", text: "first" }] }],
      },
      { type: "paragraph", content: [{ type: "text", text: "outro" }] },
    ];
    const out = normalizeProcedurePaste(input);
    expect(out).toHaveLength(2);
    expect((out[0] as { attrs: { title: string | null } }).attrs.title).toBe("S1");
    expect((out[1] as { attrs: { title: string | null } }).attrs.title).toBe(null);
  });

  it("groups consecutive orphan blocks into ONE step (not one per block)", () => {
    const input = [
      { type: "paragraph", content: [{ type: "text", text: "p1" }] },
      { type: "paragraph", content: [{ type: "text", text: "p2" }] },
      {
        type: "procedureStep",
        attrs: { title: null },
        content: [{ type: "paragraph", content: [{ type: "text", text: "explicit" }] }],
      },
      { type: "paragraph", content: [{ type: "text", text: "p3" }] },
      { type: "paragraph", content: [{ type: "text", text: "p4" }] },
    ];
    const out = normalizeProcedurePaste(input);
    expect(out).toHaveLength(3);
    expect((out[0] as { content: unknown[] }).content).toHaveLength(2); // p1, p2
    expect((out[2] as { content: unknown[] }).content).toHaveLength(2); // p3, p4
  });

  it("strips procedureTitle from pasted content (it can't appear inside a step)", () => {
    const input = [
      { type: "procedureTitle", content: [{ type: "text", text: "ignore me" }] },
      { type: "paragraph", content: [{ type: "text", text: "real content" }] },
    ];
    const out = normalizeProcedurePaste(input);
    expect(out).toHaveLength(1);
    expect((out[0] as { type: string }).type).toBe("procedureStep");
    const stepContent = (out[0] as { content: unknown[] }).content;
    expect(stepContent).toHaveLength(1);
    expect((stepContent[0] as { type: string }).type).toBe("paragraph");
  });

  it("strips procedureTools from pasted content", () => {
    const input = [
      { type: "procedureTools", content: [] },
      { type: "paragraph", content: [{ type: "text", text: "p" }] },
    ];
    const out = normalizeProcedurePaste(input);
    expect(out).toHaveLength(1);
    expect((out[0] as { type: string }).type).toBe("procedureStep");
  });

  it("demotes heading nodes to paragraphs (procedureStep doesn't accept headings)", () => {
    const input = [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title" }] },
      { type: "paragraph", content: [{ type: "text", text: "body" }] },
    ];
    const out = normalizeProcedurePaste(input);
    expect(out).toHaveLength(1);
    const stepContent = (out[0] as { content: unknown[] }).content;
    expect(stepContent).toHaveLength(2);
    expect((stepContent[0] as { type: string }).type).toBe("paragraph");
    expect((stepContent[1] as { type: string }).type).toBe("paragraph");
  });

  it("does not mutate the input array", () => {
    const input = [{ type: "paragraph", content: [{ type: "text", text: "x" }] }];
    const inputSnap = JSON.stringify(input);
    normalizeProcedurePaste(input);
    expect(JSON.stringify(input)).toBe(inputSnap);
  });

  it("ignores non-object entries", () => {
    const input = [null, "string", { type: "paragraph" }, 42];
    const out = normalizeProcedurePaste(input);
    expect(out).toHaveLength(1);
    expect((out[0] as { type: string }).type).toBe("procedureStep");
    // Only the valid paragraph survives
    expect((out[0] as { content: unknown[] }).content).toHaveLength(1);
  });
});
