import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherKey,
} from "node:crypto";

const PREFIX = "vault:1:";

export class VaultSealError extends Error {
  readonly code = "vault-unreadable";
  constructor() {
    super("vault-unreadable");
  }
}

export function isSealed(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

export function sealSecret(plain: string, key: Buffer): string {
  if (plain === "") return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key as CipherKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

export function openSecret(stored: string, key: Buffer): string {
  if (stored === "") return "";
  if (!isSealed(stored)) return stored;
  try {
    const packed = Buffer.from(stored.slice(PREFIX.length), "base64url");
    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const ciphertext = packed.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key as CipherKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    throw new VaultSealError();
  }
}
