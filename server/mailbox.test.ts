import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

function message(id: string, from: string, subject: string, body: string) {
  return {
    id,
    internalDate: "1772380800000",
    snippet: body,
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: from },
        { name: "Subject", value: subject },
      ],
      body: { data: Buffer.from(body).toString("base64url") },
    },
  };
}

const jobMessages = [
  message(
    "m-apply",
    "Alex Rivera <alex@northstar.example>",
    "Thank you for applying to Staff Engineer at Northstar",
    "We received your application. We will write if we want to interview.",
  ),
  message(
    "m-interview",
    "Lumen <talent@lumen.example>",
    "Interview invitation: Product Designer at Lumen",
    "Your interview is on March 4, 2026.",
  ),
  message(
    "m-offer",
    "City Light <jobs@citylight.example>",
    "We are pleased to offer you the Electrician role at City Light",
    "This follows your interview. Please respond by April 2, 2026.",
  ),
  message(
    "m-outreach",
    "Riley Chen <riley@northstar.example>",
    "Came across your profile — Staff Engineer at Northstar",
    "I am a recruiter and would like to talk.",
  ),
  message(
    "m-news",
    "Digest <news@letters.example>",
    "Your weekly digest",
    "Three articles.",
  ),
];

function mockGmail() {
  const calls: Array<{ url: string; authorization: string; body: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      const body =
        init?.body instanceof URLSearchParams
          ? init.body.toString()
          : typeof init?.body === "string"
            ? init.body
            : "";
      const authorization =
        init?.headers &&
        typeof init.headers === "object" &&
        !Array.isArray(init.headers) &&
        "authorization" in init.headers
          ? String(init.headers.authorization)
          : "";
      calls.push({ url: href, authorization, body });
      if (href.includes("oauth2.googleapis.com/token")) {
        if (body.includes("grant_type=refresh_token")) {
          return Response.json({
            access_token: "access-2",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/gmail.readonly",
          });
        }
        return Response.json({
          access_token: "access-1",
          refresh_token: "refresh-secret",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/gmail.readonly",
        });
      }
      if (href.endsWith("/profile")) {
        return Response.json({ emailAddress: "sory@example.com" });
      }
      if (href.includes("/messages?")) {
        return Response.json({
          messages: jobMessages.map((item) => ({ id: item.id })),
        });
      }
      const found = jobMessages.find((item) => href.includes(`/messages/${item.id}`));
      if (found) return Response.json(found);
      return new Response("missing", { status: 404 });
    }),
  );
  return calls;
}

async function connect(app: ReturnType<typeof createApp>) {
  const started = await app.request("/api/mailbox", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider: "gmail",
      label: "Work Gmail",
      accessToken: "do-not-store",
    }),
  });
  expect(started.status).toBe(201);
  const startBody = (await started.json()) as {
    authorizationUrl: string;
    mailbox: { status: string };
  };
  expect(startBody.mailbox.status).toBe("pending");
  expect(startBody.authorizationUrl).toContain("gmail.readonly");
  expect(startBody.authorizationUrl).toContain("access_type=offline");
  const state = new URL(startBody.authorizationUrl).searchParams.get("state");
  expect(state).toBeTruthy();
  const callback = await app.request(
    `/api/mailbox/gmail/callback?code=auth-code&state=${state}`,
  );
  expect(callback.status).toBe(200);
  return startBody.authorizationUrl;
}

