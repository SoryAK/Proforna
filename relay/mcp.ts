import type { WorkMapSnapshot } from "../core/index";

const MODERN_PROTOCOL = "2026-07-28";
const LEGACY_PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const SUPPORTED_PROTOCOLS = [MODERN_PROTOCOL, ...LEGACY_PROTOCOLS];

const SERVER_INFO = { name: "Proforna relay", version: "0.0.1" };

const INSTRUCTIONS =
  "Read one approved publication by its slug. The result is the same snapshot a person sees on the page, including the story and the rest a recruiter can read. Pass token when the publication requires one. A revoked or expired publication is not available.";

export type PublicationSnapshot = Omit<WorkMapSnapshot, "occupantId">;

export type PublicationRead =
  | { ok: true; snapshot: PublicationSnapshot }
  | { ok: false; reason: "unavailable" | "token-required" };

export type McpHeaders = {
  protocolVersion: string | undefined;
  method: string | undefined;
  toolName: string | undefined;
};

export type McpOutcome = {
  status: 200 | 202 | 400 | 403 | 404;
  body: Record<string, unknown> | null;
  servedPublicationSlug: string | null;
};

type JsonObject = Record<string, unknown>;

export function handleMcp(
  payload: unknown,
  headers: McpHeaders,
  read: (slug: string, token: string | null) => PublicationRead,
): McpOutcome {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return rpcError(null, -32600, "Invalid request.", 400);
  }
  const message = payload as JsonObject;
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return rpcError(idOf(message), -32600, "Invalid request.", 400);
  }
  if (!("id" in message)) {
    return { status: 202, body: null, servedPublicationSlug: null };
  }

  const protocol = resolveProtocol(headers.protocolVersion, message);
  if (!protocol.ok) return protocol.outcome;

  if (protocol.modern) {
    const headerError = validateModernHeaders(message, headers);
    if (headerError) return headerError;
  }

  if (message.method === "server/discover") {
    return ok(message, {
      resultType: "complete",
      supportedVersions: SUPPORTED_PROTOCOLS,
      capabilities: { tools: {} },
      instructions: INSTRUCTIONS,
      ttlMs: 3_600_000,
      cacheScope: "public",
      _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO },
    });
  }

  if (message.method === "initialize" && !protocol.modern) {
    return ok(message, {
      protocolVersion: protocol.version,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
      instructions: INSTRUCTIONS,
    });
  }

  if (message.method === "ping") {
    return ok(message, forProtocol(protocol.modern, {}));
  }

  if (message.method === "tools/list") {
    const tools = [readPublicationTool()];
    return ok(
      message,
      forProtocol(
        protocol.modern,
        { tools },
        { ttlMs: 300_000, cacheScope: "public" },
      ),
    );
  }

  if (message.method === "tools/call") {
    return callTool(message, protocol.modern, read);
  }

  return rpcError(idOf(message), -32601, "Method not found.", 404);
}

function callTool(
  message: JsonObject,
  modern: boolean,
  read: (slug: string, token: string | null) => PublicationRead,
): McpOutcome {
  const params = objectOf(message.params);
  const name = params?.name;
  if (name !== "read_publication") {
    return toolError(message, modern, "Unknown tool.");
  }
  const args = objectOf(params?.arguments) ?? {};
  const slug = typeof args.slug === "string" ? args.slug.trim() : "";
  if (!slug) return toolError(message, modern, "A slug is required.");
  const token = typeof args.token === "string" ? args.token : null;
  const result = read(slug, token);
  if (!result.ok) {
    return toolError(
      message,
      modern,
      result.reason === "token-required"
        ? "This publication requires an access token."
        : "This publication is not available.",
    );
  }
  const text = JSON.stringify(result.snapshot);
  return {
    status: 200,
    servedPublicationSlug: slug,
    body: {
      jsonrpc: "2.0",
      id: idOf(message),
      result: forProtocol(
        modern,
        {
          content: [{ type: "text", text }],
          isError: false,
        },
        {
          structuredContent: result.snapshot,
          cacheScope: "private",
          ttlMs: 0,
        },
      ),
    },
  };
}

