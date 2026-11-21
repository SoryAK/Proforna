import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { prepareJoin, readJoinPhoto } from "../core/index";
import { createRelayApp } from "../relay/app";
import { openRelayDatabase } from "../relay/db";
import { createApp } from "./app";
import { openDatabase } from "./db";
import type { RequestRelay } from "./requests";

// A 1×1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const PNG_URL = `data:image/png;base64,${PNG.toString("base64")}`;
const ORIGIN = "https://relay.test";

function setup() {
  const uploadsDir = mkdtempSync(join(tmpdir(), "docier-photos-"));
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
    inbound: vi.fn(async () => []),
  };
  const db = openDatabase(":memory:");
  const app = createApp(db, { uploadsDir, requestRelay, relayPublicOrigin: ORIGIN });
  const json = async (method: string, path: string, body?: unknown) => {
    const response = await app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  };
  const upload = (contactId: string, type = "image/png", bytes: Uint8Array = PNG) => {
    const form = new FormData();
    form.append("photo", new File([new Uint8Array(bytes)], "p.png", { type }));
    return app.request(`/api/contacts/${contactId}/photo`, { method: "POST", body: form });
  };
  const contacts = async () => (await json("GET", "/api/career-management")).body.contacts as Array<Record<string, any>>;
  return { db, app, relayApp, json, upload, contacts, uploadsDir };
}

describe("contact photos", () => {
  it("adds, shows, changes, and removes a contact's photo", async () => {
    const ctx = setup();
    const id = (await ctx.json("POST", "/api/contacts", { name: "Dana Reed", email: "dana@x.example" })).body.contact.id;
    expect((await ctx.contacts())[0]!.photo_url).toBeNull();

    const added = await ctx.upload(id);
    expect(added.status).toBe(201);
    const url = ((await added.json()) as { photoUrl: string }).photoUrl;
    expect((await ctx.contacts())[0]!.photo_url).toBe(url);
    const shown = await ctx.app.request(url);
    expect(shown.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await shown.arrayBuffer())).toEqual(PNG);

    // A new photo replaces the file; the old one is deleted.
    const changed = ((await (await ctx.upload(id)).json()) as { photoUrl: string }).photoUrl;
    expect(changed).not.toBe(url);
    expect(readdirSync(ctx.uploadsDir).filter((name) => name.startsWith("contact-"))).toHaveLength(1);

    expect((await ctx.json("DELETE", `/api/contacts/${id}/photo`)).status).toBe(200);
    expect((await ctx.contacts())[0]!.photo_url).toBeNull();
    expect(readdirSync(ctx.uploadsDir).filter((name) => name.startsWith("contact-"))).toHaveLength(0);
    expect((await ctx.app.request(`/api/contacts/${id}/photo`)).status).toBe(404);
  });

  it("refuses what isn't a photo, and removes the file with the contact", async () => {
    const ctx = setup();
    const id = (await ctx.json("POST", "/api/contacts", { name: "Dana Reed" })).body.contact.id;
    expect((await ctx.upload(id, "application/pdf")).status).toBe(400);
    expect((await ctx.upload("missing")).status).toBe(404);
    await ctx.upload(id);
    const [file] = readdirSync(ctx.uploadsDir).filter((name) => name.startsWith("contact-"));
    expect((await ctx.json("DELETE", `/api/contacts/${id}`)).status).toBe(200);
    expect(existsSync(join(ctx.uploadsDir, file!))).toBe(false);
  });

  it("shows a contact's photo on requests to them", async () => {
    const ctx = setup();
    await ctx.json("PUT", "/api/profile", { firstName: "Sory", lastName: "Kaba", fullName: "Sory Kaba" });
    const id = (await ctx.json("POST", "/api/contacts", { name: "Dana Reed", email: "Dana@X.example" })).body.contact.id;
    const url = ((await (await ctx.upload(id)).json()) as { photoUrl: string }).photoUrl;
    await ctx.json("POST", "/api/requests", { kind: "general", body: "Hi", recipientName: "Dana", recipientEmail: "dana@x.example" });
    expect((await ctx.json("GET", "/api/requests")).body.requests[0].photoUrl).toBe(url);
  });
});

describe("a joiner's photo", () => {
  it("keeps only a small image, and drops anything else without failing the join", () => {
    expect(readJoinPhoto(PNG_URL)).toBe(PNG_URL);
    expect(readJoinPhoto("data:text/html;base64,PHNjcmlwdD4=")).toBe("");
    expect(readJoinPhoto(`data:image/png;base64,${"A".repeat(500_000)}`)).toBe("");
    const join = prepareJoin({ choice: "joined", details: { name: "Dana", email: "d@x.example", photo: "javascript:alert(1)" } });
    expect(join).toMatchObject({ ok: true, value: { details: { photo: "" } } });
  });

  it("comes in with the join, fills only a blank photo, and leaves the Relay", async () => {
    const ctx = setup();
    await ctx.json("PUT", "/api/profile", { firstName: "Sory", lastName: "Kaba", fullName: "Sory Kaba" });
    const answer = async (email: string) => {
      const created = (await ctx.json("POST", "/api/requests", { kind: "reference", body: "Would you?", recipientName: "Dana Reed", recipientEmail: email })).body.request;
      const token = created.link.slice(`${ORIGIN}/q/`.length);
      return ctx.relayApp.request(`/q/${token}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "approved", join: { choice: "joined", details: { name: "Dana Reed", email, photo: PNG_URL } } }),
      });
    };
    expect((await answer("dana@x.example")).status).toBe(200);
    await ctx.json("GET", "/api/requests");
    const contact = (await ctx.contacts()).find((item) => item.email === "dana@x.example")!;
    expect(contact.photo_url).toEqual(expect.stringContaining(`/api/contacts/${contact.id}/photo`));
    expect(Buffer.from(await (await ctx.app.request(contact.photo_url)).arrayBuffer())).toEqual(PNG);

    // A contact who already has a photo keeps it.
    const own = (await ctx.json("POST", "/api/contacts", { name: "Lee", email: "lee@x.example" })).body.contact.id;
    const ownUrl = ((await (await ctx.upload(own)).json()) as { photoUrl: string }).photoUrl;
    await answer("lee@x.example");
    await ctx.json("GET", "/api/requests");
    expect((await ctx.contacts()).find((item) => item.id === own)!.photo_url).toBe(ownUrl);

    // An oversized answer is turned away at the Relay.
    const created = (await ctx.json("POST", "/api/requests", { kind: "general", body: "Hi", recipientName: "Big", recipientEmail: "big@x.example" })).body.request;
    const huge = await ctx.relayApp.request(`/q/${created.link.slice(`${ORIGIN}/q/`.length)}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "700000" },
      body: JSON.stringify({ decision: "approved" }),
    });
    expect(huge.status).toBe(413);
  });
});
