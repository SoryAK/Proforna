/**
 * Token-at-rest crypto for IntegrationConnection — see ADR-0018.
 *
 * AES-256-GCM with a master key from `process.env.INTEGRATION_TOKEN_KEY`
 * (base64-encoded 32 bytes). Random 12-byte IV per encryption. Auth tag is
 * verified on decryption.
 *
 * Ciphertext format: `v1:<iv_b64>:<authtag_b64>:<ciphertext_b64>`
 *   - `v1:` prefix lets us rotate algorithm/format later without a data
 *     migration on the storage shape.
 *
 * NEVER log values that pass through these helpers. Callers should redact in
 * error responses.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const INTEGRATION_TOKEN_KEY_ENV = "INTEGRATION_TOKEN_KEY";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const VERSION = "v1";

function loadKey(): Buffer {
  const raw = process.env[INTEGRATION_TOKEN_KEY_ENV];
  if (!raw) {
    throw new Error(
      `${INTEGRATION_TOKEN_KEY_ENV} is not set — generate a 32-byte base64 key and add it to .env`,
    );
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new Error(`${INTEGRATION_TOKEN_KEY_ENV} must be valid base64`);
  }
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `${INTEGRATION_TOKEN_KEY_ENV} must decode to 32 bytes (got ${key.length})`,
    );
  }
  return key;
}

export function encryptToken(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ct.toString("base64"),
  ].join(":");
}

export function decryptToken(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 4) {
    throw new Error("Malformed ciphertext (expected 4 colon-separated segments)");
  }
  const [version, ivB64, tagB64, ctB64] = parts;
  if (version !== VERSION) {
    throw new Error(`Unsupported ciphertext version: ${version}`);
  }
  const key = loadKey();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  if (iv.length !== IV_BYTES) {
    throw new Error("Malformed ciphertext (bad IV length)");
  }
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}
