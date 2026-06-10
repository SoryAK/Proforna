import { afterEach, describe, expect, it, vi } from "vitest";
import { canShareFiles } from "./can-share";

// canShareFiles() is the SSR-safe predicate that gates the "Share to…"
// menu item. It must return false on the server, false on browsers that
// don't expose `navigator.share` + `navigator.canShare`, and false when
// `navigator.canShare({ files })` returns false (e.g. Firefox desktop
// claims navigator.share but rejects file payloads). It returns true only
// when all three checks pass.

const realNavigator = globalThis.navigator;

afterEach(() => {
  // Restore the real navigator (or remove it if there wasn't one).
  if (realNavigator) {
    Object.defineProperty(globalThis, "navigator", {
      value: realNavigator,
      configurable: true,
      writable: true,
    });
  } else {
    // @ts-expect-error — clearing test navigator
    delete globalThis.navigator;
  }
  vi.restoreAllMocks();
});

function setNavigator(value: unknown) {
  Object.defineProperty(globalThis, "navigator", {
    value,
    configurable: true,
    writable: true,
  });
}

describe("canShareFiles", () => {
  it("returns false when navigator is undefined (SSR)", () => {
    // @ts-expect-error — simulating SSR
    delete globalThis.navigator;
    expect(canShareFiles()).toBe(false);
  });

  it("returns false when navigator.share is missing", () => {
    setNavigator({ canShare: () => true });
    expect(canShareFiles()).toBe(false);
  });

  it("returns false when navigator.canShare is missing", () => {
    setNavigator({ share: async () => {} });
    expect(canShareFiles()).toBe(false);
  });

  it("returns false when navigator.canShare({files}) returns false", () => {
    setNavigator({
      share: async () => {},
      canShare: () => false,
    });
    expect(canShareFiles()).toBe(false);
  });

  it("returns true when share + canShare both exist and canShare({files}) is true", () => {
    setNavigator({
      share: async () => {},
      canShare: (data: { files?: unknown[] }) => Array.isArray(data.files),
    });
    expect(canShareFiles()).toBe(true);
  });

  it("returns false when canShare throws", () => {
    setNavigator({
      share: async () => {},
      canShare: () => {
        throw new Error("boom");
      },
    });
    expect(canShareFiles()).toBe(false);
  });
});
