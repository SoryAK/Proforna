import { describe, expect, it } from "vitest";

import {
  appendStep,
  toggleTools,
  moveStepUp,
  moveStepDown,
  setStepTitle,
  extractProcedureTitleText,
} from "./procedure-transforms";
import { buildEmptyProcedure, isValidProcedureDoc } from "./procedure-schema";

// ── Test fixtures ────────────────────────────────────────────────────────

function makeDoc(stepCount: number) {
  return {
    type: "procedureDoc",
    content: [
      { type: "procedureTitle", content: [{ type: "text", text: "T" }] },
      ...Array.from({ length: stepCount }, (_, i) => ({
        type: "procedureStep",
        attrs: { title: `Step ${i + 1}` },
        content: [{ type: "paragraph", content: [{ type: "text", text: `body${i}` }] }],
      })),
    ],
  };
}

function makeDocWithTools() {
  return {
    type: "procedureDoc",
    content: [
      { type: "procedureTitle", content: [{ type: "text", text: "T" }] },
      { type: "procedureTools", content: [{ type: "paragraph" }] },
      {
        type: "procedureStep",
        attrs: { title: null },
        content: [{ type: "paragraph" }],
      },
    ],
  };
}

// ── appendStep ───────────────────────────────────────────────────────────

describe("appendStep", () => {
  it("appends an empty procedureStep at the end", () => {
    const before = makeDoc(2);
    const after = appendStep(before) as { content: { type: string }[] };
    expect(after.content.length).toBe(4); // title + 2 steps + 1 new
    expect(after.content[3]).toMatchObject({
      type: "procedureStep",
      attrs: { title: null },
      content: [{ type: "paragraph" }],
    });
  });

  it("preserves the locked schema shape (still valid)", () => {
    const after = appendStep(buildEmptyProcedure("X"));
    expect(isValidProcedureDoc(after)).toBe(true);
  });

  it("accepts an optional title argument", () => {
    const after = appendStep(makeDoc(1), "Custom") as {
      content: { attrs?: { title: string | null } }[];
    };
    expect(after.content[2].attrs?.title).toBe("Custom");
  });

  it("does not mutate the input", () => {
    const before = makeDoc(1);
    const beforeJson = JSON.stringify(before);
    appendStep(before);
    expect(JSON.stringify(before)).toBe(beforeJson);
  });

  it("returns the input unchanged when given a non-procedureDoc", () => {
    const note = { type: "doc", content: [] };
    expect(appendStep(note)).toBe(note);
    expect(appendStep(null)).toBeNull();
  });
});

// ── toggleTools ──────────────────────────────────────────────────────────

describe("toggleTools", () => {
  it("inserts procedureTools at slot 1 when absent", () => {
    const before = makeDoc(1);
    const after = toggleTools(before) as { content: { type: string }[] };
    expect(after.content[0].type).toBe("procedureTitle");
    expect(after.content[1].type).toBe("procedureTools");
    expect(after.content[2].type).toBe("procedureStep");
  });

  it("removes procedureTools when present", () => {
    const before = makeDocWithTools();
    const after = toggleTools(before) as { content: { type: string }[] };
    expect(after.content.find((c) => c.type === "procedureTools")).toBeUndefined();
    expect(isValidProcedureDoc(after)).toBe(true);
  });

  it("keeps the doc valid after either branch", () => {
    const off = toggleTools(makeDoc(1));
    expect(isValidProcedureDoc(off)).toBe(true);
    const on = toggleTools(off);
    expect(isValidProcedureDoc(on)).toBe(true);
  });

  it("does not mutate the input", () => {
    const before = makeDoc(1);
    const beforeJson = JSON.stringify(before);
    toggleTools(before);
    expect(JSON.stringify(before)).toBe(beforeJson);
  });

  it("returns the input unchanged when given a non-procedureDoc", () => {
    const note = { type: "doc", content: [] };
    expect(toggleTools(note)).toBe(note);
  });
});

// ── moveStepUp / moveStepDown ────────────────────────────────────────────

