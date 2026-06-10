import { describe, expect, it } from "vitest";
import { decideShareOutcome } from "./share-client";

// decideShareOutcome is the pure decision function used by shareWorklogs to
// translate a navigator.share() result/error into one of three outcomes:
//   - "shared":     navigator.share resolved successfully (error = null)
//   - "cancelled":  user dismissed the share sheet (DOMException "AbortError")
//   - "downloaded": any other failure (unsupported, NotAllowedError, etc.) —
//                   the caller has already fallen back to triggerDownload, so
//                   from the user's perspective they got their file.
//
// Keeping the decision pure means we don't need to mock navigator.share to
// verify the behavior matrix.

describe("decideShareOutcome", () => {
  it("returns 'shared' when no error was raised", () => {
    expect(decideShareOutcome(null)).toBe("shared");
  });

  it("returns 'cancelled' for a DOMException AbortError", () => {
    const err = new DOMException("User dismissed", "AbortError");
    expect(decideShareOutcome(err)).toBe("cancelled");
  });

  it("returns 'cancelled' for a plain Error whose name is AbortError", () => {
    // Some browsers throw a plain Error with name="AbortError" instead of a
    // proper DOMException. Treat both the same.
    const err = new Error("share aborted");
    err.name = "AbortError";
    expect(decideShareOutcome(err)).toBe("cancelled");
  });

  it("returns 'downloaded' for NotAllowedError (caller falls back)", () => {
    const err = new DOMException("not allowed", "NotAllowedError");
    expect(decideShareOutcome(err)).toBe("downloaded");
  });

  it("returns 'downloaded' for any other error", () => {
    expect(decideShareOutcome(new Error("network gone"))).toBe("downloaded");
  });

  it("returns 'downloaded' for non-Error throwables", () => {
    expect(decideShareOutcome("oops")).toBe("downloaded");
    expect(decideShareOutcome(undefined)).toBe("downloaded");
  });
});
