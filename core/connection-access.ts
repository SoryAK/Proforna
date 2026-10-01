export type ConnectedAccount = {
  name: string;
  displayName: string;
  description: string;
};

export type ConnectionTool = {
  name: string;
  description: string;
  required: string[];
};

const DEDICATED = new Set(["gmail", "github"]);

const STOP = new Set([
  "search",
  "manage",
  "create",
  "update",
  "delete",
  "account",
  "accounts",
  "access",
  "people",
  "things",
  "about",
  "their",
  "using",
  "draft",
  "saved",
  "which",
  "would",
  "could",
  "should",
  "please",
  "message",
  "messages",
]);

const WRITE = /\b(?:create|update|delete|send|post|write|merge|close|add|remove|destroy|invite|publish|submit|archive|cancel|edit|set|put|patch)\b/i;

export function dedicatedConnection(name: string): boolean {
  return DEDICATED.has(name);
}

export function mentionsConnection(prompt: string, account: ConnectedAccount): boolean {
  const labels = [account.name, account.displayName]
    .map((value) => value.trim())
    .filter((value) => value.length >= 3);
  if (labels.some((label) => word(prompt, label))) return true;
  const described = account.description.toLowerCase().match(/[a-z][a-z0-9]{5,}/g) ?? [];
  return described.some((item) => !STOP.has(item) && word(prompt, item));
}

export function isReadTool(tool: Pick<ConnectionTool, "name" | "description">): boolean {
  return !WRITE.test(`${tool.name} ${tool.description}`);
}

export function pickReadTool(prompt: string, tools: readonly ConnectionTool[]): ConnectionTool | null {
  const ready = tools.filter((tool) => isReadTool(tool) && tool.required.length === 0);
  const named = ready.filter((tool) =>
    words(`${tool.name} ${tool.description}`).some((word) => words(prompt).includes(word)),
  );
  if (named.length === 1) return named[0];
  if (ready.length === 1) return ready[0];
  return null;
}

export function connectedAccountsLine(accounts: readonly ConnectedAccount[]): string {
  if (accounts.length === 0) return "";
  return `Connected accounts:\n${accounts
    .map((account) => `- ${account.displayName}. ${account.description}`)
    .join("\n")}`;
}

export function connectionToolLine(displayName: string, tool: string, result: string): string {
  const body = result.trim().slice(0, 2000);
  return body ? `${displayName} ${tool}:\n${body}` : `${displayName}: connected, but it could not be read.`;
}

export function connectionToolsLine(displayName: string, tools: readonly ConnectionTool[]): string {
  const reads = tools.filter((tool) => isReadTool(tool)).map((tool) => tool.name);
  if (reads.length === 0) return connectionUnreadLine(displayName);
  return `${displayName} can read: ${reads.join(", ")}.`;
}

export function connectionUnreadLine(displayName: string): string {
  return `${displayName}: connected, but it could not be read.`;
}

export function presentMcpTools(payload: unknown): ConnectionTool[] {
  const result = objectOf(objectOf(payload)?.result) ?? objectOf(payload);
  const tools = result?.tools;
  if (!Array.isArray(tools)) return [];
  return tools.flatMap((item) => {
    const row = objectOf(item);
    const name = text(row?.name);
    if (!name) return [];
    const schema = objectOf(row?.inputSchema);
    const required = Array.isArray(schema?.required)
      ? schema.required.filter((entry): entry is string => typeof entry === "string")
      : [];
    return [{ name, description: text(row?.description), required }];
  });
}

export function presentMcpText(payload: unknown): string {
  const result = objectOf(objectOf(payload)?.result) ?? objectOf(payload);
  const content = result?.content;
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((item) => {
      const row = objectOf(item);
      return text(row?.text) ? [text(row?.text)] : [];
    })
    .join("\n")
    .trim();
}

export function presentMcpPayloads(body: string, contentType: string): unknown[] {
  if (contentType.toLowerCase().includes("text/event-stream")) {
    return body
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .flatMap((line) => {
        const parsed = parseJson(line.slice(5).trim());
        return parsed === undefined ? [] : [parsed];
      });
  }
  const parsed = parseJson(body);
  return parsed === undefined ? [] : [parsed];
}

function word(prompt: string, value: string): boolean {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(prompt);
}

function words(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function objectOf(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