describe("job mail", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("refuses to connect until a Gmail OAuth client is configured", async () => {
    vi.stubEnv("GMAIL_OAUTH_CLIENT_ID", "");
    vi.stubEnv("GMAIL_OAUTH_CLIENT_SECRET", "");
    const app = createApp(openDatabase(":memory:"));
    const response = await app.request("/api/mailbox", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "gmail", label: "Work Gmail" }),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "oauth-not-configured" });
    const listed = await app.request("/api/mailbox");
    expect(await listed.json()).toMatchObject({
      oauthConfigured: false,
      providers: ["gmail"],
      mailbox: null,
    });
  });

  it("connects Gmail, records job mail as career records, and keeps tokens in the vault", async () => {
    vi.stubEnv("GMAIL_OAUTH_CLIENT_ID", "test-client");
    vi.stubEnv("GMAIL_OAUTH_CLIENT_SECRET", "test-secret");
    const calls = mockGmail();
    const db = openDatabase(":memory:");
    const app = createApp(db);
    const authorizationUrl = await connect(app);
    expect(authorizationUrl).toContain("client_id=test-client");
    expect(JSON.stringify({ authorizationUrl })).not.toContain("test-secret");

    const connected = await app.request("/api/mailbox");
    const connectedBody = await connected.json();
    expect(JSON.stringify(connectedBody)).not.toContain("refresh-secret");
    expect(JSON.stringify(connectedBody)).not.toContain("access-1");
    expect(connectedBody).toMatchObject({
      oauthConfigured: true,
      mailbox: {
        provider: "gmail",
        label: "Work Gmail",
        accountEmail: "sory@example.com",
        status: "connected",
      },
    });
    expect(
      (db.prepare("SELECT refresh_token FROM mailbox_connections").get() as { refresh_token: string })
        .refresh_token,
    ).toBe("refresh-secret");

    const scanned = await app.request("/api/mailbox/scan", { method: "POST" });
    expect(scanned.status).toBe(200);
    expect(await scanned.json()).toMatchObject({ scanned: 5, kept: 4, ignored: 1, alreadyKept: 0 });
    expect(calls.some((call) => call.authorization === "Bearer access-1")).toBe(true);

    const career = (await (await app.request("/api/career-management")).json()) as {
      opportunities: Array<{
        id: string;
        kind: string;
        title: string;
        organization: string;
        source_url: string;
        location: string;
        fit_summary: string;
      }>;
      applications: Array<{ id: string; opportunity_id: string; stage: string; next_step: string }>;
      interviews: Array<{ id: string; application_id: string; scheduled_at: string; notes: string; kind: string }>;
      offers: Array<{ id: string; application_id: string; summary: string; decision_due_at: string | null }>;
      contacts: Array<{ id: string; name: string; email: string; role: string; organization: string; notes: string }>;
    };
    const engineer = career.opportunities.find((item) => item.title === "Staff Engineer");
    const designer = career.opportunities.find((item) => item.title === "Product Designer");
    const electrician = career.opportunities.find((item) => item.title === "Electrician");
    const outreach = career.opportunities.find((item) => item.kind === "connection");
    expect(engineer?.organization).toBe("Northstar");
    expect(designer?.organization).toBe("Lumen");
    expect(electrician?.organization).toBe("City Light");
    expect(outreach?.title).toBe("Riley Chen reached out about Staff Engineer");
    expect(career.applications.find((item) => item.opportunity_id === engineer?.id)?.stage).toBe("submitted");
    expect(career.applications.find((item) => item.opportunity_id === designer?.id)?.stage).toBe("interview");
    expect(career.applications.find((item) => item.opportunity_id === electrician?.id)?.stage).toBe("offer");
    expect(career.interviews[0]?.scheduled_at).toBe("2026-03-04T15:00:00.000Z");
    expect(career.offers[0]?.decision_due_at).toBe("2026-04-02T15:00:00.000Z");
    const recruiter = career.contacts.find((item) => item.email === "riley@northstar.example");
    expect(recruiter).toMatchObject({ name: "Riley Chen", role: "Recruiter" });

    const changed = await app.request(`/api/opportunities/${engineer?.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "role",
        title: "Senior Engineer",
        organization: "Northstar",
        sourceUrl: engineer?.source_url,
        location: "Remote",
        fitSummary: "Corrected from job mail.",
      }),
    });
    expect(changed.status).toBe(200);
    const interview = career.interviews[0];
    expect(
      (
        await app.request(`/api/interviews/${interview?.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "phone screen",
            scheduledAt: "2026-03-05T15:00:00.000Z",
            notes: "Moved one day.",
          }),
        })
      ).status,
    ).toBe(200);
    const offer = career.offers[0];
    expect(
      (
        await app.request(`/api/offers/${offer?.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            summary: "Updated offer summary",
            decisionDueAt: "2026-04-09T15:00:00.000Z",
          }),
        })
      ).status,
    ).toBe(200);
    expect((await app.request(`/api/offers/${offer?.id}`, { method: "DELETE" })).status).toBe(200);
    const application = career.applications.find((item) => item.opportunity_id === engineer?.id);
    expect(
      (
        await app.request(`/api/applications/${application?.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ nextStep: "Send the portfolio", deadline: "2026-04-01" }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request(`/api/contacts/${recruiter?.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "Riley C.",
            organization: "Northstar",
            role: "Recruiter",
            email: "riley@northstar.example",
            notes: "Met from job mail.",
          }),
        })
      ).status,
    ).toBe(200);

    const renamed = await app.request("/api/mailbox", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "gmail", label: "Personal Gmail" }),
    });
    expect(await renamed.json()).toMatchObject({
      mailbox: { label: "Personal Gmail", provider: "gmail" },
    });

    db.prepare("UPDATE mailbox_connections SET token_expires_at = ?").run(
      "2000-01-01T00:00:00.000Z",
    );
    const again = await app.request("/api/mailbox/scan", { method: "POST" });
    expect(await again.json()).toMatchObject({ kept: 0, alreadyKept: 4, ignored: 1 });
    expect(calls.some((call) => call.authorization === "Bearer access-2")).toBe(true);

    expect(
      (await app.request(`/api/opportunities/${outreach?.id}`, { method: "DELETE" })).status,
    ).toBe(200);
    expect((await app.request(`/api/contacts/${recruiter?.id}`, { method: "DELETE" })).status).toBe(200);
    const afterDelete = (await (await app.request("/api/career-management")).json()) as {
      opportunities: Array<{ id: string }>;
      contacts: Array<{ id: string }>;
    };
    expect(afterDelete.opportunities.some((item) => item.id === outreach?.id)).toBe(false);
    expect(afterDelete.contacts.some((item) => item.id === recruiter?.id)).toBe(false);

    const third = await app.request("/api/mailbox/scan", { method: "POST" });
    expect(await third.json()).toMatchObject({ kept: 0, alreadyKept: 4 });
    expect((await app.request("/api/mailbox", { method: "DELETE" })).status).toBe(200);
    expect((await app.request("/api/mailbox/scan", { method: "POST" })).status).toBe(404);
    const cleared = db.prepare("SELECT access_token FROM mailbox_connections").get();
    expect(cleared).toBeUndefined();
    expect(
      (db.prepare("SELECT COUNT(*) AS count FROM mailbox_findings").get() as { count: number }).count,
    ).toBe(4);
  });

  it("returns the occupant to Opportunities after the browser callback", async () => {
    vi.stubEnv("GMAIL_OAUTH_CLIENT_ID", "test-client");
    vi.stubEnv("GMAIL_OAUTH_CLIENT_SECRET", "test-secret");
    mockGmail();
    const app = createApp(openDatabase(":memory:"));
    const started = await app.request("/api/mailbox", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "gmail", label: "Work Gmail" }),
    });
    const state = new URL(
      ((await started.json()) as { authorizationUrl: string }).authorizationUrl,
    ).searchParams.get("state");
    const callback = await app.request(
      `/api/mailbox/gmail/callback?code=auth-code&state=${state}`,
      { headers: { accept: "text/html" } },
    );
    expect(callback.status).toBe(200);
    expect(await callback.text()).toContain("/#/opportunities?mailbox=connected");
  });

  it("records a Gmail refusal without returning tokens", async () => {
    vi.stubEnv("GMAIL_OAUTH_CLIENT_ID", "test-client");
    vi.stubEnv("GMAIL_OAUTH_CLIENT_SECRET", "test-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      const body =
        init?.body instanceof URLSearchParams
          ? init.body.toString()
          : typeof init?.body === "string"
            ? init.body
            : "";
        if (href.includes("oauth2.googleapis.com/token")) {
          return Response.json({
            access_token: "access-1",
            refresh_token: "refresh-secret",
            expires_in: 3600,
          });
        }
        if (href.endsWith("/profile")) {
          return Response.json({ emailAddress: "sory@example.com" });
        }
        if (body.includes("refresh") || href.includes("/messages")) {
          return new Response("no", { status: 401 });
        }
        return new Response("missing", { status: 404 });
      }),
    );
    const app = createApp(openDatabase(":memory:"));
    await connect(app);
    const scanned = await app.request("/api/mailbox/scan", { method: "POST" });
    expect(scanned.status).toBe(502);
    const body = await scanned.json();
    expect(body).toMatchObject({ error: "scan-failed" });
    expect(JSON.stringify(body)).not.toContain("refresh-secret");
    const mailbox = await app.request("/api/mailbox");
    expect(await mailbox.json()).toMatchObject({
      mailbox: { status: "error", lastError: "Gmail refused the connection. Connect it again." },
    });
  });
});
