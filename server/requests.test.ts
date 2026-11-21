import { describe, expect, it } from "vitest";
import { applyRelayRequestState, prepareOutgoingRequest, requestEmailDraft } from "../core/requests";
import { createRelayApp } from "../relay/app";
import { openRelayDatabase } from "../relay/db";
import { createApp } from "./app";
import { openDatabase } from "./db";
import type { RequestRelay } from "./requests";

const ORIGIN = "https://relay.test";

/** A Docier server wired to a real Relay app, in memory. */
async function setup() {
  const relayDb = openRelayDatabase(":memory:");
  const relayApp = createRelayApp(relayDb, "owner-secret");
  const owner = { authorization: "Bearer owner-secret", "content-type": "application/json" };
  const requestRelay: RequestRelay = {
    async putAsk(hash, ask) {
      const response = await relayApp.request(`/relay/asks/${hash}`, { method: "PUT", headers: owner, body: JSON.stringify(ask) });
      if (!response.ok) throw new Error(`put ${response.status}`);
    },
    async withdrawAsk(hash) {
      await relayApp.request(`/relay/asks/${hash}`, { method: "DELETE", headers: owner });
    },
    async forgetJoin(hash) {
      await relayApp.request(`/relay/asks/${hash}/join`, { method: "DELETE", headers: owner });
    },
    async inbound(after) {
      const response = await relayApp.request(`/relay/inbound?after=${encodeURIComponent(after)}`, { headers: owner });
      return ((await response.json()) as { requests: Awaited<ReturnType<RequestRelay["inbound"]>> }).requests;
    },
    async askStates(hashes) {
      const response = await relayApp.request("/relay/asks/states", { method: "POST", headers: owner, body: JSON.stringify({ hashes }) });
      return ((await response.json()) as { states: Awaited<ReturnType<RequestRelay["askStates"]>> }).states;
    },
  };
  const db = openDatabase(":memory:");
  const app = createApp(db, { requestRelay, relayPublicOrigin: ORIGIN });
  const json = (method: string, body?: unknown) => ({
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  await app.request("/api/profile", json("PUT", { firstName: "Sory", lastName: "Kaba", fullName: "Sory Kaba", headline: "Controls technician" }));
  const send = async (method: string, path: string, body?: unknown) => {
    const response = await app.request(path, json(method, body));
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  };
  const tokenOf = (link: string) => link.slice(`${ORIGIN}/q/`.length);
  return { db, relayDb, relayApp, app, send, tokenOf };
}

describe("the rules for a request", () => {
  it("reads a request to someone outside My Network", () => {
    expect(prepareOutgoingRequest({ kind: "reference", body: " Would you? ", recipientName: "Marcus Hale", recipientEmail: "marcus@hale.example" })).toEqual({
      ok: true,
      value: { kind: "reference", body: "Would you?", recipient: { name: "Marcus Hale", email: "marcus@hale.example" }, expiresInDays: 30 },
    });
    expect(prepareOutgoingRequest({ kind: "favor", body: "x", recipientName: "a", recipientEmail: "a@b.co" })).toEqual({ ok: false, error: "kind-invalid" });
    expect(prepareOutgoingRequest({ kind: "general", body: "x", recipientName: "a", recipientEmail: "not-an-email" })).toEqual({ ok: false, error: "email-invalid" });
    expect(prepareOutgoingRequest({ kind: "general", body: "", contactId: "c1" })).toEqual({ ok: false, error: "body-required" });
  });

  it("only moves a status forward", () => {
    const state = (status: "sent" | "opened" | "approved" | "declined" | "withdrawn") => ({ status, note: "", openedAt: null, answeredAt: null });
    expect(applyRelayRequestState("sent", state("opened"))).toBe("opened");
    expect(applyRelayRequestState("opened", state("approved"))).toBe("approved");
    expect(applyRelayRequestState("approved", state("opened"))).toBe("approved");
    expect(applyRelayRequestState("withdrawn", state("approved"))).toBe("withdrawn");
  });

  it("drafts a short email with the link", () => {
    const draft = requestEmailDraft({ kind: "introduction", fromName: "Sory Kaba", recipientName: "Marcus Hale", body: "Could you introduce me?", link: "https://relay.test/q/abc" });
    expect(draft.subject).toBe("Sory Kaba: introduction request");
    expect(draft.body).toContain("Hi Marcus,");
    expect(draft.body).toContain("https://relay.test/q/abc");
  });
});

describe("sending a request and following the answer", () => {
  it("goes from Sent to Opened to Approved, with the recipient's note", async () => {
    const { app, relayApp, send, tokenOf } = await setup();
    const created = await send("POST", "/api/requests", {
      kind: "reference",
      body: "Would you speak to my work at Northstar?",
      recipientName: "Dana Reed",
      recipientEmail: "dana@northstar.example",
    });
    expect(created.status).toBe(201);
    expect(created.body.request).toMatchObject({ status: "sent", recipientName: "Dana Reed", contactId: null });
    const token = tokenOf(created.body.request.link);
    // Not added to My Network on send.
    expect(((await (await app.request("/api/career-management")).json()) as { contacts: unknown[] }).contacts).toEqual([]);

    const pageResponse = await relayApp.request(`/q/${token}`);
    expect(pageResponse.status).toBe(200);
    expect(pageResponse.headers.get("referrer-policy")).toBe("no-referrer");
    expect(pageResponse.headers.get("cache-control")).toBe("no-store");
    const html = await pageResponse.text();
    expect(html).toContain("Sory Kaba asks you to be a reference");
    expect(html).toContain("Would you speak to my work at Northstar?");
    expect((await send("GET", "/api/requests")).body.requests[0].status).toBe("opened");

    const answered = await relayApp.request(`/q/${token}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "approved", note: "Happy to. Call me." }),
    });
    expect(answered.status).toBe(200);
    const listed = (await send("GET", "/api/requests")).body;
    expect(listed.requests[0]).toMatchObject({ status: "approved", note: "Happy to. Call me.", changed: true, link: null });

    // Seen clears the dot; a second answer is refused.
    await send("POST", "/api/requests/seen", { ids: [listed.requests[0].id] });
    expect((await send("GET", "/api/requests")).body.requests[0].changed).toBe(false);
    expect((await relayApp.request(`/q/${token}/answer`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "declined" }) })).status).toBe(409);
    expect(await (await relayApp.request(`/q/${token}`)).text()).toContain("You approved this request.");
  });

  it("sends to someone in My Network by contact", async () => {
    const { send } = await setup();
    const contact = await send("POST", "/api/contacts", { name: "Priya Shah", email: "priya@waters.example", organization: "Waters" });
    const contactId = contact.body.contact?.id ?? contact.body.id;
    const created = await send("POST", "/api/requests", { kind: "recommendation", body: "Would you write one?", contactId });
    expect(created.status).toBe(201);
    expect(created.body.request).toMatchObject({ contactId, recipientName: "Priya Shah", recipientEmail: "priya@waters.example" });
    expect((await send("POST", "/api/requests", { kind: "general", body: "x", contactId: "nope" })).status).toBe(404);
  });

  it("edits while waiting, then withdraws, and the link says so", async () => {
    const { relayApp, send, tokenOf } = await setup();
    const created = (await send("POST", "/api/requests", { kind: "general", body: "First draft", recipientName: "Lee", recipientEmail: "lee@x.example" })).body.request;
    const token = tokenOf(created.link);
    const edited = await send("PUT", `/api/requests/${created.id}`, { kind: "introduction", body: "Clearer ask", recipientName: "Lee Okafor", recipientEmail: "lee@x.example" });
    expect(edited.body.request).toMatchObject({ kind: "introduction", body: "Clearer ask", recipientName: "Lee Okafor", expiresAt: created.expiresAt });
    expect(await (await relayApp.request(`/q/${token}`)).text()).toContain("Clearer ask");

    expect((await send("POST", `/api/requests/${created.id}/withdraw`)).status).toBe(200);
    expect((await send("GET", "/api/requests")).body.requests[0].status).toBe("withdrawn");
    expect(await (await relayApp.request(`/q/${token}`)).text()).toContain("This request was withdrawn.");
    expect((await send("PUT", `/api/requests/${created.id}`, { kind: "general", body: "x", recipientName: "Lee", recipientEmail: "lee@x.example" })).status).toBe(409);
    expect((await send("DELETE", `/api/requests/${created.id}`)).status).toBe(200);
    expect((await send("GET", "/api/requests")).body.requests).toEqual([]);
  });

  it("clears finished requests at once and keeps the ones still waiting", async () => {
    const { db, send } = await setup();
    const make = async (name: string) =>
      (await send("POST", "/api/requests", { kind: "general", body: "Hi", recipientName: name, recipientEmail: `${name}@x.example` })).body.request;
    const open = await make("open");
    const done = await make("done");
    await send("POST", `/api/requests/${done.id}/withdraw`);
    // An open request can't be cleared on its own.
    expect((await send("POST", `/api/requests/${open.id}/clear`)).status).toBe(409);
    expect((await send("POST", "/api/requests/clear-finished", { list: "all" })).body.cleared).toBe(1);
    // Cleared requests stay, marked, for History.
    const listed = (await send("GET", "/api/requests")).body.requests as Array<{ id: string; clearedAt: string | null }>;
    expect(Object.fromEntries(listed.map((request) => [request.id, Boolean(request.clearedAt)]))).toEqual({
      [done.id]: true,
      [open.id]: false,
    });
    expect((await send("POST", "/api/requests/clear-finished", { list: "sent" })).body.cleared).toBe(0);
    // An answer not seen yet isn't cleared until it has been.
    db.prepare("UPDATE outgoing_requests SET status = 'approved', seen_status = 'sent', cleared_at = NULL WHERE id = ?").run(done.id);
    expect((await send("POST", "/api/requests/clear-finished", { list: "sent" })).body.cleared).toBe(0);
    await send("POST", "/api/requests/seen", { ids: [done.id] });
    expect((await send("POST", "/api/requests/clear-finished", { list: "sent" })).body.cleared).toBe(1);
    // Deleting is for good.
    expect((await send("DELETE", `/api/requests/${done.id}`)).status).toBe(200);
    expect((await send("GET", "/api/requests")).body.requests.map((request: { id: string }) => request.id)).toEqual([open.id]);
  });

  it("shows an expired request as expired, and its link refuses an answer", async () => {
    const { db, relayDb, relayApp, send, tokenOf } = await setup();
    const created = (await send("POST", "/api/requests", { kind: "general", body: "Soon", recipientName: "Tom", recipientEmail: "tom@x.example" })).body.request;
    const past = "2000-01-01T00:00:00.000Z";
    db.prepare("UPDATE outgoing_requests SET expires_at = ?").run(past);
    relayDb.prepare("UPDATE relay_asks SET expires_at = ?").run(past);
    expect((await send("GET", "/api/requests")).body.requests[0]).toMatchObject({ status: "expired", changed: true, link: null });
    const token = tokenOf(created.link);
    expect(await (await relayApp.request(`/q/${token}`)).text()).toContain("This request has expired.");
    expect((await relayApp.request(`/q/${token}/answer`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "approved" }) })).status).toBe(409);
  });

  it("refuses without a Relay, and keeps the Relay's owner routes private", async () => {
    const db = openDatabase(":memory:");
    const app = createApp(db);
    const response = await app.request("/api/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "general", body: "x", recipientName: "a", recipientEmail: "a@b.co" }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "relay-not-configured" });
    expect(((await (await app.request("/api/requests")).json()) as { relayConfigured: boolean }).relayConfigured).toBe(false);

    const relayApp = createRelayApp(openRelayDatabase(":memory:"), "owner-secret");
    expect((await relayApp.request(`/relay/asks/${"a".repeat(64)}`, { method: "PUT", body: "{}" })).status).toBe(401);
    expect((await relayApp.request("/relay/asks/states", { method: "POST", body: "{}" })).status).toBe(401);
    expect((await relayApp.request("/q/not-a-real-token")).status).toBe(404);
  });
});
