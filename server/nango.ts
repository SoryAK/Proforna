import {
  connectSessionBody,
  presentConnectLink,
  presentNangoConnection,
  presentNangoIntegrations,
  type NangoIntegration,
} from "../core/nango";

export type NangoRuntime = {
  host: string;
  connectOrigin: string;
  secret: string;
};

export type NangoLink = {
  connectionId: string;
  providerKey: string;
};

export class NangoRequestError extends Error {
  constructor(readonly code: "sign-in-failed" | "sign-in-unavailable") {
    super(code);
  }
}

export function nangoRuntime(): NangoRuntime | null {
  const secret = process.env.NANGO_SECRET_KEY?.trim() ?? "";
  if (!secret) return null;
  return {
    host: trimOrigin(process.env.NANGO_HOST, "http://127.0.0.1:3003"),
    connectOrigin: trimOrigin(process.env.NANGO_CONNECT_URL, "http://127.0.0.1:3009"),
    secret,
  };
}

export async function loadNangoIntegrations(
  runtime: NangoRuntime,
  fetchImpl: typeof fetch = fetch,
): Promise<NangoIntegration[]> {
  const payload = await readJson(runtime, "/integrations", { method: "GET" }, fetchImpl);
  return presentNangoIntegrations(payload);
}

export async function createNangoConnectLink(
  runtime: NangoRuntime,
  occupantId: string,
  uniqueKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const payload = await readJson(
    runtime,
    "/connect/sessions",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(connectSessionBody(occupantId, uniqueKey)),
    },
    fetchImpl,
  );
  const link = presentConnectLink(payload, runtime.connectOrigin, runtime.host);
  if (!link) throw new NangoRequestError("sign-in-failed");
  return link;
}

export async function findNangoConnection(
  runtime: NangoRuntime,
  occupantId: string,
  uniqueKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ connectionId: string } | null> {
  const params = new URLSearchParams({ "tags[end_user_id]": occupantId });
  const payload = await readJson(runtime, `/connections?${params}`, { method: "GET" }, fetchImpl);
  return presentNangoConnection(payload, occupantId, uniqueKey);
}

export async function deleteNangoConnection(
  runtime: NangoRuntime,
  link: NangoLink,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const params = new URLSearchParams({ provider_config_key: link.providerKey });
  await readJson(
    runtime,
    `/connections/${encodeURIComponent(link.connectionId)}?${params}`,
    { method: "DELETE" },
    fetchImpl,
  );
}

export async function nangoProxy(
  runtime: NangoRuntime,
  input: {
    method: string;
    path: string;
    providerConfigKey: string;
    connectionId: string;
    body?: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const url = new URL(`/proxy/${input.path.replace(/^\//, "")}`, runtime.host);
  return fetchImpl(url, {
    method: input.method,
    headers: {
      authorization: `Bearer ${runtime.secret}`,
      "Provider-Config-Key": input.providerConfigKey,
      "Connection-Id": input.connectionId,
      ...(input.body ? { "content-type": "application/json" } : {}),
    },
    body: input.body,
    signal: AbortSignal.timeout(8000),
  });
}

async function readJson(
  runtime: NangoRuntime,
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const response = await fetchImpl(new URL(path, runtime.host), {
    ...init,
    headers: {
      authorization: `Bearer ${runtime.secret}`,
      accept: "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new NangoRequestError("sign-in-failed");
  return response.json();
}

function trimOrigin(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim() || fallback;
  return trimmed.replace(/\/$/, "");
}
