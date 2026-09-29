import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";
import { closeGmailSignIn } from "./gmail";

describe("gmail connection", () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    delete process.env.GMAIL_OAUTH_PORT;
    delete process.env.GMAIL_OAUTH_CLIENT_ID;
    delete process.env.GMAIL_OAUTH_CLIENT_SECRET;
    await closeGmailSignIn();
  });

  it("connects from the server oauth client, answers an ask, and disconnects without filing mail", async () => {
    process.env.GMAIL_OAUTH_PORT = "0";
    process.env.GMAIL_OAUTH_CLIENT_ID = "client";
    process.env.GMAIL_OAUTH_CLIENT_SECRET = "secret";
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) {
        const body = String(init?.body ?? "");
        if (body.includes("authorization_code")) {
          return Response.json({ access_token: "access", refresh_token: "refresh" });
        }
        return Response.json({ access_token: "access" });
      }
      if (url.endsWith("/profile")) return Response.json({ emailAddress: "ada@example.com" });
      if (url.includes("/threads")) {
        expect(url).toContain("Northstar");
        expect(url).not.toContain("newer_than");
        expect(url).not.toContain("in%3Ainbox");
        expect(url).not.toContain("in:inbox");
        return Response.json({ threads: [{ id: "t1", snippet: "Offer letter" }] });
      }
      if (url.endsWith("/drafts")) return Response.json({ id: "draft-1" });
      return new Response("no", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchImpl);
    const db = openDatabase(":memory:");
    const app = createApp(db);
    const started = await app.request("/api/gmail/connect", { method: "POST" });
    expect(started.status).toBe(200);
    const signIn = (await started.json()) as { authorizeUrl: string };
    const authorize = new URL(signIn.authorizeUrl);
    expect(authorize.searchParams.get("client_id")).toBe("client");
    expect(signIn.authorizeUrl).not.toContain("secret");
    const redirect = new URL(authorize.searchParams.get("redirect_uri") ?? "");
    const callback = await httpGet(
      `${redirect.origin}${redirect.pathname}?code=code&state=${authorize.searchParams.get("state")}`,
    );
    expect(callback).toContain("Gmail is connected");
    const account = await app.request("/api/gmail");
    expect(await account.json()).toMatchObject({
      connected: true,
      email: "ada@example.com",
      oauthClient: true,
      missing: [],
    });
    const ask = await app.request("/api/gmail/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "Northstar offer" }),
    });
    expect(ask.status).toBe(200);
    const asked = (await ask.json()) as { answer: string; threads: Array<{ id: string }> };
    expect(asked.threads).toEqual([{ id: "t1", snippet: "Offer letter" }]);
    expect(asked.answer).toContain("Offer letter");
    expect(asked.answer).toContain("Nothing was added");
    expect(careerCounts(db)).toEqual({
      opportunities: 0,
      applications: 0,
      interviews: 0,
      offers: 0,
      contacts: 0,
    });
    const windowAsk = await app.request("/api/gmail/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "in:inbox" }),
    });
    expect((await windowAsk.json()) as { threads: unknown[] }).toMatchObject({ threads: [] });
    const opened = await app.request("/api/command/sessions", { method: "POST" });
    const session = (await opened.json()) as { session: { id: string } };
    const turn = await app.request(`/api/command/sessions/${session.session.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "Search my Gmail for the Northstar offer" }),
    });
    expect(turn.status).toBe(201);
    const thread = (await turn.json()) as { messages: Array<{ speaker: string; body: string }> };
    expect(thread.messages[1]?.body).toContain("Offer letter");
    expect(careerCounts(db).opportunities).toBe(0);
    const removed = await app.request("/api/gmail", { method: "DELETE" });
    expect(await removed.json()).toMatchObject({ connected: false, email: null });
    db.close();
  });

  it("names the missing oauth client and does not search or file mail", async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);
    const db = openDatabase(":memory:");
    const app = createApp(db);
    const account = await app.request("/api/gmail");
    expect(await account.json()).toMatchObject({
      connected: false,
      oauthClient: false,
      missing: ["GMAIL_OAUTH_CLIENT_ID", "GMAIL_OAUTH_CLIENT_SECRET"],
    });
    const response = await app.request("/api/gmail/connect", { method: "POST" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "oauth-client-missing",
      missing: ["GMAIL_OAUTH_CLIENT_ID", "GMAIL_OAUTH_CLIENT_SECRET"],
    });
    const ask = await app.request("/api/gmail/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "Northstar offer" }),
    });
    const asked = (await ask.json()) as { answer: string; threads: unknown[] };
    expect(asked.threads).toEqual([]);
    expect(asked.answer).toContain("GMAIL_OAUTH_CLIENT_ID");
    expect(asked.answer).toContain("GMAIL_OAUTH_CLIENT_SECRET");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(careerCounts(db)).toEqual({
      opportunities: 0,
      applications: 0,
      interviews: 0,
      offers: 0,
      contacts: 0,
    });
    db.close();
  });
});

function careerCounts(db: ReturnType<typeof openDatabase>) {
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  return {
    opportunities: count("opportunities"),
    applications: count("applications"),
    interviews: count("interviews"),
    offers: count("offers"),
    contacts: count("contacts"),
  };
}

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      })
      .on("error", reject);
  });
}
