import { describe, expect, it } from "vitest";
import { buildWorklogFocusHref } from "./focus-href";

describe("buildWorklogFocusHref", () => {
  const targetId = "11111111-2222-3333-4444-555555555555";

  it("from /worklog/notes (list view) emits ?focus=<id>", () => {
    expect(buildWorklogFocusHref("/worklog/notes", targetId)).toBe(
      `/worklog/notes?focus=${targetId}`,
    );
  });

  it("from /worklog/notes/<currentId> (dedicated reader) swaps the path id", () => {
    expect(
      buildWorklogFocusHref(
        "/worklog/notes/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        targetId,
      ),
    ).toBe(`/worklog/notes/${targetId}`);
  });

  it("from /worklog (home) falls back to list view + focus", () => {
    expect(buildWorklogFocusHref("/worklog", targetId)).toBe(
      `/worklog/notes?focus=${targetId}`,
    );
  });

  it("from an unrelated route falls back to list view + focus", () => {
    expect(buildWorklogFocusHref("/dashboard", targetId)).toBe(
      `/worklog/notes?focus=${targetId}`,
    );
  });

  it("ignores trailing slashes when matching the dedicated-reader shape", () => {
    expect(
      buildWorklogFocusHref(
        "/worklog/notes/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/",
        targetId,
      ),
    ).toBe(`/worklog/notes/${targetId}`);
  });
});
