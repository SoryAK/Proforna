export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
] as const;

export const GMAIL_REDIRECT_PORT = 42813;
export const GMAIL_REDIRECT_PATH = "/oauth2callback";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";

export type GmailThread = {
  id: string;
  snippet: string;
};

export type GmailMessage = {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  body: string;
};

export function gmailRedirectUri(port: number): string {
  return `http://127.0.0.1:${port}${GMAIL_REDIRECT_PATH}`;
}

export function gmailAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(AUTH);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", GMAIL_SCOPES.join(" "));
  url.searchParams.set("state", input.state);
  return url.toString();
}

export function readGmailToken(value: unknown): {
  accessToken: string;
  refreshToken: string;
} | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { access_token?: unknown; refresh_token?: unknown };
  const accessToken = text(row.access_token);
  const refreshToken = text(row.refresh_token);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export function readGmailAccessToken(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const accessToken = text((value as { access_token?: unknown }).access_token);
  return accessToken || null;
}

export function readGmailProfile(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const email = text((value as { emailAddress?: unknown }).emailAddress);
  return email || null;
}

export function readGmailThreads(value: unknown): GmailThread[] {
  if (!value || typeof value !== "object") return [];
  const threads = (value as { threads?: unknown }).threads;
  if (!Array.isArray(threads)) return [];
  return threads.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { id?: unknown; snippet?: unknown };
    const id = text(row.id);
    if (!id) return [];
    return [{ id, snippet: text(row.snippet) }];
  });
}

export function readGmailMessage(value: unknown): GmailMessage | null {
  if (!value || typeof value !== "object") return null;
  const row = value as {
    id?: unknown;
    snippet?: unknown;
    payload?: unknown;
  };
  const id = text(row.id);
  if (!id) return null;
  const headers = messageHeaders(row.payload);
  return {
    id,
    from: header(headers, "from"),
    subject: header(headers, "subject"),
    snippet: text(row.snippet),
    body: plainBody(row.payload),
  };
}

export function gmailRawMessage(input: { to: string; subject: string; body: string }): string {
  const message = [
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    input.body,
  ].join("\r\n");
  const bytes = new TextEncoder().encode(message);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function messageHeaders(payload: unknown): Array<{ name: string; value: string }> {
  if (!payload || typeof payload !== "object") return [];
  const headers = (payload as { headers?: unknown }).headers;
  if (!Array.isArray(headers)) return [];
  return headers.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { name?: unknown; value?: unknown };
    const name = text(row.name);
    if (!name) return [];
    return [{ name, value: text(row.value) }];
  });
}

function header(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find((item) => item.name.toLowerCase() === name)?.value ?? "";
}

function plainBody(payload: unknown): string {
  const part = findPlain(payload);
  if (!part) return "";
  const data = text((part as { body?: { data?: unknown } }).body?.data);
  if (!data) return "";
  const normalized = data.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes).trim();
}

function findPlain(payload: unknown): { body?: { data?: unknown } } | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as { mimeType?: unknown; body?: { data?: unknown }; parts?: unknown };
  if (text(row.mimeType) === "text/plain" && text(row.body?.data)) return row;
  if (!Array.isArray(row.parts)) return null;
  for (const part of row.parts) {
    const found = findPlain(part);
    if (found) return found;
  }
  return null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
