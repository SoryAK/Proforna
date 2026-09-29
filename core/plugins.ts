export type IntegrationField = {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
};

export type ThirdPartyPlugin = {
  name: string;
  displayName: string;
  description: string;
  endpoint: string | null;
  fields: IntegrationField[];
};

export type IntegrationListing = {
  name: string;
  displayName: string;
  description: string;
  available: boolean;
  fields: IntegrationField[];
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

/** Workspace mail and calendar hosts that are still a developer preview. */
const PREVIEW_HOSTS = new Set([
  "gmailmcp.googleapis.com",
  "calendarmcp.googleapis.com",
]);

/** Gateways this app does not call. */
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
    fields: readFields(pluginJson),
  };
}

export function presentIntegrationCatalog(
  plugins: readonly ThirdPartyPlugin[],
): IntegrationListing[] {
  return plugins
    .filter((plugin) => plugin.name !== "gmail")
    .map((plugin) => ({
      name: plugin.name,
      displayName: plugin.displayName,
      description: plugin.description,
      available: integrationAvailable(plugin),
      fields: plugin.fields,
    }))
    .sort((a, b) => {
      const rank = integrationRank(a) - integrationRank(b);
      if (rank !== 0) return rank;
      return a.displayName.localeCompare(b.displayName);
    });
}

export function prepareIntegrationValues(
  plugin: ThirdPartyPlugin,
  input: unknown,
):
  | { ok: true; values: Record<string, string> }
  | { ok: false; error: "integration-unavailable" | "integration-incomplete" } {
  if (!integrationAvailable(plugin) || plugin.name === "gmail") {
    return { ok: false, error: "integration-unavailable" };
  }
  const incoming = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const values: Record<string, string> = {};
  for (const field of plugin.fields) {
    const value = text(incoming[field.key]);
    if (field.required && !value) return { ok: false, error: "integration-incomplete" };
    values[field.key] = value;
  }
  return { ok: true, values };
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

function integrationAvailable(plugin: ThirdPartyPlugin): boolean {
  const block = thirdPartyBlock(plugin);
  return block === null || block === "outside-career";
}

function integrationRank(plugin: IntegrationListing): number {
  if (!plugin.available) return 2;
  if (CAREER_DEFAULTS.has(plugin.name)) return 0;
  return 1;
}

function readFields(pluginJson: unknown): IntegrationField[] {
  if (!pluginJson || typeof pluginJson !== "object") return [];
  const variables = (pluginJson as { variables?: unknown }).variables;
  if (!variables || typeof variables !== "object") return [];
  const properties = (variables as { properties?: unknown }).properties;
  const required = new Set(
    Array.isArray((variables as { required?: unknown }).required)
      ? ((variables as { required: unknown[] }).required.filter(
          (item) => typeof item === "string",
        ) as string[])
      : [],
  );
  if (!properties || typeof properties !== "object") return [];
  return Object.entries(properties as Record<string, unknown>).flatMap(([key, spec]) => {
    if (!key.trim()) return [];
    const row = spec && typeof spec === "object" ? (spec as { title?: unknown }) : {};
    return [
      {
        key,
        label: text(row.title) || key,
        secret: /secret|token|key|password/i.test(key),
        required: required.has(key),
      },
    ];
  });
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
