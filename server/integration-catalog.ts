import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  prepareIntegrationValues,
  presentIntegrationCatalog,
  readThirdPartyPlugin,
  type IntegrationField,
  type ThirdPartyPlugin,
} from "../core/plugins";
import { readGmailAccount } from "./gmail";
import { openSecret, sealSecret } from "./vault-seal";
import { vaultKey } from "./vault-key";

export type ListedIntegration = {
  name: string;
  displayName: string;
  description: string;
  available: boolean;
  fields: IntegrationField[];
  configured: boolean;
};

export class IntegrationCatalogError extends Error {
  constructor(
    readonly code: "integration-unavailable" | "integration-incomplete" | "integration-unknown",
  ) {
    super(code);
  }
}

export function loadPluginCatalog(
  root = join(process.cwd(), "plugins", "third_party"),
): ThirdPartyPlugin[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const dir = join(root, entry.name);
    const plugin = readThirdPartyPlugin(
      JSON.parse(readFileSync(join(dir, ".cursor-plugin", "plugin.json"), "utf8")),
      JSON.parse(readFileSync(join(dir, "mcp.json"), "utf8")),
    );
    return plugin ? [plugin] : [];
  });
}

export function listIntegrationCatalog(
  db: DatabaseSync,
  occupantId: string,
  plugins: readonly ThirdPartyPlugin[],
): ListedIntegration[] {
  const saved = savedNames(db, occupantId);
  const gmail = readGmailAccount(db, occupantId);
  return [
    {
      name: "gmail",
      displayName: "Gmail",
      description: "Search mail and save a draft. Proforna does not send mail.",
      available: true,
      fields: [],
      configured: gmail.connected,
    },
    ...presentIntegrationCatalog(plugins).map((plugin) => ({
      ...plugin,
      configured: saved.has(plugin.name),
    })),
  ];
}

export function saveIntegrationCatalog(
  db: DatabaseSync,
  occupantId: string,
  name: string,
  input: unknown,
  plugins: readonly ThirdPartyPlugin[],
): void {
  const plugin = plugins.find((item) => item.name === name);
  if (!plugin) throw new IntegrationCatalogError("integration-unknown");
  const prepared = prepareIntegrationValues(plugin, input);
  if (!prepared.ok) throw new IntegrationCatalogError(prepared.error);
  const sealed = sealSecret(JSON.stringify(prepared.values), vaultKey(true));
  db.prepare(
    `INSERT INTO integration_accounts (occupant_id, name, secrets_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(occupant_id, name) DO UPDATE SET
       secrets_json = excluded.secrets_json,
       updated_at = excluded.updated_at`,
  ).run(occupantId, name, sealed, new Date().toISOString());
}

export function removeIntegrationCatalog(
  db: DatabaseSync,
  occupantId: string,
  name: string,
  plugins: readonly ThirdPartyPlugin[],
): void {
  if (!plugins.some((plugin) => plugin.name === name)) {
    throw new IntegrationCatalogError("integration-unknown");
  }
  db.prepare("DELETE FROM integration_accounts WHERE occupant_id = ? AND name = ?").run(
    occupantId,
    name,
  );
}

export function readIntegrationSecrets(
  db: DatabaseSync,
  occupantId: string,
  name: string,
): Record<string, string> | null {
  const row = db
    .prepare(
      "SELECT secrets_json FROM integration_accounts WHERE occupant_id = ? AND name = ?",
    )
    .get(occupantId, name) as { secrets_json: string } | undefined;
  if (!row) return null;
  const opened = openSecret(row.secrets_json, vaultKey(true));
  const parsed = JSON.parse(opened) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed as Record<string, string>;
}

function savedNames(db: DatabaseSync, occupantId: string): Set<string> {
  const rows = db
    .prepare("SELECT name FROM integration_accounts WHERE occupant_id = ?")
    .all(occupantId) as { name: string }[];
  return new Set(rows.map((row) => row.name));
}