describe("moveStepUp", () => {
  it("swaps the step with the one above (no tools)", () => {
    const before = makeDoc(3);
    const after = moveStepUp(before, 1) as {
      content: { attrs?: { title: string | null } }[];
    };
    // Step at index 1 (was Step 2) is now at index 0 of steps.
    expect(after.content[1].attrs?.title).toBe("Step 2");
    expect(after.content[2].attrs?.title).toBe("Step 1");
    expect(after.content[3].attrs?.title).toBe("Step 3");
  });

  it("works correctly when tools are present (skips the tools slot)", () => {
    const before = {
      type: "procedureDoc",
      content: [
        { type: "procedureTitle", content: [] },
        { type: "procedureTools", content: [{ type: "paragraph" }] },
        { type: "procedureStep", attrs: { title: "A" }, content: [{ type: "paragraph" }] },
        { type: "procedureStep", attrs: { title: "B" }, content: [{ type: "paragraph" }] },
      ],
    };
    const after = moveStepUp(before, 1) as {
      content: { attrs?: { title: string | null } }[];
    };
    expect(after.content[2].attrs?.title).toBe("B");
    expect(after.content[3].attrs?.title).toBe("A");
  });

  it("is a no-op for stepIndex 0", () => {
    const before = makeDoc(2);
    const after = moveStepUp(before, 0);
    expect(after).toEqual(before);
  });

  it("is a no-op for out-of-range stepIndex", () => {
    const before = makeDoc(2);
    expect(moveStepUp(before, 5)).toEqual(before);
    expect(moveStepUp(before, -1)).toEqual(before);
  });
});

describe("moveStepDown", () => {
  it("swaps the step with the one below", () => {
    const before = makeDoc(3);
    const after = moveStepDown(before, 0) as {
      content: { attrs?: { title: string | null } }[];
    };
    expect(after.content[1].attrs?.title).toBe("Step 2");
    expect(after.content[2].attrs?.title).toBe("Step 1");
  });

  it("is a no-op for the last step", () => {
    const before = makeDoc(3);
    const after = moveStepDown(before, 2);
    expect(after).toEqual(before);
  });
});

// ── setStepTitle ─────────────────────────────────────────────────────────

describe("setStepTitle", () => {
  it("sets a step title", () => {
    const after = setStepTitle(makeDoc(2), 0, "Inspect box") as {
      content: { attrs?: { title: string | null } }[];
    };
    expect(after.content[1].attrs?.title).toBe("Inspect box");
    // Other step untouched.
    expect(after.content[2].attrs?.title).toBe("Step 2");
  });

  it("trims whitespace", () => {
    const after = setStepTitle(makeDoc(1), 0, "  trimmed  ") as {
      content: { attrs?: { title: string | null } }[];
    };
    expect(after.content[1].attrs?.title).toBe("trimmed");
  });

  it("clears to null when given empty / whitespace / null", () => {
    const a = setStepTitle(makeDoc(1), 0, "") as {
      content: { attrs?: { title: string | null } }[];
    };
    expect(a.content[1].attrs?.title).toBeNull();
    const b = setStepTitle(makeDoc(1), 0, "   ") as {
      content: { attrs?: { title: string | null } }[];
    };
    expect(b.content[1].attrs?.title).toBeNull();
    const c = setStepTitle(makeDoc(1), 0, null) as {
      content: { attrs?: { title: string | null } }[];
    };
    expect(c.content[1].attrs?.title).toBeNull();
  });

  it("is a no-op for out-of-range stepIndex", () => {
    const before = makeDoc(1);
    expect(setStepTitle(before, 5, "x")).toEqual(before);
  });

  it("does not mutate the input", () => {
    const before = makeDoc(1);
    const beforeJson = JSON.stringify(before);
    setStepTitle(before, 0, "z");
    expect(JSON.stringify(before)).toBe(beforeJson);
  });
});

// ── extractProcedureTitleText ────────────────────────────────────────────

describe("extractProcedureTitleText", () => {
  it("returns the title plain text", () => {
    const doc = {
      type: "procedureDoc",
      content: [
        {
          type: "procedureTitle",
          content: [
            { type: "text", text: "Reset BL" },
            { type: "text", text: " Weigher" },
          ],
        },
        {
          type: "procedureStep",
          attrs: { title: null },
          content: [{ type: "paragraph" }],
        },
      ],
    };
    expect(extractProcedureTitleText(doc)).toBe("Reset BL Weigher");
  });

  it("trims surrounding whitespace", () => {
    const doc = {
      type: "procedureDoc",
      content: [
        {
          type: "procedureTitle",
          content: [{ type: "text", text: "  spaced  " }],
        },
        {
          type: "procedureStep",
          attrs: { title: null },
          content: [{ type: "paragraph" }],
        },
      ],
    };
    expect(extractProcedureTitleText(doc)).toBe("spaced");
  });

  it("returns empty string when title is empty", () => {
    expect(extractProcedureTitleText(buildEmptyProcedure(""))).toBe("");
  });

  it("returns empty string for a non-procedureDoc", () => {
    expect(extractProcedureTitleText({ type: "doc", content: [] })).toBe("");
    expect(extractProcedureTitleText(null)).toBe("");
  });
});
