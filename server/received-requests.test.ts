import { describe, expect, it, vi } from "vitest";
import { mergeJoinIntoContact, prepareJoin } from "../core/requests";
import { createRelayApp } from "../relay/app";
import { openRelayDatabase } from "../relay/db";
import { createApp } from "./app";
import { openDatabase } from "./db";
import type { ProjectionRelay } from "./projections";
import { receivedEmail } from "./received-requests";
import type { RequestRelay } from "./requests";

const ORIGIN = "https://relay.test";

async function setup() {
  const relayDb = openRelayDatabase(":memory:");
  const relayApp = createRelayApp(relayDb, "owner-secret");
  const owner = { authorization: "Bearer owner-secret", "content-type": "application/json" };
  const call = (path: string, init: RequestInit = {}) => relayApp.request(path, { ...init, headers: { ...owner, ...(init.headers ?? {}) } });
  const requestRelay: RequestRelay = {
    async putAsk(hash, ask) {
      await call(`/relay/asks/${hash}`, { method: "PUT", body: JSON.stringify(ask) });
    },
    async withdrawAsk(hash) {
      await call(`/relay/asks/${hash}`, { method: "DELETE" });
    },
    async askStates(hashes) {
      return ((await (await call("/relay/asks/states", { method: "POST", body: JSON.stringify({ hashes }) })).json()) as { states: never }).states;
    },
    async forgetJoin(hash) {
      await call(`/relay/asks/${hash}/join`, { method: "DELETE" });
    },
    async inbound(after) {
      return ((await (await call(`/relay/inbound?after=${encodeURIComponent(after)}`)).json()) as { requests: never }).requests;
    },
  };
  const projectionRelay = {
    publish: vi.fn(async () => undefined),
    revoke: vi.fn(async () => undefined),
    grant: vi.fn(async () => undefined),
  } satisfies ProjectionRelay;
  const db = openDatabase(":memory:");
  const app = createApp(db, { requestRelay, relay: projectionRelay, relayPublicOrigin: ORIGIN });
  const send = async (method: string, path: string, body?: unknown) => {
    const response = await app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  };
  await send("PUT", "/api/profile", { firstName: "Sory", lastName: "Kaba", fullName: "Sory Kaba" });
  const occupantId = (db.prepare("SELECT id FROM occupants").get() as { id: string }).id;
  return { db, relayDb, relayApp, app, send, occupantId };
}

