import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

// The database key is not stored beside the SQLite file. A copy of the
// vault can still be read, but the API keys inside it cannot.
const ACCOUNT = "vault-key";
const LABEL = "Proforna vault key";

const KEYCHAIN = `
import sys
import gi
gi.require_version("Secret", "1")
from gi.repository import Secret

schema = Secret.Schema.new(
    "dev.proforna.desktop",
    Secret.SchemaFlags.NONE,
    {"account": Secret.SchemaAttributeType.STRING},
)
action, account = sys.argv[1], sys.argv[2]
attrs = {"account": account}
if action == "lookup":
    found = Secret.password_lookup_sync(schema, attrs, None)
    if found is None:
        sys.exit(2)
    sys.stdout.write(found)
elif action == "store":
    secret = sys.stdin.read()
    ok = Secret.password_store_sync(
        schema, attrs, Secret.COLLECTION_DEFAULT, ${JSON.stringify(LABEL)}, secret, None
    )
    if not ok:
        sys.exit(1)
elif action == "clear":
    Secret.password_clear_sync(schema, attrs, None)
else:
    sys.exit(1)
`;

export class VaultKeyError extends Error {
  readonly code = "vault-unavailable";
  constructor() {
    super("vault-unavailable");
  }
}

type VaultKeyStore = {
  read(): string | null;
  write(secret: string): void;
};

let storeOverride: VaultKeyStore | null = null;
let cached: Buffer | null = null;

export function useVaultKeyStore(store: VaultKeyStore | null): void {
  storeOverride = store;
  cached = null;
}

export function vaultKey(create: boolean): Buffer {
  if (cached) return cached;
  const store = activeStore();
  const existing = store.read();
  if (existing) {
    const key = Buffer.from(existing, "base64");
    if (key.length !== 32) throw new VaultKeyError();
    cached = key;
    return key;
  }
  if (!create) throw new VaultKeyError();
  const key = randomBytes(32);
  store.write(key.toString("base64"));
  cached = key;
  return key;
}

const memorySecret = { value: null as string | null };

function activeStore(): VaultKeyStore {
  if (storeOverride) return storeOverride;
  if (process.env.VITEST) return memoryStore();
  return systemVaultKeyStore(ACCOUNT);
}

function memoryStore(): VaultKeyStore {
  return {
    read: () => memorySecret.value,
    write: (secret) => {
      memorySecret.value = secret;
    },
  };
}

export function systemVaultKeyStore(account: string): VaultKeyStore {
  return {
    read: () => keychain(account, "lookup"),
    write: (secret) => {
      keychain(account, "store", secret);
    },
  };
}

export function clearSystemVaultKey(account: string): void {
  keychain(account, "clear");
}

function keychain(
  account: string,
  action: "lookup" | "store" | "clear",
  secret?: string,
): string | null {
  const result = spawnSync("python3", ["-c", KEYCHAIN, action, account], {
    input: secret,
    encoding: "utf8",
    timeout: 15000,
  });
  if (action === "lookup" && result.status === 2) return null;
  if (result.status !== 0) throw new VaultKeyError();
  return action === "lookup" ? result.stdout.trim() : null;
}
