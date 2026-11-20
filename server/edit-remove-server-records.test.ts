import { describe, expect, it } from "vitest";
import { prepareInterview, prepareOffer } from "../core/career-management";
import { createApp } from "./app";
import { openDatabase } from "./db";

function setup() {
  const db = openDatabase(":memory:");
  const app = createApp(db);
  const send = async (method: string, path: string, body?: unknown) => {
    const response = await app.request(path, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  };
  return { db, app, send };
}

async function application(send: ReturnType<typeof setup>["send"]) {
  const { body: saved } = await send("POST", "/api/opportunities", { kind: "role", title: "Tech", organization: "Acme" });
  const { body } = await send("POST", `/api/opportunities/${saved.opportunity.id}/applications`, {});
  return body.application.id as string;
}

describe("interviews and offers can be changed and removed", () => {
  it("shares one reading of the fields between add and change", () => {
    expect(prepareInterview({ scheduledAt: " 2026-12-01T15:00 ", notes: " panel " })).toEqual({
      ok: true,
      value: { kind: "interview", scheduledAt: "2026-12-01T15:00", notes: "panel" },
    });
    expect(prepareInterview({})).toEqual({ ok: false, error: "schedule-required" });
    expect(prepareOffer({ summary: "", decisionDueAt: "x" })).toEqual({ ok: false, error: "summary-required" });
  });

  it("changes and removes an interview", async () => {
    const { db, send } = setup();
    try {
      const applicationId = await application(send);
      const created = await send("POST", `/api/applications/${applicationId}/interviews`, {
        kind: "screen",
        scheduledAt: "2026-12-01T15:00",
      });
      expect(created.status).toBe(201);
      const id = created.body.interview.id;
      const changed = await send("PUT", `/api/interviews/${id}`, { kind: "panel", scheduledAt: "2026-12-02T10:00", notes: "Bring portfolio" });
      expect(changed.status).toBe(200);
      expect(db.prepare("SELECT kind, scheduled_at, notes FROM interviews").get()).toEqual({
        kind: "panel",
        scheduled_at: "2026-12-02T10:00",
        notes: "Bring portfolio",
      });
      expect((await send("PUT", `/api/interviews/${id}`, { scheduledAt: "" })).status).toBe(400);
      expect((await send("DELETE", `/api/interviews/${id}`)).status).toBe(200);
      expect((await send("DELETE", `/api/interviews/${id}`)).status).toBe(404);
    } finally {
      db.close();
    }
  });

  it("changes and removes an offer, keeping its status", async () => {
    const { db, send } = setup();
    try {
      const applicationId = await application(send);
      const created = await send("POST", `/api/applications/${applicationId}/offers`, { summary: "$80k" });
      const id = created.body.offer.id;
      const changed = await send("PUT", `/api/offers/${id}`, { summary: "$85k", decisionDueAt: "2026-12-10" });
      expect(changed.body.offer).toMatchObject({ summary: "$85k", decisionDueAt: "2026-12-10", status: "considering" });
      expect((await send("DELETE", `/api/offers/${id}`)).status).toBe(200);
      expect(db.prepare("SELECT COUNT(*) AS n FROM offers").get()).toEqual({ n: 0 });
    } finally {
      db.close();
    }
  });
});

describe("an external action can be cancelled before approval", () => {
  it("cancels a pending action, which can then never be approved", async () => {
    const { db, send } = setup();
    try {
      const proposed = await send("POST", "/api/external-actions", {
        kind: "message",
        destination: "recruiter@example.com",
        payload: { body: "Thanks" },
        idempotencyKey: "thanks-1",
      });
      const id = proposed.body.action.id;
      expect((await send("POST", `/api/external-actions/${id}/cancel`)).status).toBe(200);
      expect(db.prepare("SELECT status FROM external_actions").get()).toEqual({ status: "cancelled" });
      expect(db.prepare("SELECT status FROM change_sets").get()).toEqual({ status: "withdrawn" });
      expect((await send("POST", `/api/external-actions/${id}/approve`)).status).toBe(400);
      expect((await send("POST", `/api/external-actions/${id}/cancel`)).status).toBe(200);

      const second = await send("POST", "/api/external-actions", {
        kind: "message",
        destination: "recruiter@example.com",
        payload: {},
        idempotencyKey: "thanks-2",
      });
      await send("POST", `/api/external-actions/${second.body.action.id}/approve`);
      const late = await send("POST", `/api/external-actions/${second.body.action.id}/cancel`);
      expect(late).toEqual({ status: 400, body: { error: "action-not-pending" } });
    } finally {
      db.close();
    }
  });
});

describe("career memory evidence and proposals", () => {
  const evidenceBody = { sourceType: "user", sourceRef: "note-1", title: "Retro", content: { result: "42 to 11 min" } };

  it("changes and removes evidence nothing cites", async () => {
    const { db, send } = setup();
    try {
      const { body } = await send("POST", "/api/memory/evidence", evidenceBody);
      const id = body.evidence.id;
      const changed = await send("PUT", `/api/memory/evidence/${id}`, { ...evidenceBody, title: "Recovery retro", content: { result: "45 to 11" } });
      expect(changed.status).toBe(200);
      expect(changed.body.evidence).toMatchObject({ title: "Recovery retro", content: { result: "45 to 11" } });
      expect((await send("PUT", `/api/memory/evidence/${id}`, { ...evidenceBody, title: "" })).status).toBe(400);
      expect((await send("DELETE", `/api/memory/evidence/${id}`)).status).toBe(200);
      expect((await send("DELETE", `/api/memory/evidence/${id}`)).status).toBe(404);
    } finally {
      db.close();
    }
  });

  it("keeps evidence while a proposal or a fact cites it, and lets a proposal be withdrawn", async () => {
    const { db, send } = setup();
    try {
      const { body } = await send("POST", "/api/memory/evidence", evidenceBody);
      const id = body.evidence.id;
      const proposal = await send("POST", "/api/memory/proposals", {
        factType: "achievement",
        subjectId: "role-1",
        value: { statement: "Cut recovery time." },
        evidenceIds: [id],
      });
      const changeSetId = proposal.body.changeSet.id;
      expect(await send("DELETE", `/api/memory/evidence/${id}`)).toEqual({ status: 409, body: { error: "evidence-cited" } });

      expect((await send("POST", `/api/memory/proposals/${changeSetId}/withdraw`)).status).toBe(200);
      expect((await send("POST", `/api/memory/proposals/${changeSetId}/approve`)).status).toBe(400);
      expect((await send("POST", `/api/memory/proposals/${changeSetId}/withdraw`)).status).toBe(404);
      const audit = db.prepare("SELECT event_type FROM audit_events WHERE event_type = 'career-fact-change-withdrawn'").all();
      expect(audit).toHaveLength(1);

      // Once a fact is approved on it, it stays cited.
      const again = await send("POST", "/api/memory/proposals", {
        factType: "achievement",
        subjectId: "role-1",
        value: { statement: "Cut recovery time." },
        evidenceIds: [id],
      });
      expect((await send("POST", `/api/memory/proposals/${again.body.changeSet.id}/approve`)).status).toBe(200);
      expect((await send("PUT", `/api/memory/evidence/${id}`, evidenceBody)).status).toBe(409);
      expect((await send("DELETE", `/api/memory/evidence/${id}`)).status).toBe(409);
    } finally {
      db.close();
    }
  });
});
