export type NangoIntegration = {
  uniqueKey: string;
  provider: string;
};

const PROVIDER_ALIASES: Record<string, readonly string[]> = {
  gmail: ["google-mail"],
};

export function matchNangoIntegration(
  name: string,
  integrations: readonly NangoIntegration[],
): NangoIntegration | null {
  const wanted = new Set([name, ...(PROVIDER_ALIASES[name] ?? [])]);
  return (
    integrations.find((item) => wanted.has(item.uniqueKey)) ??
    integrations.find((item) => wanted.has(item.provider)) ??
    null
  );
}

export function connectSessionBody(occupantId: string, uniqueKey: string) {
  return {
    tags: { end_user_id: occupantId },
    allowed_integrations: [uniqueKey],
  };
}

export function presentNangoIntegrations(payload: unknown): NangoIntegration[] {
  return rowsOf(payload, ["configs", "integrations", "data"]).flatMap((row) => {
    const integration = integrationFrom(row);
    return integration ? [integration] : [];
  });
}

export function presentConnectLink(
  payload: unknown,
  connectOrigin: string,
  apiOrigin?: string,
): string | null {
  let origin: URL;
  try {
    origin = new URL(connectOrigin);
  } catch {
    return null;
  }
  if (origin.protocol !== "http:" && origin.protocol !== "https:") return null;
  const data = objectOf(objectOf(payload)?.data) ?? objectOf(payload);
  const token = text(data?.token);
  const raw = text(data?.connect_link);
  if (raw) {
    try {
      const url = new URL(raw);
      if (url.protocol === "http:" || url.protocol === "https:") {
        url.protocol = origin.protocol;
        url.host = origin.host;
        return withApiOrigin(url, apiOrigin);
      }
    } catch {
      // A token on this machine's connect page is the fallback.
    }
  }
  if (!token) return null;
  const url = new URL(origin.origin);
  url.searchParams.set("session_token", token);
  return withApiOrigin(url, apiOrigin);
}

export function presentNangoConnection(
  payload: unknown,
  occupantId: string,
  uniqueKey: string,
): { connectionId: string } | null {
  const matches = rowsOf(payload, ["connections", "data"]).flatMap((row) => {
    const record = objectOf(row);
    if (!record) return [];
    const connectionId = text(record.connection_id);
    const providerKey = text(record.provider_config_key);
    const tags = objectOf(record.tags);
    const endUser = text(tags?.end_user_id) || text(record.end_user_id);
    if (!connectionId || providerKey !== uniqueKey || endUser !== occupantId) return [];
    return [{ connectionId, created: text(record.created) }];
  });
  matches.sort((a, b) => b.created.localeCompare(a.created));
  const match = matches[0];
  return match ? { connectionId: match.connectionId } : null;
}

function withApiOrigin(url: URL, apiOrigin: string | undefined): string {
  if (!apiOrigin) return url.toString();
  try {
    const api = new URL(apiOrigin);
    if (api.protocol === "http:" || api.protocol === "https:") {
      url.searchParams.set("apiURL", api.origin);
    }
  } catch {
    // Keep the link. The page still has its session token.
  }
  return url.toString();
}

function integrationFrom(row: unknown): NangoIntegration | null {
  const record = objectOf(row);
  if (!record) return null;
  const uniqueKey =
    text(record.unique_key) || text(record.uniqueKey) || text(record.provider_config_key);
  const provider = text(record.provider) || uniqueKey;
  if (!uniqueKey || !provider) return null;
  return { uniqueKey, provider };
}

function rowsOf(payload: unknown, keys: readonly string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = objectOf(payload);
  if (!record) return [];
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  if (record.data && typeof record.data === "object") return rowsOf(record.data, keys);
  return [];
}

function objectOf(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
