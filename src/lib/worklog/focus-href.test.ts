import { describe, expect, it } from "vitest";
import { buildWorklogFocusHref } from "./focus-href";

describe("buildWorklogFocusHref", () => {
  const targetId = "11111111-2222-3333-4444-555555555555";
  const reader = "/worklog/notes/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  // Per ADR-0024 the helper always returns the canonical dedicated-reader
  // URL regardless of the calling pathname. The pathname parameter is
  // retained for backward compatibility with existing callers but is
  // ignored — these cases lock that contract.
  it("from /worklog/notes (list view) routes to dedicated reader", () => {
    expect(buildWorklogFocusHref("/worklog/notes", targetId)).toBe(
      `/worklog/notes/${targetId}`,
    );
  });

  it("from /worklog/notes/<currentId> swaps to dedicated reader for target", () => {
    expect(buildWorklogFocusHref(reader, targetId)).toBe(
      `/worklog/notes/${targetId}`,
    );
  });

  it("from /worklog (home) routes to dedicated reader", () => {
    expect(buildWorklogFocusHref("/worklog", targetId)).toBe(
      `/worklog/notes/${targetId}`,
    );
  });

  it("from an unrelated route routes to dedicated reader", () => {
    expect(buildWorklogFocusHref("/dashboard", targetId)).toBe(
      `/worklog/notes/${targetId}`,
    );
  });

  it("ignores trailing slashes on the pathname", () => {
    expect(buildWorklogFocusHref(`${reader}/`, targetId)).toBe(
      `/worklog/notes/${targetId}`,
    );
  });
});
