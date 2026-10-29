import { describe, expect, it } from "vitest";
import { isFrameTarget, pageAllowsFrame } from "./frame-policy";

describe("frame policy", () => {
  it("allows a page that names no frame rule", () => {
    expect(pageAllowsFrame({ frameOptions: null, contentSecurityPolicy: null })).toBe(true);
  });

  it("refuses a page that only its own site may frame", () => {
    expect(pageAllowsFrame({ frameOptions: "SAMEORIGIN", contentSecurityPolicy: null })).toBe(false);
    expect(pageAllowsFrame({ frameOptions: "DENY", contentSecurityPolicy: null })).toBe(false);
    expect(
      pageAllowsFrame({
        frameOptions: null,
        contentSecurityPolicy: "frame-ancestors 'self' *.www.linkedin.com:*",
      }),
    ).toBe(false);
  });

  it("allows a page that welcomes any https frame", () => {
    expect(
      pageAllowsFrame({
        frameOptions: null,
        contentSecurityPolicy: "default-src 'self'; frame-ancestors https:",
      }),
    ).toBe(true);
  });

  it("refuses when any policy blocks framing", () => {
    expect(
      pageAllowsFrame({
        frameOptions: null,
        contentSecurityPolicy: ["frame-ancestors *", "frame-ancestors 'none'"],
      }),
    ).toBe(false);
  });

  it("accepts a public web address and refuses this machine", () => {
    expect(isFrameTarget("https://example.com/about")).toBe(true);
    expect(isFrameTarget("http://127.0.0.1/secret")).toBe(false);
    expect(isFrameTarget("http://localhost/secret")).toBe(false);
    expect(isFrameTarget("https://user:pass@example.com/")).toBe(false);
  });
});
