import { describe, expect, it } from "vitest";
import { classifyResumePreview } from "./resume-preview";

describe("classifyResumePreview", () => {
  it("treats PDFs as an embeddable preview", () => {
    expect(
      classifyResumePreview({ name: "cv.PDF", type: "application/pdf" }),
    ).toBe("pdf");
  });

  it("treats plain text as a readable preview", () => {
    expect(classifyResumePreview({ name: "cv.txt", type: "text/plain" })).toBe(
      "text",
    );
  });

  it("falls back when the file cannot be shown inline", () => {
    expect(
      classifyResumePreview({
        name: "cv.docx",
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).toBe("other");
  });
});
