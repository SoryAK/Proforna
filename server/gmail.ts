import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  gmailAuthorizeUrl,
  gmailRawMessage,
  gmailRedirectUri,
  readGmailAccessToken,
  readGmailMessage,
  readGmailProfile,
  readGmailThreads,
  readGmailToken,
  type GmailMessage,
  type GmailThread,
} from "../core/gmail";
import { prepareConnectionEnabled } from "../core/plugins";
import { openSecret, sealSecret } from "./vault-seal";
import { vaultKey } from "./vault-key";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

type PendingSignIn = {
  occupantId: string;
  clientId: string;
  clientSecret: string;
};

type StoredGmail = {
  email: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  enabled: boolean;
};

export class GmailStoreError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const pending = new Map<string, PendingSignIn>();
let signInServer: ReturnType<typeof createServer> | null = null;
let signInPort = 0;

export function readGmailAccount(
  db: DatabaseSync,
  occupantId: string,
): { connected: true; email: string; enabled: boolean } | { connected: false } {
  const row = stored(db, occupantId);
  if (!row) return { connected: false };
  return { connected: true, email: row.email, enabled: row.enabled };
}

export function setGmailEnabled(
  db: DatabaseSync,
  occupantId: string,
  input: unknown,
): boolean {
  const prepared = prepareConnectionEnabled(input);
  if (!prepared.ok) throw new GmailStoreError(prepared.error);
  if (!stored(db, occupantId)) throw new GmailStoreError("gmail-not-connected");
  db.prepare(
    "UPDATE gmail_accounts SET enabled = ?, updated_at = ? WHERE occupant_id = ?",
  ).run(prepared.enabled ? 1 : 0, new Date().toISOString(), occupantId);
  return prepared.enabled;
}

export function disconnectGmail(db: DatabaseSync, occupantId: string): void {
  db.prepare("DELETE FROM gmail_accounts WHERE occupant_id = ?").run(occupantId);
}

export async function beginGmailSignIn(
  db: DatabaseSync,
  occupantId: string,
  input: { clientId?: unknown; clientSecret?: unknown },
  fetchImpl: typeof fetch = fetch,
): Promise<{ authorizeUrl: string }> {
  const clientId = text(input.clientId);
  const clientSecret = text(input.clientSecret);
  if (!clientId || !clientSecret) throw new GmailStoreError("client-required");
  const port = await listenForGmail(db, fetchImpl);
  const state = randomBytes(16).toString("hex");
  pending.set(state, { occupantId, clientId, clientSecret });
  return {
    authorizeUrl: gmailAuthorizeUrl({
      clientId,
      redirectUri: gmailRedirectUri(port),
      state,
    }),
  };
}

