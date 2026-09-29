import {
  JOB_MAIL_SEARCH,
  parseMailFrom,
  type InboundMail,
} from "../core/index";

const READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export type GmailTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scope: string;
};

type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string };
  parts?: GmailPart[];
  headers?: Array<{ name?: string; value?: string }>;
};

type GmailMessage = {
  id?: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
};

export function gmailOAuthConfigured(): boolean {
  return Boolean(gmailClientId() && gmailClientSecret());
}

export function gmailClientId(): string {
  return process.env.GMAIL_OAUTH_CLIENT_ID?.trim() ?? "";
}

export function gmailClientSecret(): string {
  return process.env.GMAIL_OAUTH_CLIENT_SECRET?.trim() ?? "";
}

export function gmailRedirectUri(): string {
  return (
    process.env.GMAIL_OAUTH_REDIRECT_URI?.trim() ||
    "http://localhost:3000/api/mailbox/gmail/callback"
  );
}

export function profornaAppOrigin(): string {
  const value = process.env.PROFORNA_APP_ORIGIN?.trim() || "http://localhost:5173";
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "http://localhost:5173";
    }
    return url.origin;
  } catch {
    return "http://localhost:5173";
  }
}

export function gmailAuthorizationUrl(state: string): string {
  const endpoint = gmailEndpoints();
  const url = new URL(endpoint.auth);
  url.searchParams.set("client_id", gmailClientId());
  url.searchParams.set("redirect_uri", gmailRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", READONLY_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGmailCode(code: string): Promise<GmailTokens> {
  return requestTokens({
    code,
    client_id: gmailClientId(),
    client_secret: gmailClientSecret(),
    redirect_uri: gmailRedirectUri(),
    grant_type: "authorization_code",
  });
}

export async function refreshGmailTokens(
  refreshToken: string,
): Promise<GmailTokens> {
  const tokens = await requestTokens({
    refresh_token: refreshToken,
    client_id: gmailClientId(),
    client_secret: gmailClientSecret(),
    grant_type: "refresh_token",
  });
  return {
    ...tokens,
    refreshToken: tokens.refreshToken || refreshToken,
  };
}

export async function gmailAccountEmail(accessToken: string): Promise<string> {
  const payload = await gmailJson(accessToken, "/gmail/v1/users/me/profile");
  const email = payload.emailAddress;
  if (typeof email !== "string" || !email.includes("@")) {
    throw new GmailClientError("profile-missing");
  }
  return email.trim();
}

export async function listJobMail(accessToken: string): Promise<InboundMail[]> {
  const query = new URLSearchParams({
    maxResults: "25",
    q: JOB_MAIL_SEARCH,
  });
  const listed = await gmailJson(
    accessToken,
    `/gmail/v1/users/me/messages?${query}`,
  );
  const ids = Array.isArray(listed.messages)
    ? listed.messages
        .map((message) =>
          message && typeof message === "object" && "id" in message
            ? String((message as { id?: unknown }).id ?? "")
            : "",
        )
        .filter(Boolean)
    : [];
  const messages: InboundMail[] = [];
  for (const id of ids) {
    const payload = await gmailJson(
      accessToken,
      `/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`,
    );
    const parsed = parseGmailMessage(payload);
    if (parsed) messages.push(parsed);
  }
  return messages;
}

export function parseGmailMessage(value: unknown): InboundMail | null {
  if (!value || typeof value !== "object") return null;
  const message = value as GmailMessage;
  const id = typeof message.id === "string" ? message.id.trim() : "";
  if (!id) return null;
  const headers = message.payload?.headers ?? [];
  const from = parseMailFrom(header(headers, "From"));
  const subject = header(headers, "Subject");
  const plain = collectText(message.payload, "text/plain").join("\n").trim();
  const html = collectText(message.payload, "text/html").join("\n");
  const snippet = typeof message.snippet === "string" ? message.snippet.trim() : "";
  const body = plain || stripHtml(html) || snippet;
  return {
    providerMessageId: id,
    fromName: from.name,
    fromEmail: from.email,
    subject,
    body,
    receivedAt: receivedAt(message.internalDate, header(headers, "Date")),
  };
}

async function requestTokens(
  fields: Record<string, string>,
): Promise<GmailTokens> {
  const response = await fetch(gmailEndpoints().token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
  if (!response.ok) throw new GmailClientError("token-rejected");
  const payload = (await response.json()) as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
    scope?: unknown;
  };
  const accessToken =
    typeof payload.access_token === "string" ? payload.access_token : "";
  if (!accessToken) throw new GmailClientError("token-rejected");
  const expiresIn =
    typeof payload.expires_in === "number" && payload.expires_in > 0
      ? payload.expires_in
      : 3600;
  return {
    accessToken,
    refreshToken:
      typeof payload.refresh_token === "string" ? payload.refresh_token : "",
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    scope: typeof payload.scope === "string" ? payload.scope : READONLY_SCOPE,
  };
}

async function gmailJson(
  accessToken: string,
  path: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${gmailEndpoints().api}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 401 || response.status === 403) {
    throw new GmailClientError("access-refused");
  }
  if (!response.ok) throw new GmailClientError("gmail-unavailable");
  const payload = (await response.json()) as unknown;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new GmailClientError("gmail-unavailable");
  }
  return payload as Record<string, unknown>;
}

function gmailEndpoints(): { auth: string; token: string; api: string } {
  return {
    auth:
      process.env.GMAIL_OAUTH_AUTH_URL?.trim() ||
      "https://accounts.google.com/o/oauth2/v2/auth",
    token:
      process.env.GMAIL_OAUTH_TOKEN_URL?.trim() ||
      "https://oauth2.googleapis.com/token",
    api: (
      process.env.GMAIL_API_BASE?.trim() || "https://gmail.googleapis.com"
    ).replace(/\/$/, ""),
  };
}

function header(
  headers: Array<{ name?: string; value?: string }>,
  name: string,
): string {
  const found = headers.find(
    (item) => item.name?.toLowerCase() === name.toLowerCase(),
  );
  return typeof found?.value === "string" ? found.value : "";
}

function collectText(
  part: GmailPart | undefined,
  mimeType: "text/plain" | "text/html",
): string[] {
  if (!part) return [];
  const found: string[] = [];
  if (part.mimeType === mimeType && part.body?.data && !part.filename) {
    found.push(decodeBase64Url(part.body.data));
  }
  for (const child of part.parts ?? []) {
    found.push(...collectText(child, mimeType));
  }
  return found;
}

function decodeBase64Url(value: string): string {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString(
    "utf8",
  );
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function receivedAt(internalDate: string | undefined, dateHeader: string): string {
  const ms = Number(internalDate);
  if (Number.isFinite(ms) && ms > 0) return new Date(ms).toISOString();
  const parsed = Date.parse(dateHeader);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  return new Date().toISOString();
}

export class GmailClientError extends Error {
  constructor(readonly code: "token-rejected" | "access-refused" | "gmail-unavailable" | "profile-missing") {
    super(code);
  }
}
