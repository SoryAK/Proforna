import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  prepareConnectionEnabled,
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
  enabled: boolean;
};

export class IntegrationCatalogError extends Error {
  constructor(
    readonly code:
      | "integration-unavailable"
      | "integration-incomplete"
      | "integration-unknown"
      | "integration-not-configured"
      | "integration-enabled-invalid",
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
  const saved = savedAccounts(db, occupantId);
  const gmail = readGmailAccount(db, occupantId);
  return [
    {
      name: "gmail",
      displayName: "Gmail",
      description: "Search mail and save a draft. Proforna does not send mail.",
      available: true,
      fields: [],
      configured: gmail.connected,
      enabled: gmail.connected && gmail.enabled,
    },
    ...presentIntegrationCatalog(plugins)
      .filter((plugin) => plugin.available)
      .map((plugin) => {
      const account = saved.get(plugin.name);
      return {
        ...plugin,
        configured: Boolean(account),
        enabled: account?.enabled ?? false,
      };
    }),
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

export function setIntegrationEnabled(
  db: DatabaseSync,
  occupantId: string,
  name: string,
  input: unknown,
  plugins: readonly ThirdPartyPlugin[],
): boolean {
  if (!plugins.some((plugin) => plugin.name === name)) {
    throw new IntegrationCatalogError("integration-unknown");
  }
  const prepared = prepareConnectionEnabled(input);
  if (!prepared.ok) throw new IntegrationCatalogError(prepared.error);
  const existing = db
    .prepare(
      "SELECT 1 AS present FROM integration_accounts WHERE occupant_id = ? AND name = ?",
    )
    .get(occupantId, name) as { present: number } | undefined;
  if (!existing) throw new IntegrationCatalogError("integration-not-configured");
  db.prepare(
    "UPDATE integration_accounts SET enabled = ?, updated_at = ? WHERE occupant_id = ? AND name = ?",
  ).run(prepared.enabled ? 1 : 0, new Date().toISOString(), occupantId, name);
  return prepared.enabled;
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
      "SELECT secrets_json, enabled FROM integration_accounts WHERE occupant_id = ? AND name = ?",
    )
    .get(occupantId, name) as { secrets_json: string; enabled: number } | undefined;
  if (!row || row.enabled !== 1) return null;
  const opened = openSecret(row.secrets_json, vaultKey(true));
  const parsed = JSON.parse(opened) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed as Record<string, string>;
}

function savedAccounts(
  db: DatabaseSync,
  occupantId: string,
): Map<string, { enabled: boolean }> {
  const rows = db
    .prepare("SELECT name, enabled FROM integration_accounts WHERE occupant_id = ?")
    .all(occupantId) as { name: string; enabled: number }[];
  return new Map(rows.map((row) => [row.name, { enabled: row.enabled === 1 }]));
}