/** Sends a request to an outsider and answers it on the Relay with the given join. */
async function answered(ctx: Awaited<ReturnType<typeof setup>>, email: string, join?: unknown) {
  const created = (await ctx.send("POST", "/api/requests", { kind: "reference", body: "Would you?", recipientName: "Dana Reed", recipientEmail: email })).body.request;
  const token = created.link.slice(`${ORIGIN}/q/`.length);
  const response = await ctx.relayApp.request(`/q/${token}/answer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision: "approved", note: "Yes", join }),
  });
  return { created, token, response };
}

describe("joining the occupant's network from a request", () => {
  it("reads a join, and fills only a contact's blanks", () => {
    expect(prepareJoin(undefined)).toEqual({ ok: true, value: null });
    expect(prepareJoin({ choice: "declined" })).toEqual({ ok: true, value: { choice: "declined", details: null } });
    expect(prepareJoin({ choice: "joined", details: { name: "Dana", email: "nope" } })).toEqual({ ok: false, error: "join-invalid" });
    expect(
      mergeJoinIntoContact(
        { name: "Dana Reed", email: "dana@x.co", organization: "Northstar", role: "", notes: "Met at expo" },
        { name: "D. Reed", email: "dana@x.co", organization: "Other Co", role: "Plant Manager", phone: "555", photo: "" },
      ),
    ).toEqual({ name: "Dana Reed", email: "dana@x.co", organization: "Northstar", role: "Plant Manager", notes: "Met at expo\nPhone: 555" });
  });

  it("adds someone who joins to My Network, and the Relay forgets their details", async () => {
    const ctx = await setup();
    const join = { choice: "joined", details: { name: "Dana Reed", email: "dana@northstar.example", organization: "Northstar", role: "Plant Manager", phone: "610-555-0142" } };
    const { created, response } = await answered(ctx, "dana@northstar.example", join);
    expect(response.status).toBe(200);
    const request = (await ctx.send("GET", "/api/requests")).body.requests[0];
    expect(request).toMatchObject({ status: "approved", joinStatus: "joined" });
    const contact = ctx.db.prepare("SELECT id, name, organization, role, notes FROM contacts").get() as Record<string, string>;
    expect(contact).toMatchObject({ name: "Dana Reed", organization: "Northstar", role: "Plant Manager", notes: "Phone: 610-555-0142" });
    expect(request.contactId).toBe(contact.id);
    expect(ctx.relayDb.prepare("SELECT join_choice, join_json FROM relay_asks").get()).toEqual({ join_choice: "joined", join_json: null });
    // Reading again doesn't add a second contact.
    await ctx.send("GET", "/api/requests");
    expect((ctx.db.prepare("SELECT COUNT(*) AS n FROM contacts").get() as { n: number }).n).toBe(1);
    expect(created.contactId).toBeNull();
  });

  it("fills blanks on an existing contact with the same email instead of adding another", async () => {
    const ctx = await setup();
    await ctx.send("POST", "/api/contacts", { name: "Dana R.", email: "DANA@northstar.example", organization: "Northstar Systems" });
    await answered(ctx, "dana@northstar.example", { choice: "joined", details: { name: "Dana Reed", email: "dana@northstar.example", organization: "Other", role: "Plant Manager" } });
    await ctx.send("GET", "/api/requests");
    const contacts = ctx.db.prepare("SELECT name, organization, role FROM contacts").all();
    expect(contacts).toEqual([{ name: "Dana R.", organization: "Northstar Systems", role: "Plant Manager" }]);
  });

  it("records no thanks, and an ignored box, without adding anyone", async () => {
    const ctx = await setup();
    await answered(ctx, "a@x.example", { choice: "declined" });
    await answered(ctx, "b@x.example");
    const requests = (await ctx.send("GET", "/api/requests")).body.requests as Array<{ recipientEmail: string; joinStatus: string }>;
    expect(requests.find((r) => r.recipientEmail === "a@x.example")?.joinStatus).toBe("declined");
    expect(requests.find((r) => r.recipientEmail === "b@x.example")?.joinStatus).toBe("ignored");
    expect((ctx.db.prepare("SELECT COUNT(*) AS n FROM contacts").get() as { n: number }).n).toBe(0);
  });

  it("offers joining on the answer page", async () => {
    const ctx = await setup();
    const created = (await ctx.send("POST", "/api/requests", { kind: "general", body: "Hi", recipientName: "Lee Okafor", recipientEmail: "lee@x.example" })).body.request;
    const html = await (await ctx.relayApp.request(created.link.slice(ORIGIN.length))).text();
    expect(html).toContain("Also join Sory's network");
    expect(html).toContain('value="Lee Okafor"');
    expect(html).toContain("No thanks, don't add me");
    // Every script on the page must parse; a stray quote once broke answering.
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) expect(() => new Function(script)).not.toThrow();
  });
});

describe("requests received from the public page", () => {
  async function withAccessPage() {
    const ctx = await setup();
    await ctx.send("POST", "/api/history", { experience: [{ company: "Acme", title: "Tech", isCurrent: true }] });
    await ctx.send("PUT", "/api/work-map/settings", { slug: "sory", visibility: "access-controlled", sections: ["profile", "history"] });
    await ctx.send("POST", "/api/work-map/publish");
    await ctx.relayApp.request("/relay/publications/sory", {
      method: "PUT",
      headers: { authorization: "Bearer owner-secret", "content-type": "application/json" },
      body: JSON.stringify({ projection: { id: "p1", slug: "sory", visibility: "access-controlled", expiresAt: null, profile: {}, roles: [] } }),
    });
    const ask = (name: string, email: string) =>
      ctx.relayApp.request("/r/sory/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, message: `${name} would like to see it.` }),
      });
    return { ...ctx, ask };
  }

  it("brings in each access request once and approves it with a link and a note", async () => {
    const ctx = await withAccessPage();
    expect((await ctx.ask("Ava Chen", "ava@giants.example")).status).toBe(201);
    let listed = (await ctx.send("GET", "/api/requests")).body;
    expect(listed.waiting).toBe(1);
    expect(listed.received[0]).toMatchObject({ requesterName: "Ava Chen", status: "waiting", kind: "access", pageSlug: "sory" });
    listed = (await ctx.send("GET", "/api/requests")).body;
    expect(listed.received).toHaveLength(1);

    const answer = await ctx.send("POST", `/api/requests/received/${listed.received[0].id}/answer`, { decision: "approved", note: "Welcome." });
    expect(answer.status).toBe(200);
    expect(answer.body.request).toMatchObject({ status: "approved", note: "Welcome." });
    expect(answer.body.accessLink).toMatch(new RegExp(`^${ORIGIN}/r/sory\\?token=`));
    expect((await ctx.send("GET", "/api/requests")).body.waiting).toBe(0);
    expect((await ctx.send("POST", `/api/requests/received/${listed.received[0].id}/answer`, { decision: "declined" })).status).toBe(409);

    const email = receivedEmail(ctx.db, ctx.occupantId, listed.received[0].id, answer.body.accessLink);
    expect(email.to).toBe("ava@giants.example");
    expect(email.body).toContain(answer.body.accessLink);
    expect(email.body).toContain("Welcome.");
  });

  it("declines with a note", async () => {
    const ctx = await withAccessPage();
    await ctx.ask("Sam Ortiz", "sam@temple.example");
    const id = (await ctx.send("GET", "/api/requests")).body.received[0].id;
    const answer = await ctx.send("POST", `/api/requests/received/${id}/answer`, { decision: "declined", note: "Not right now." });
    expect(answer.body).toMatchObject({ request: { status: "declined", note: "Not right now." }, accessLink: null });
  });
});
