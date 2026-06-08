/**
 * RED tests for computeSourceFingerprint — Sprint 2 of worklog import.
 *
 * Contract: (source: string) => sha256 hex digest (lowercase, 64 chars).
 * Used as the dedupe key on WorkLogImport (userId, sourceType, fingerprint).
 *
 * Written BEFORE the implementation exists. MUST fail on first run.
 * Phase 2.5 — TDD Iron Law.
 */

import { computeSourceFingerprint } from "@/lib/worklog/import/fingerprint";

describe("computeSourceFingerprint — output shape", () => {
  it("returns a 64-character lowercase hex string", () => {
    const fp = computeSourceFingerprint("hello");
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches the known sha256 digest of 'hello'", () => {
    // sha256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    expect(computeSourceFingerprint("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("returns the known sha256 digest of the empty string", () => {
    // sha256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(computeSourceFingerprint("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("computeSourceFingerprint — determinism", () => {
  it("returns the same digest for the same input on repeat calls", () => {
    const a = computeSourceFingerprint("# Title\n\nbody");
    const b = computeSourceFingerprint("# Title\n\nbody");
    expect(a).toBe(b);
  });

  it("returns different digests for different inputs", () => {
    const a = computeSourceFingerprint("a");
    const b = computeSourceFingerprint("b");
    expect(a).not.toBe(b);
  });

  it("is sensitive to whitespace (a single space changes the digest)", () => {
    const a = computeSourceFingerprint("hello world");
    const b = computeSourceFingerprint("hello  world");
    expect(a).not.toBe(b);
  });

  it("is sensitive to trailing newline", () => {
    const a = computeSourceFingerprint("body");
    const b = computeSourceFingerprint("body\n");
    expect(a).not.toBe(b);
  });
});

describe("computeSourceFingerprint — unicode", () => {
  it("handles unicode characters consistently", () => {
    // Encoded as UTF-8 bytes before hashing — verify it doesn't crash and is stable.
    const a = computeSourceFingerprint("caf\u00e9");
    const b = computeSourceFingerprint("caf\u00e9");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
