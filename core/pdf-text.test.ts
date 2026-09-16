import { describe, expect, it } from "vitest";
import { linesFromPdfRuns } from "./pdf-text";

describe("linesFromPdfRuns", () => {
  it("groups words on the same baseline and keeps separate lines apart", () => {
    const text = linesFromPdfRuns([
      { str: "Acme", x: 50, y: 700 },
      { str: "2019–2024", x: 400, y: 700 },
      { str: "Electrician", x: 50, y: 680 },
    ]);
    expect(text).toBe("Acme 2019–2024\nElectrician");
  });
});
