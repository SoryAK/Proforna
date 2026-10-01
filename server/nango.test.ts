import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";
import { readIntegrationSecrets } from "./integration-catalog";

describe("sign-in helper", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NANGO_SECRET_KEY;
    delete process.env.NANGO_HOST;
    delete process.env.NANGO_CONNECT_URL;
  });

  it("opens a sign-in link, records the connection, and removes it", async () => {
    process.env.NANGO_SECRET_KEY = "test-secret-key";
    process.env.NANGO_HOST = "http://127.0.0.1:3003";
    process.env.NANGO_CONNECT_URL = "http://127.0.0.1:3009";
    let githubReady = false;
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-secret-key");
      if (url.endsWith("/integrations")) {
        return Response.json({
          configs: [
            { unique_key: "github", provider: "github" },
            { unique_key: "google-mail", provider: "google-mail" },
          ],
        });
      }
      if (url.endsWith("/connect/sessions")) {
        const body = JSON.parse(String(init?.body ?? "")) as {
          tags: { end_user_id: string };
          allowed_integrations: string[];
        };
        expect(body.tags.end_user_id).toBe("local");
        return Response.json({
          data: {
            token: "sess",
            connect_link: `https://connect.example/link?session_token=sess&integration=${body.allowed_integrations[0]}`,
            expires_at: "2026-09-30T00:00:00.000Z",
          },
        });
      }
      if (url.includes("/connections?")) {
        return Response.json({
          connections: githubReady
            ? [
                {
                  connection_id: "conn-github",
                  provider_config_key: "github",
                  created: "2026-09-30T00:00:00.000Z",
                  tags: { end_user_id: "local" },
                },
              ]
            : [],
        });
      }
      if (url.includes("/connections/conn-github")) {
        expect(init?.method).toBe("DELETE");
        return Response.json({ success: true });
      }
      return new Response("no", { status: 404 });
    });

    const db = openDatabase(":memory:");
    const app = createApp(db);
    const listed = await app.request("/api/integration-catalog");
    const catalog = (await listed.json()) as {
      integrations: Array<{ name: string; signIn: boolean; configured: boolean }>;
    };
    expect(catalog.integrations.find((item) => item.name === "github")).toMatchObject({
      signIn: true,
      configured: false,
    });
    expect(catalog.integrations.find((item) => item.name === "gmail")?.signIn).toBe(true);
    expect(catalog.integrations.map((item) => item.name).sort()).toEqual(["github", "gmail"]);
    expect(JSON.stringify(catalog)).not.toContain("test-secret-key");

    const started = await app.request("/api/sign-in/github", { method: "POST" });
    expect(started.status).toBe(200);
    expect(await started.json()).toEqual({
      connectLink:
        "http://127.0.0.1:3009/link?session_token=sess&integration=github&apiURL=http%3A%2F%2F127.0.0.1%3A3003",
    });

    const waiting = await app.request("/api/sign-in/github/ready", { method: "POST" });
    expect(await waiting.json()).toEqual({ connected: false });
    githubReady = true;
    const ready = await app.request("/api/sign-in/github/ready", { method: "POST" });
    expect(await ready.json()).toEqual({ connected: true });
    const occupant = db.prepare("SELECT id FROM occupants").get() as { id: string };
    expect(readIntegrationSecrets(db, occupant.id, "github")).toEqual({});

    const removed = await app.request("/api/integration-catalog/github", { method: "DELETE" });
    expect(await removed.json()).toEqual({ configured: false });
    expect(calls.some((call) => call.startsWith("DELETE ") && call.includes("/connections/conn-github"))).toBe(
      true,
    );
    expect(calls.join("\n")).not.toContain("test-secret-key");
  });

  it("reads Gmail through the helper after sign-in", async () => {
    process.env.NANGO_SECRET_KEY = "test-secret-key";
    process.env.NANGO_HOST = "http://127.0.0.1:3003";
    process.env.NANGO_CONNECT_URL = "http://127.0.0.1:3009";
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/integrations")) {
        return Response.json({
          configs: [{ unique_key: "google-mail", provider: "google-mail" }],
        });
      }
      if (url.endsWith("/connect/sessions")) {
        return Response.json({
          data: {
            token: "sess",
            connect_link: "http://127.0.0.1:3009/?session_token=sess",
            expires_at: "2026-09-30T00:00:00.000Z",
          },
        });
      }
      if (url.includes("/connections?")) {
        return Response.json({
          connections: [
            {
              connection_id: "conn-gmail",
              provider_config_key: "google-mail",
              created: "2026-09-30T00:00:00.000Z",
              tags: { end_user_id: "local" },
            },
          ],
        });
      }
      if (url.endsWith("/proxy/gmail/v1/users/me/profile")) {
        const headers = new Headers(init?.headers);
        expect(headers.get("provider-config-key")).toBe("google-mail");
        expect(headers.get("connection-id")).toBe("conn-gmail");
        return Response.json({ emailAddress: "ada@example.com" });
      }
      if (url.includes("/proxy/gmail/v1/users/me/threads")) {
        return Response.json({ threads: [{ id: "t1", snippet: "Offer letter" }] });
      }
      if (url.includes("oauth2.googleapis.com")) return new Response("token", { status: 500 });
      return new Response("no", { status: 404 });
    });

    const app = createApp(openDatabase(":memory:"));
    const started = await app.request("/api/sign-in/gmail", { method: "POST" });
    expect(started.status).toBe(200);
    expect(await started.json()).toEqual({
      connectLink:
        "http://127.0.0.1:3009/?session_token=sess&apiURL=http%3A%2F%2F127.0.0.1%3A3003",
    });
    const ready = await app.request("/api/sign-in/gmail/ready", { method: "POST" });
    expect(await ready.json()).toEqual({ connected: true, email: "ada@example.com" });
    const account = await app.request("/api/gmail");
    expect(await account.json()).toEqual({
      connected: true,
      email: "ada@example.com",
      enabled: true,
    });
    const search = await app.request("/api/gmail/messages?q=offer");
    expect(await search.json()).toEqual({ threads: [{ id: "t1", snippet: "Offer letter" }] });
    const body = JSON.stringify(await (await app.request("/api/gmail")).json());
    expect(body).not.toContain("test-secret-key");
  });

  it("refuses a connection the helper does not have", async () => {
    process.env.NANGO_SECRET_KEY = "test-secret-key";
    process.env.NANGO_HOST = "http://127.0.0.1:3003";
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/integrations")) return Response.json({ configs: [] });
      return new Response("no", { status: 404 });
    });
    const app = createApp(openDatabase(":memory:"));
    const response = await app.request("/api/sign-in/linkedin", { method: "POST" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "sign-in-unavailable" });
  });
});
