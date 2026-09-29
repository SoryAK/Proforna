export type ThirdPartyPlugin = {
  name: string;
  displayName: string;
  description: string;
  endpoint: string | null;
};

/** Why a catalog plugin is not offered on a new vault. */
export type ThirdPartyBlock =
  | "preview"
  | "foreign-host"
  | "unresolved"
  | "outside-career";

/**
 * Occupant accounts a new vault can offer first.
 * Hiring desks, trading, and ads stay in the catalog.
 */
const CAREER_DEFAULTS = new Set([
  "calendly",
  "docusign",
  "github",
  "todoist",
  "zoom",
]);

/** Google Workspace MCP hosts that are still a developer preview. */
const PREVIEW_HOSTS = new Set([
  "gmailmcp.googleapis.com",
  "calendarmcp.googleapis.com",
]);

/** Gateways that only answer inside Cursor or Grok. */
const FOREIGN_HOSTS = new Set([
  "api.cursor.com",
  "connectors-gateway.grok.com",
]);

export function readThirdPartyPlugin(
  pluginJson: unknown,
  mcpJson: unknown,
): ThirdPartyPlugin | null {
  if (!pluginJson || typeof pluginJson !== "object") return null;
  const row = pluginJson as {
    name?: unknown;
    displayName?: unknown;
    description?: unknown;
  };
  const name = text(row.name);
  const description = text(row.description);
  if (!name || !description) return null;
  return {
    name,
    displayName: text(row.displayName) || name,
    description,
    endpoint: readEndpoint(mcpJson, name),
  };
}

export function thirdPartyBlock(
  plugin: ThirdPartyPlugin,
): ThirdPartyBlock | null {
  if (!plugin.endpoint) return "unresolved";
  const host = hostOf(plugin.endpoint);
  if (!host) return "unresolved";
  if (PREVIEW_HOSTS.has(host)) return "preview";
  if (FOREIGN_HOSTS.has(host)) return "foreign-host";
  if (!CAREER_DEFAULTS.has(plugin.name)) return "outside-career";
  return null;
}

export function defaultThirdPartyPlugins(
  plugins: readonly ThirdPartyPlugin[],
): ThirdPartyPlugin[] {
  return plugins
    .filter((plugin) => thirdPartyBlock(plugin) === null)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
}

function readEndpoint(mcpJson: unknown, name: string): string | null {
  if (!mcpJson || typeof mcpJson !== "object") return null;
  const servers = (mcpJson as { mcpServers?: unknown }).mcpServers;
  if (!servers || typeof servers !== "object") return null;
  const record = servers as Record<string, unknown>;
  const preferred = record[name] ?? Object.values(record)[0];
  if (!preferred || typeof preferred !== "object") return null;
  const url = (preferred as { url?: unknown }).url;
  if (typeof url !== "string" || !url.startsWith("https://")) return null;
  return url;
}

function hostOf(endpoint: string): string | null {
  try {
    return new URL(endpoint).host.toLowerCase();
  } catch {
    return null;
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
