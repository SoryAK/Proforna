/**
 * Phase 2.5 TDD — RED first.
 *
 * This file must fail to compile until `src/lib/integration-crypto.ts` exports
 * the two helpers and the `INTEGRATION_TOKEN_KEY_ENV` constant.
 *
 * Token-at-rest crypto for IntegrationConnection. See ADR-0018.
 *
 * Format: `v1:<iv_b64>:<authtag_b64>:<ciphertext_b64>` (AES-256-GCM,
 * 12-byte random IV, key derived from base64-decoded env var).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  encryptToken,
  decryptToken,
  INTEGRATION_TOKEN_KEY_ENV,
} from "@/lib/integration-crypto";

// 32 random bytes, base64 — deterministic fixture so tests are reproducible.
const TEST_KEY_B64 = "2ZT7djarNLOvBfQTXnOg3hyEPASGnit2xHMv0kvjRbw=";
const OTHER_KEY_B64 = "/f1oBVYiFtBujJuONv3AgYQOEChNq8SRXSXZjE6NCSc=";

describe("integration-crypto — env contract", () => {
  it("exports the canonical env var name", () => {
    expect(INTEGRATION_TOKEN_KEY_ENV).toBe("INTEGRATION_TOKEN_KEY");
  });
});

describe("encryptToken / decryptToken — round trip", () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env[INTEGRATION_TOKEN_KEY_ENV];
    process.env[INTEGRATION_TOKEN_KEY_ENV] = TEST_KEY_B64;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env[INTEGRATION_TOKEN_KEY_ENV];
    else process.env[INTEGRATION_TOKEN_KEY_ENV] = originalKey;
  });

  it("round-trips a typical Notion access token", () => {
    const token = "secret_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
    const ct = encryptToken(token);
    expect(ct.startsWith("v1:")).toBe(true);
    expect(ct).not.toContain(token); // never leak plaintext into ciphertext bytes
    expect(decryptToken(ct)).toBe(token);
  });

  it("produces a different ciphertext each call (random IV)", () => {
    const a = encryptToken("same-plaintext");
    const b = encryptToken("same-plaintext");
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe("same-plaintext");
    expect(decryptToken(b)).toBe("same-plaintext");
  });

  it("round-trips empty and unicode strings", () => {
    expect(decryptToken(encryptToken(""))).toBe("");
    expect(decryptToken(encryptToken("🔑 résumé 你好"))).toBe("🔑 résumé 你好");
  });

  it("rejects tampered ciphertext (auth tag mismatch)", () => {
    const ct = encryptToken("don't tamper");
    // Flip one byte in the ciphertext segment (last part after the third colon).
    const parts = ct.split(":");
    const tamperedPayload = Buffer.from(parts[3], "base64");
    tamperedPayload[0] = tamperedPayload[0] ^ 0xff;
    parts[3] = tamperedPayload.toString("base64");
    const tampered = parts.join(":");
    expect(() => decryptToken(tampered)).toThrow();
  });

  it("rejects tampered IV", () => {
    const ct = encryptToken("payload");
    const parts = ct.split(":");
    const tamperedIv = Buffer.from(parts[1], "base64");
    tamperedIv[0] = tamperedIv[0] ^ 0x01;
    parts[1] = tamperedIv.toString("base64");
    expect(() => decryptToken(parts.join(":"))).toThrow();
  });

  it("rejects malformed ciphertext (wrong segment count)", () => {
    expect(() => decryptToken("v1:onlyonepart")).toThrow();
    expect(() => decryptToken("not-even-versioned")).toThrow();
    expect(() => decryptToken("")).toThrow();
  });

  it("rejects unknown version prefix", () => {
    const ct = encryptToken("hello");
    const v99 = ct.replace(/^v1:/, "v99:");
    expect(() => decryptToken(v99)).toThrow(/version/i);
  });
});

describe("encryptToken — env validation", () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env[INTEGRATION_TOKEN_KEY_ENV];
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env[INTEGRATION_TOKEN_KEY_ENV];
    else process.env[INTEGRATION_TOKEN_KEY_ENV] = originalKey;
  });

  it("throws a helpful error when env var is missing", () => {
    delete process.env[INTEGRATION_TOKEN_KEY_ENV];
    expect(() => encryptToken("anything")).toThrow(/INTEGRATION_TOKEN_KEY/);
  });

  it("throws when env var is set but not valid base64 of 32 bytes", () => {
    process.env[INTEGRATION_TOKEN_KEY_ENV] = "tooshort";
    expect(() => encryptToken("anything")).toThrow(/32 bytes/);
  });

  it("cross-call: decrypt with wrong key fails", () => {
    process.env[INTEGRATION_TOKEN_KEY_ENV] = TEST_KEY_B64;
    const ct = encryptToken("under key A");
    // Different 32-byte key.
    process.env[INTEGRATION_TOKEN_KEY_ENV] = OTHER_KEY_B64;
    expect(() => decryptToken(ct)).toThrow();
  });
});
