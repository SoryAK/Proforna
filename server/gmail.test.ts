import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";
import { closeGmailSignIn } from "./gmail";

describe("gmail connection", () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    delete process.env.GMAIL_OAUTH_PORT;
    await closeGmailSignIn();
  });

  it("signs in, searches mail, saves a draft, and disconnects without returning secrets", async () => {
    process.env.GMAIL_OAUTH_PORT = "0";
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
        return Response.json({ threads: [{ id: "t1", snippet: "Offer letter" }] });
      }
      if (url.endsWith("/drafts")) return Response.json({ id: "draft-1" });
      return new Response("no", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchImpl);
    const app = createApp(openDatabase(":memory:"));
    const started = await app.request("/api/gmail/connect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "client", clientSecret: "secret" }),
    });
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
    expect(await account.json()).toEqual({ connected: true, email: "ada@example.com" });
    const search = await app.request("/api/gmail/messages?q=offer");
    expect(await search.json()).toEqual({ threads: [{ id: "t1", snippet: "Offer letter" }] });
    const draft = await app.request("/api/gmail/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: "ada@example.com", subject: "Hello", body: "Thanks" }),
    });
    expect(draft.status).toBe(201);
    const removed = await app.request("/api/gmail", { method: "DELETE" });
    expect(await removed.json()).toEqual({ connected: false });
  });

  it("asks for a client id and a client secret", async () => {
    const app = createApp(openDatabase(":memory:"));
    const response = await app.request("/api/gmail/connect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "client" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "client-required" });
  });
});

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