function readPublicationTool(): JsonObject {
  return {
    name: "read_publication",
    title: "Read a publication",
    description: INSTRUCTIONS,
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Publication slug from the link a person opens.",
        },
        token: {
          type: "string",
          description: "Access token when the publication requires one.",
        },
      },
      required: ["slug"],
      additionalProperties: false,
    },
  };
}

function resolveProtocol(
  header: string | undefined,
  message: JsonObject,
):
  | { ok: true; modern: boolean; version: string }
  | { ok: false; outcome: McpOutcome } {
  const metaVersion = metaProtocol(message);
  if (header && metaVersion && header !== metaVersion) {
    return {
      ok: false,
      outcome: rpcError(
        idOf(message),
        -32020,
        "Header mismatch: MCP-Protocol-Version does not match the request.",
        400,
      ),
    };
  }
  const version = header || metaVersion;
  if (!version) return { ok: true, modern: false, version: "2025-03-26" };
  if (version === MODERN_PROTOCOL) {
    const params = objectOf(message.params);
    const meta = objectOf(params?._meta);
    if (!meta || !("io.modelcontextprotocol/clientCapabilities" in meta)) {
      return {
        ok: false,
        outcome: rpcError(
          idOf(message),
          -32602,
          "Client capabilities are required.",
          400,
        ),
      };
    }
    return { ok: true, modern: true, version };
  }
  if (LEGACY_PROTOCOLS.includes(version)) {
    return { ok: true, modern: false, version };
  }
  return {
    ok: false,
    outcome: rpcError(
      idOf(message),
      -32022,
      "Unsupported protocol version.",
      400,
      { supported: SUPPORTED_PROTOCOLS, requested: version },
    ),
  };
}

function validateModernHeaders(
  message: JsonObject,
  headers: McpHeaders,
): McpOutcome | null {
  if (!headers.method) {
    return rpcError(idOf(message), -32020, "Mcp-Method header is required.", 400);
  }
  if (decodeHeader(headers.method) !== message.method) {
    return rpcError(
      idOf(message),
      -32020,
      "Header mismatch: Mcp-Method does not match the request.",
      400,
    );
  }
  if (message.method !== "tools/call") return null;
  const name = objectOf(message.params)?.name;
  if (typeof name !== "string" || !headers.toolName) {
    return rpcError(idOf(message), -32020, "Mcp-Name header is required.", 400);
  }
  if (decodeHeader(headers.toolName) !== name) {
    return rpcError(
      idOf(message),
      -32020,
      "Header mismatch: Mcp-Name does not match the request.",
      400,
    );
  }
  return null;
}

function metaProtocol(message: JsonObject): string | undefined {
  const meta = objectOf(objectOf(message.params)?._meta);
  const version = meta?.["io.modelcontextprotocol/protocolVersion"];
  return typeof version === "string" ? version : undefined;
}

function decodeHeader(value: string): string {
  const match = value.match(/^=\?base64\?([A-Za-z0-9+/=]+)\?=$/);
  if (!match?.[1]) return value;
  return Buffer.from(match[1], "base64").toString("utf8");
}

function forProtocol(
  modern: boolean,
  legacy: JsonObject,
  modernOnly: JsonObject = {},
): JsonObject {
  if (!modern) return legacy;
  return {
    resultType: "complete",
    ...legacy,
    ...modernOnly,
    _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO },
  };
}

function toolError(message: JsonObject, modern: boolean, text: string): McpOutcome {
  return ok(message, forProtocol(modern, {
    content: [{ type: "text", text }],
    isError: true,
  }));
}

function ok(message: JsonObject, result: JsonObject): McpOutcome {
  return {
    status: 200,
    body: { jsonrpc: "2.0", id: idOf(message), result },
    servedPublicationSlug: null,
  };
}

function rpcError(
  id: unknown,
  code: number,
  message: string,
  status: McpOutcome["status"],
  data?: JsonObject,
): McpOutcome {
  return {
    status,
    servedPublicationSlug: null,
    body: {
      jsonrpc: "2.0",
      ...(id !== undefined ? { id } : {}),
      error: { code, message, ...(data ? { data } : {}) },
    },
  };
}

function idOf(message: JsonObject): unknown {
  return "id" in message ? message.id : undefined;
}

function objectOf(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}
