import { afterEach, describe, expect, it, vi } from "vitest";
import { ACCESS_NO_END, accessState, limitProjection, prepareAccessChange, type WorkMapSnapshot } from "../core/index";
import { createRelayApp } from "../relay/app";
import { openRelayDatabase } from "../relay/db";
import { createApp } from "./app";
import { openDatabase } from "./db";
import type { ProjectionRelay } from "./projections";
import type { RequestRelay } from "./requests";

const ORIGIN = "https://relay.test";
const BIO = "Controls engineer who keeps conveyor lines running.";

async function setup() {
  const relayDb = openRelayDatabase(":memory:");
  const relayApp = createRelayApp(relayDb, "owner-secret");
  const owner = { authorization: "Bearer owner-secret", "content-type": "application/json" };
  const call = async (path: string, init: RequestInit = {}) => {
    const response = await relayApp.request(path, { ...init, headers: { ...owner, ...(init.headers ?? {}) } });
    if (!response.ok) throw new Error(`${path} ${response.status}`);
    return response;
  };
  const relay: ProjectionRelay = {
    async publish(projection) {
      await call(`/relay/publications/${projection.slug}`, { method: "PUT", body: JSON.stringify({ projection }) });
    },
    async revoke(slug) {
      await call(`/relay/publications/${slug}`, { method: "DELETE" });
    },
    async grant(slug, grant) {
      await call(`/relay/publications/${slug}/grants`, { method: "POST", body: JSON.stringify(grant) });
    },
    async revokeGrant(slug, hash) {
      await call(`/relay/publications/${slug}/grants/${hash}`, { method: "DELETE" });
    },
    async updateGrant(slug, hash, change) {
      await call(`/relay/publications/${slug}/grants/${hash}`, { method: "PATCH", body: JSON.stringify(change) });
    },
    async grantOpens(after) {
      return ((await (await call(`/relay/grants/opens?after=${encodeURIComponent(after)}`)).json()) as { opens: never }).opens;
    },
  };
  const requestRelay: RequestRelay = {
    putAsk: vi.fn(async () => undefined),
    withdrawAsk: vi.fn(async () => undefined),
    askStates: vi.fn(async () => ({})),
    forgetJoin: vi.fn(async () => undefined),
    async inbound(after) {
      return ((await (await call(`/relay/inbound?after=${encodeURIComponent(after)}`)).json()) as { requests: never }).requests;
    },
  };
  const db = openDatabase(":memory:");
  const app = createApp(db, { relay, requestRelay, relayPublicOrigin: ORIGIN });
  const send = async (method: string, path: string, body?: unknown) => {
    const response = await app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  };
  await send("PUT", "/api/profile", { firstName: "Sory", lastName: "Kaba", fullName: "Sory Kaba", bio: BIO });
  await send("POST", "/api/history", { experience: [{ company: "Acme Systems", title: "Controls Tech", isCurrent: true }] });
  await send("PUT", "/api/work-map/settings", { slug: "sory", visibility: "access-controlled", sections: ["profile", "history"] });
  expect((await send("POST", "/api/work-map/publish")).status).toBe(201);
  /** The page as a link opens it on the Relay. */
  const open = async (link: string) => {
    const response = await relayApp.request(link.slice(ORIGIN.length));
    return { status: response.status, html: await response.text() };
  };
  return { db, relayDb, app, send, open };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("access rules", () => {
  it("reads a choice of sections and length within what the page publishes", () => {
    const page = ["profile", "history", "map"] as const;
    expect(prepareAccessChange({ sections: ["profile"], days: 7 }, page)).toEqual({
      ok: true,
      value: { sections: ["profile"], days: 7, message: "" },
    });
    // Every section the page has is the whole page, which follows later publishes.
    expect(prepareAccessChange({ sections: ["map", "history", "profile"], days: null }, page)).toMatchObject({
      ok: true,
      value: { sections: null, days: null },
    });
    expect(prepareAccessChange({ sections: [] }, page)).toEqual({ ok: false, error: "sections-required" });
    expect(prepareAccessChange({ sections: ["skills"] }, page)).toEqual({ ok: false, error: "sections-invalid" });
    expect(prepareAccessChange({ days: 12 }, page)).toEqual({ ok: false, error: "length-invalid" });
  });

  it("empties what a link doesn't open, and says when it ends", () => {
    const projection = {
      sections: ["profile", "history", "map", "skills"],
      profile: { displayName: "Sory", headline: "Tech", city: "", state: "PA", bio: "Bio", links: { linkedin: "x", github: "", portfolio: "" } },
      roles: [{ locations: [{}], media: [], linkedEvidence: [], milestones: [], events: [] }],
      skills: ["PLC"],
    } as unknown as WorkMapSnapshot;
    const limited = limitProjection(projection, ["history"]);
    expect(limited.sections).toEqual(["history"]);
    expect(limited.profile).toMatchObject({ displayName: "Sory", bio: "", headline: "" });
    expect(limited.roles[0]?.locations).toEqual([]);
    expect(limited.skills).toEqual([]);
    const now = new Date("2026-11-20T00:00:00Z");
    expect(accessState({ expiresAt: "2026-11-25T00:00:00Z", revokedAt: null }, now)).toBe("ending");
    expect(accessState({ expiresAt: ACCESS_NO_END, revokedAt: null }, now)).toBe("active");
    expect(accessState({ expiresAt: "2026-11-19T00:00:00Z", revokedAt: null }, now)).toBe("expired");
  });
});

describe("managing access", () => {
  it("shares chosen sections with someone, and the link opens only those", async () => {
    const ctx = await setup();
    const shared = await ctx.send("POST", "/api/access", {
      name: "Riley Park",
      email: "riley@park.example",
      sections: ["history"],
      days: 7,
      message: "For our call.",
    });
    expect(shared.status).toBe(201);
    const person = shared.body.person;
    expect(person).toMatchObject({ name: "Riley Park", source: "shared", sections: ["history"], wholePage: false, state: "ending" });
    expect(person.link).toMatch(new RegExp(`^${ORIGIN}/r/sory\\?token=`));
    expect(person.activity).toMatchObject([{ kind: "shared", sections: ["history"], message: "For our call." }]);

    const page = await ctx.open(person.link);
    expect(page.status).toBe(200);
    expect(page.html).toContain("Acme Systems");
    expect(page.html).not.toContain(BIO);
    // The Relay never holds the link itself.
    const stored = ctx.relayDb.prepare("SELECT token_hash, sections_json FROM relay_grants").get() as Record<string, string>;
    expect(person.link).not.toContain(stored.token_hash);
    expect(stored.sections_json).toBe('["history"]');
  });

  it("changes what a link opens without changing the link", async () => {
    const ctx = await setup();
    const person = (await ctx.send("POST", "/api/access", { name: "Riley Park", email: "riley@park.example", sections: ["history"] })).body.person;
    const changed = await ctx.send("PUT", `/api/access/${person.id}`, { sections: ["profile", "history"], days: null, message: "Added your bio." });
    expect(changed.status).toBe(200);
    expect(changed.body.person).toMatchObject({ link: person.link, wholePage: true, untilRevoked: true });
    expect((await ctx.open(person.link)).html).toContain(BIO);
    expect(changed.body.person.activity.map((entry: { kind: string }) => entry.kind)).toEqual(["changed", "shared"]);
  });

  it("counts opens on the Relay once per visit and adds them to Activity", async () => {
    const ctx = await setup();
    const person = (await ctx.send("POST", "/api/access", { name: "Riley Park", email: "riley@park.example" })).body.person;
    await ctx.open(person.link);
    await ctx.open(person.link); // a reload within half an hour
    let listed = (await ctx.send("GET", "/api/access")).body;
    expect(listed.people[0]).toMatchObject({ openCount: 1 });
    expect(listed.people[0].activity[0]).toMatchObject({ kind: "opened" });
    // Reading again doesn't add it twice.
    listed = (await ctx.send("GET", "/api/access")).body;
    expect(listed.people[0].activity.filter((entry: { kind: string }) => entry.kind === "opened")).toHaveLength(1);
  });

  it("revokes, gives access again with a new link, and removes the record", async () => {
    const ctx = await setup();
    const person = (await ctx.send("POST", "/api/access", { name: "Riley Park", email: "riley@park.example" })).body.person;
    const revoked = await ctx.send("POST", `/api/access/${person.id}/revoke`, {});
    expect(revoked.body.person.state).toBe("revoked");
    expect((await ctx.open(person.link)).status).toBe(403);
    // A revoked link can't be changed, only given again.
    expect((await ctx.send("PUT", `/api/access/${person.id}`, { days: 7 })).status).toBe(409);

    const restored = await ctx.send("POST", `/api/access/${person.id}/restore`, { days: 30 });
    expect(restored.body.person.state).toBe("active");
    expect(restored.body.person.link).not.toBe(person.link);
    expect((await ctx.open(restored.body.person.link)).status).toBe(200);
    expect((await ctx.open(person.link)).status).toBe(403);
    expect(restored.body.person.activity.map((entry: { kind: string }) => entry.kind).slice(0, 2)).toEqual(["restored", "revoked"]);

    expect((await ctx.send("DELETE", `/api/access/${person.id}`)).status).toBe(200);
    expect((await ctx.open(restored.body.person.link)).status).toBe(403);
    expect((await ctx.send("GET", "/api/access")).body.people).toEqual([]);
    expect((ctx.db.prepare("SELECT COUNT(*) AS n FROM access_activity").get() as { n: number }).n).toBe(0);
  });

  it("approving a received request chooses what they see, and both share one Activity", async () => {
    const ctx = await setup();
    await (await setupAsk(ctx))("Ava Chen", "ava@giants.example");
    const listed = (await ctx.send("GET", "/api/requests")).body;
    const request = listed.received[0];
    expect(request.pageSections).toEqual(["profile", "history"]);
    const answer = await ctx.send("POST", `/api/requests/received/${request.id}/answer`, {
      decision: "approved",
      note: "Welcome.",
      sections: ["history"],
      days: null,
    });
    expect(answer.status).toBe(200);
    expect(answer.body.request.grantId).toEqual(expect.any(String));
    const person = (await ctx.send("GET", "/api/access")).body.people[0];
    expect(person).toMatchObject({ name: "Ava Chen", source: "asked", sections: ["history"], untilRevoked: true, link: answer.body.accessLink });
    expect(person.activity.map((entry: { kind: string }) => entry.kind)).toEqual(["approved", "asked"]);
    expect((await ctx.open(answer.body.accessLink)).html).not.toContain(BIO);
  });

  it("refuses a bad email, and a section the page doesn't publish", async () => {
    const ctx = await setup();
    expect((await ctx.send("POST", "/api/access", { name: "Riley", email: "nope" })).body.error).toBe("email-invalid");
    expect((await ctx.send("POST", "/api/access", { name: "Riley", email: "r@x.example", sections: ["skills"] })).body.error).toBe(
      "sections-invalid",
    );
  });
});

/** Lets a visitor ask for access on the Relay page. */
async function setupAsk(ctx: Awaited<ReturnType<typeof setup>>) {
  const relayApp = createRelayApp(ctx.relayDb, "owner-secret");
  return (name: string, email: string) =>
    relayApp.request("/r/sory/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, message: "Could I see it?" }),
    });
}
