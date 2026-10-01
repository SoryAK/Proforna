import {
  presentMcpPayloads,
  presentMcpText,
  presentMcpTools,
  type ConnectionTool,
} from "../core/connection-access";

const PROTOCOL = "2024-11-05";

export async function readConnectedTool(
  endpoint: string,
  token: string,
  pick: (tools: ConnectionTool[]) => ConnectionTool | null,
  fetchImpl: typeof fetch = fetch,
): Promise<{ tools: ConnectionTool[]; tool: string; text: string } | { tools: ConnectionTool[]; tool: null; text: "" }> {
  const session = await openMcp(endpoint, token, fetchImpl);
  const tools = presentMcpTools(await mcpRequest(session, "tools/list", {}, fetchImpl));
  const tool = pick(tools);
  if (!tool) return { tools, tool: null, text: "" };
  const text = presentMcpText(
    await mcpRequest(session, "tools/call", { name: tool.name, arguments: {} }, fetchImpl),
  );
  return { tools, tool: tool.name, text };
}

type McpSession = {
  endpoint: string;
  token: string;
  sessionId: string;
  nextId: number;
};

async function openMcp(
  endpoint: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<McpSession> {
  const session: McpSession = { endpoint, token, sessionId: "", nextId: 1 };
  await mcpRequest(
    session,
    "initialize",
    {
      protocolVersion: PROTOCOL,
      capabilities: {},
      clientInfo: { name: "proforna", version: "0.0.1" },
    },
    fetchImpl,
  );
  await mcpNotify(session, "notifications/initialized", fetchImpl);
  return session;
}

async function mcpRequest(
  session: McpSession,
  method: string,
  params: Record<string, unknown>,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const response = await post(session, { jsonrpc: "2.0", id: session.nextId, method, params }, fetchImpl);
  session.nextId += 1;
  const sessionId = response.headers.get("mcp-session-id");
  if (sessionId) session.sessionId = sessionId;
  if (!response.ok) throw new Error("mcp-unread");
  const payloads = presentMcpPayloads(await response.text(), response.headers.get("content-type") ?? "");
  return payloads.find((payload) => payload && typeof payload === "object" && "result" in payload) ?? null;
}

async function mcpNotify(
  session: McpSession,
  method: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  const response = await post(session, { jsonrpc: "2.0", method }, fetchImpl);
  if (!response.ok && response.status !== 202) throw new Error("mcp-unread");
}

async function post(
  session: McpSession,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch,
): Promise<Response> {
  return fetchImpl(session.endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.token}`,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      ...(session.sessionId ? { "mcp-session-id": session.sessionId } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
}