export async function searchGmail(
  db: DatabaseSync,
  occupantId: string,
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GmailThread[]> {
  const accessToken = await accessTokenFor(db, occupantId, fetchImpl);
  const url = new URL(`${GMAIL_API}/threads`);
  url.searchParams.set("maxResults", "10");
  url.searchParams.set("q", query.trim() || "in:inbox");
  const response = await fetchImpl(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new GmailStoreError("gmail-unread");
  return readGmailThreads(await response.json());
}

export async function readGmail(
  db: DatabaseSync,
  occupantId: string,
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GmailMessage> {
  const accessToken = await accessTokenFor(db, occupantId, fetchImpl);
  const response = await fetchImpl(`${GMAIL_API}/messages/${encodeURIComponent(id)}?format=full`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new GmailStoreError("gmail-unread");
  const message = readGmailMessage(await response.json());
  if (!message) throw new GmailStoreError("gmail-unread");
  return message;
}

export async function draftGmail(
  db: DatabaseSync,
  occupantId: string,
  input: { to?: unknown; subject?: unknown; body?: unknown },
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string }> {
  const to = text(input.to);
  const subject = text(input.subject);
  const body = text(input.body);
  if (!to || !subject || !body) throw new GmailStoreError("draft-required");
  const accessToken = await accessTokenFor(db, occupantId, fetchImpl);
  const response = await fetchImpl(`${GMAIL_API}/drafts`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ message: { raw: gmailRawMessage({ to, subject, body }) } }),
  });
  if (!response.ok) throw new GmailStoreError("gmail-unread");
  const saved = (await response.json()) as { id?: unknown };
  const id = text(saved.id);
  if (!id) throw new GmailStoreError("gmail-unread");
  return { id };
}

export async function closeGmailSignIn(): Promise<void> {
  pending.clear();
  const server = signInServer;
  signInServer = null;
  signInPort = 0;
  if (!server) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function listenForGmail(db: DatabaseSync, fetchImpl: typeof fetch): Promise<number> {
  if (signInServer && signInPort) return signInPort;
  const requested = oauthPort();
  const server = createServer((request, response) => {
    void handleGmailCallback(db, fetchImpl, request, response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(requested, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  signInPort = typeof address === "object" && address ? address.port : requested;
  signInServer = server;
  return signInPort;
}

async function handleGmailCallback(
  db: DatabaseSync,
  fetchImpl: typeof fetch,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (url.pathname !== "/oauth2callback") {
    response.writeHead(404);
    response.end();
    return;
  }
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const signIn = pending.get(state);
  pending.delete(state);
  if (!signIn || !code) {
    writePage(response, 400, "Gmail could not be connected.");
    return;
  }
  try {
    await finishGmailSignIn(db, signIn, code, gmailRedirectUri(signInPort), fetchImpl);
    writePage(response, 200, "Gmail is connected. Return to Proforna.");
  } catch {
    writePage(response, 400, "Gmail could not be connected.");
  }
}

async function finishGmailSignIn(
  db: DatabaseSync,
  signIn: PendingSignIn,
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  const token = readGmailToken(
    await tokenRequest(
      fetchImpl,
      new URLSearchParams({
        code,
        client_id: signIn.clientId,
        client_secret: signIn.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    ),
  );
  if (!token) throw new GmailStoreError("gmail-connect-failed");
  const profile = await fetchImpl(`${GMAIL_API}/profile`, {
    headers: { authorization: `Bearer ${token.accessToken}` },
  });
  if (!profile.ok) throw new GmailStoreError("gmail-connect-failed");
  const email = readGmailProfile(await profile.json());
  if (!email) throw new GmailStoreError("gmail-connect-failed");
  const key = vaultKey(true);
  db.prepare(
    `INSERT INTO gmail_accounts
      (occupant_id, email, client_id, client_secret, refresh_token, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(occupant_id) DO UPDATE SET
       email = excluded.email,
       client_id = excluded.client_id,
       client_secret = excluded.client_secret,
       refresh_token = excluded.refresh_token,
       enabled = 1,
       updated_at = excluded.updated_at`,
  ).run(
    signIn.occupantId,
    email,
    signIn.clientId,
    sealSecret(signIn.clientSecret, key),
    sealSecret(token.refreshToken, key),
    new Date().toISOString(),
  );
}

async function accessTokenFor(
  db: DatabaseSync,
  occupantId: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const row = stored(db, occupantId);
  if (!row) throw new GmailStoreError("gmail-not-connected");
  if (!row.enabled) throw new GmailStoreError("gmail-off");
  const key = vaultKey(true);
  const accessToken = readGmailAccessToken(
    await tokenRequest(
      fetchImpl,
      new URLSearchParams({
        client_id: row.clientId,
        client_secret: openSecret(row.clientSecret, key),
        refresh_token: openSecret(row.refreshToken, key),
        grant_type: "refresh_token",
      }),
    ),
  );
  if (!accessToken) throw new GmailStoreError("gmail-unread");
  return accessToken;
}

function stored(db: DatabaseSync, occupantId: string): StoredGmail | null {
  const row = db
    .prepare(
      `SELECT email, client_id, client_secret, refresh_token, enabled
       FROM gmail_accounts WHERE occupant_id = ?`,
    )
    .get(occupantId) as
    | {
        email: string;
        client_id: string;
        client_secret: string;
        refresh_token: string;
        enabled: number;
      }
    | undefined;
  if (!row) return null;
  return {
    email: row.email,
    clientId: row.client_id,
    clientSecret: row.client_secret,
    refreshToken: row.refresh_token,
    enabled: row.enabled === 1,
  };
}

async function tokenRequest(fetchImpl: typeof fetch, body: URLSearchParams): Promise<unknown> {
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) return null;
  return response.json();
}

function oauthPort(): number {
  const port = Number(process.env.GMAIL_OAUTH_PORT);
  if (Number.isInteger(port) && port >= 0 && port < 65536) return port;
  return 42813;
}

function writePage(response: ServerResponse, status: number, message: string): void {
  const safe = message.replace(/[&<>]/g, (char) =>
    char === "&" ? "&amp;" : char === "<" ? "&lt;" : "&gt;",
  );
  response.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  response.end(
    `<!doctype html><html><head><meta charset="utf-8"><title>Gmail</title></head><body><p>${safe}</p><script>window.close()</script></body></html>`,
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}


