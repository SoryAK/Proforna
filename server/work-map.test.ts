import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

describe("Work Map career-fact HTTP seam", () => {
  it("attaches subject-linked facts on read and writes them when a role is saved", async () => {
    const db = openDatabase(":memory:");
    const app = createApp(db, {
      places: {
        lookup: async () => ({
          label: "Home",
          address: "12 Private Lane",
          latitude: 12.345678,
          longitude: -98.765432,
        }),
      },
    });
    try {
      await app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          experience: [
            {
              company: "Acme",
              title: "Lead",
              isCurrent: true,
              achievements: ["Cut recovery from 42 to 11 minutes."],
            },
          ],
        }),
      });

      const workMap = (await (
        await app.request("/api/work-map")
      ).json()) as {
        roles: Array<{
          id: string;
          factId: string | null;
          claims: Array<{ text: string; factId: string }>;
        }>;
      };
      expect(workMap.roles[0].factId).toEqual(expect.any(String));
      expect(workMap.roles[0].claims).toEqual([
        expect.objectContaining({
          text: "Cut recovery from 42 to 11 minutes.",
        }),
      ]);

      const saved = await app.request(
        `/api/work-map/roles/${workMap.roles[0].id}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: "Principal",
            achievements: [
              "Cut recovery from 42 to 11 minutes.",
              "Mentored the night shift.",
            ],
          }),
        },
      );
      expect(saved.status).toBe(200);
      const body = (await saved.json()) as {
        role: {
          factId: string;
          factVersion: number;
          claims: Array<{ text: string }>;
        };
      };
      expect(body.role.factVersion).toBe(2);
      expect(body.role.claims.map((claim) => claim.text)).toEqual([
        "Cut recovery from 42 to 11 minutes.",
        "Mentored the night shift.",
      ]);

      const memory = (await (await app.request("/api/memory")).json()) as {
        evidence: Array<{ id: string; sourceType: string }>;
        facts: Array<{
          factType: string;
          subjectId: string;
          status: string;
          evidenceIds: string[];
          value: Record<string, unknown>;
        }>;
      };
      expect(memory.evidence.some((item) => item.sourceType === "work-map")).toBe(
        true,
      );
      const workMapEvidenceIds = new Set(
        memory.evidence
          .filter((item) => item.sourceType === "work-map")
          .map((item) => item.id),
      );
      expect(
        memory.facts.some(
          (fact) =>
            fact.factType === "role" &&
            fact.subjectId === workMap.roles[0].id &&
            fact.status === "canonical" &&
            fact.value.title === "Principal",
        ),
      ).toBe(true);
      expect(
        memory.facts.some(
          (fact) =>
            fact.factType === "achievement" &&
            fact.subjectId === workMap.roles[0].id &&
            fact.status === "canonical" &&
            fact.value.statement === "Mentored the night shift." &&
            fact.evidenceIds.some((id) => workMapEvidenceIds.has(id)),
        ),
      ).toBe(true);

      await app.request("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: "Ada Lovelace",
          address: "12 Private Lane",
        }),
      });
      const mapped = (await (await app.request("/api/work-map")).json()) as {
        profile: { addressLatitude: number | null; addressLongitude: number | null };
      };
      expect(mapped.profile.addressLatitude).toBe(12.345678);
      expect(mapped.profile.addressLongitude).toBe(-98.765432);
      await app.request("/api/work-map/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: "fact-link",
          visibility: "unlisted",
          sections: ["profile", "history"],
        }),
      });
      const published = await app.request("/api/work-map/publish", {
        method: "POST",
      });
      expect(published.status).toBe(201);
      const snapshot = (await published.json()) as {
        projection: { roles: Array<Record<string, unknown>> };
      };
      const publishedJson = JSON.stringify(snapshot.projection);
      expect(publishedJson).not.toContain("12 Private Lane");
      expect(publishedJson).not.toContain("12.345678");
      expect(publishedJson).not.toContain("factId");
      expect(publishedJson).not.toContain("evidenceIds");
      expect(publishedJson).not.toContain(body.role.factId);
    } finally {
      db.close();
    }
  });
});

describe("Linked Evidence HTTP seam", () => {
  const reviewHtml = `<html><head>
    <title>Fold review</title>
    <meta property="og:title" content="The crease is finally gone">
    <meta property="og:site_name" content="Reviews Weekly">
    <meta property="article:published_time" content="2026-08-14T09:00:00Z">
  </head><body><p>You cannot feel the fold anymore.</p></body></html>`;

  it("adds, reads, edits, publishes, and removes evidence linked to a role", async () => {
    const db = openDatabase(":memory:");
    const fetched: string[] = [];
    const app = createApp(db, {
      pages: {
        fetch: async (url) => {
          fetched.push(url);
          if (url.includes("offline")) throw new Error("unreachable");
          return { url, contentType: "text/html", html: reviewHtml };
        },
      },
    });
    const json = (method: string, body: unknown) => ({
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const readMemory = async () =>
      (await (await app.request("/api/memory")).json()) as {
        evidence: Array<{ id: string; sourceType: string; content: { text?: string } }>;
        facts: Array<{
          factType: string;
          status: string;
          evidenceIds: string[];
          value: { statement?: string };
        }>;
      };
    const achievementEvidence = async () =>
      (await readMemory()).facts.find(
        (fact) =>
          fact.factType === "achievement" &&
          fact.status === "canonical" &&
          fact.value.statement === "Solved the hinge crease.",
      )?.evidenceIds ?? [];
    try {
      await app.request(
        "/api/history",
        json("POST", {
          experience: [
            {
              company: "Acme",
              title: "Product Engineer",
              isCurrent: true,
              achievements: ["Solved the hinge crease."],
            },
          ],
        }),
      );
      const roleId = (
        (await (await app.request("/api/work-map")).json()) as {
          roles: Array<{ id: string }>;
        }
      ).roles[0].id;

      const lookedUp = await app.request(
        "/api/work-map/linked-evidence/lookup",
        json("POST", { url: "https://reviews.example/fold" }),
      );
      expect(lookedUp.status).toBe(200);
      await expect(lookedUp.json()).resolves.toEqual({
        fields: {
          title: "The crease is finally gone",
          outlet: "Reviews Weekly",
          publishedOn: "2026-08-14",
          kind: "article",
        },
      });
      const refused = await app.request(
        "/api/work-map/linked-evidence/lookup",
        json("POST", { url: "file:///etc/passwd" }),
      );
      expect(refused.status).toBe(400);

      const created = await app.request(
        `/api/work-map/roles/${roleId}/linked-evidence`,
        json("POST", {
          url: "https://reviews.example/fold",
          title: "The crease is finally gone",
          outlet: "Reviews Weekly",
          publishedOn: "2026-08-14",
          kind: "review",
          contribution: "Designed the hinge fix.",
          credit: "about-my-work",
          pin: { kind: "achievement", statement: "Solved the hinge crease." },
          isPublic: true,
        }),
      );
      expect(created.status).toBe(201);
      const { linkedEvidence } = (await created.json()) as {
        linkedEvidence: { id: string; evidenceId: string | null };
      };
      expect(linkedEvidence.evidenceId).toEqual(expect.any(String));
      const capture = (await readMemory()).evidence.find(
        (item) => item.id === linkedEvidence.evidenceId,
      );
      expect(capture).toMatchObject({ sourceType: "link" });
      expect(capture?.content.text).toContain("You cannot feel the fold anymore.");
      expect(await achievementEvidence()).toContain(linkedEvidence.evidenceId);

      const invalid = await app.request(
        `/api/work-map/roles/${roleId}/linked-evidence`,
        json("POST", { url: "https://reviews.example/x", title: "x", kind: "review", credit: "maybe" }),
      );
      expect(invalid.status).toBe(400);
      await expect(invalid.json()).resolves.toEqual({ error: "credit-invalid" });

      await app.request(
        "/api/work-map/settings",
        json("PUT", { slug: "linked", visibility: "unlisted", sections: ["history", "evidence"] }),
      );
      const preview = (await (await app.request("/api/work-map/preview")).json()) as {
        snapshot: { roles: Array<{ linkedEvidence: Array<{ title: string }> }> };
      };
      expect(preview.snapshot.roles[0].linkedEvidence).toEqual([
        expect.objectContaining({ title: "The crease is finally gone" }),
      ]);
      expect(JSON.stringify(preview.snapshot)).not.toContain(String(linkedEvidence.evidenceId));

      const fetchesBeforeEdit = fetched.length;
      const edited = await app.request(
        `/api/work-map/roles/${roleId}/linked-evidence/${linkedEvidence.id}`,
        json("PUT", {
          url: "https://reviews.example/fold",
          title: "Hands on: the crease is gone",
          kind: "review",
          credit: "about-my-work",
          pin: null,
          isPublic: false,
        }),
      );
      expect(edited.status).toBe(200);
      expect(fetched.length).toBe(fetchesBeforeEdit);
      await expect(edited.json()).resolves.toMatchObject({
        linkedEvidence: {
          title: "Hands on: the crease is gone",
          evidenceId: linkedEvidence.evidenceId,
          pin: null,
        },
      });
      expect(await achievementEvidence()).not.toContain(linkedEvidence.evidenceId);

      const offline = await app.request(
        `/api/work-map/roles/${roleId}/linked-evidence`,
        json("POST", {
          url: "https://offline.example/talk",
          title: "Demo day",
          kind: "talk",
          credit: "names-me",
        }),
      );
      expect(offline.status).toBe(201);
      await expect(offline.json()).resolves.toMatchObject({
        linkedEvidence: { evidenceId: null },
      });

      const afterEdit = (await (await app.request("/api/work-map")).json()) as {
        roles: Array<{ linkedEvidence: Array<{ id: string; title: string }> }>;
      };
      expect(afterEdit.roles[0].linkedEvidence.map((item) => item.title)).toEqual([
        "Hands on: the crease is gone",
        "Demo day",
      ]);

      const removed = await app.request(
        `/api/work-map/roles/${roleId}/linked-evidence/${linkedEvidence.id}`,
        { method: "DELETE" },
      );
      expect(removed.status).toBe(200);
      const missing = await app.request(
        `/api/work-map/roles/${roleId}/linked-evidence/${linkedEvidence.id}`,
        { method: "DELETE" },
      );
      expect(missing.status).toBe(404);
      const afterRemove = (await (await app.request("/api/work-map")).json()) as {
        roles: Array<{ linkedEvidence: Array<{ title: string }> }>;
      };
      expect(afterRemove.roles[0].linkedEvidence.map((item) => item.title)).toEqual([
        "Demo day",
      ]);
    } finally {
      db.close();
    }
  });
});

describe("Work Map sites HTTP seam", () => {
  it("lets the occupant add, update, and remove a work site", async () => {
    const db = openDatabase(":memory:");
    const app = createApp(db);
    try {
      await app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          experience: [{ company: "Acme", title: "Lead", isCurrent: true }],
        }),
      });
      const workMap = (await (
        await app.request("/api/work-map")
      ).json()) as { roles: Array<{ id: string }> };
      const roleId = workMap.roles[0].id;
      const created = await app.request(`/api/work-map/roles/${roleId}/locations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: "Main plant",
          address: "Dayton, OH",
          latitude: 39.75,
          longitude: -84.19,
          kind: "primary",
        }),
      });
      expect(created.status).toBe(201);
      const body = (await created.json()) as { location: { id: string } };
      const updated = await app.request(
        `/api/work-map/roles/${roleId}/locations/${body.location.id}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            label: "North cell",
            address: "123 Factory Rd, Dayton, OH",
            latitude: 39.76,
            longitude: -84.2,
            kind: "site",
            isPublic: true,
          }),
        },
      );
      expect(updated.status).toBe(200);
      const afterUpdate = (await (
        await app.request("/api/work-map")
      ).json()) as {
        roles: Array<{
          locations: Array<{
            label: string;
            address: string;
            kind: string;
            isPublic: boolean;
          }>;
        }>;
      };
      expect(afterUpdate.roles[0].locations).toEqual([
        expect.objectContaining({
          label: "North cell",
          address: "123 Factory Rd, Dayton, OH",
          kind: "site",
          isPublic: true,
        }),
      ]);
      const removed = await app.request(
        `/api/work-map/roles/${roleId}/locations/${body.location.id}`,
        { method: "DELETE" },
      );
      expect(removed.status).toBe(200);
      const afterRemove = (await (
        await app.request("/api/work-map")
      ).json()) as { roles: Array<{ locations: unknown[] }> };
      expect(afterRemove.roles[0].locations).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("looks up an address into a work site pin", async () => {
    const db = openDatabase(":memory:");
    const app = createApp(db, {
      places: {
        lookup: async (query) =>
          query.includes("Dayton")
            ? {
                label: "Acme Robotics",
                address: "Acme Robotics, Dayton, OH, United States",
                latitude: 39.7589,
                longitude: -84.1916,
              }
            : null,
      },
    });
    try {
      const found = await app.request("/api/work-map/places?q=Dayton%20OH");
      expect(found.status).toBe(200);
      await expect(found.json()).resolves.toEqual({
        place: {
          label: "Acme Robotics",
          address: "Acme Robotics, Dayton, OH, United States",
          latitude: 39.7589,
          longitude: -84.1916,
        },
        places: [
          {
            label: "Acme Robotics",
            address: "Acme Robotics, Dayton, OH, United States",
            latitude: 39.7589,
            longitude: -84.1916,
          },
        ],
        source: "openstreetmap",
        googleLookup: "unused",
      });
      const missing = await app.request("/api/work-map/places?q=nowhere");
      expect(missing.status).toBe(404);
      const empty = await app.request("/api/work-map/places?q=");
      expect(empty.status).toBe(400);
    } finally {
      db.close();
    }
  });
});

describe("Work Map role create HTTP seam", () => {
  it("creates a role for a Career History kind", async () => {
    const db = openDatabase(":memory:");
    const app = createApp(db);
    try {
      const created = await app.request("/api/work-map/roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "internship" }),
      });
      expect(created.status).toBe(201);
      const body = (await created.json()) as {
        role: { id: string; kind: string; title: string; organization: string };
      };
      expect(body.role.kind).toBe("internship");
      expect(body.role.title).toBe("");
      expect(body.role.organization).toBe("");

      const map = (await (await app.request("/api/work-map")).json()) as {
        roles: Array<{ id: string; kind: string }>;
      };
      expect(map.roles).toEqual([
        expect.objectContaining({ id: body.role.id, kind: "internship" }),
      ]);

      const rejected = await app.request("/api/work-map/roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "gig" }),
      });
      expect(rejected.status).toBe(400);
      await expect(rejected.json()).resolves.toEqual({ error: "kind-invalid" });
    } finally {
      db.close();
    }
  });

  it("lets an occupant change a role between job, internship, and education", async () => {
    const db = openDatabase(":memory:");
    const app = createApp(db);
    try {
      const created = await app.request("/api/work-map/roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "job" }),
      });
      const body = (await created.json()) as { role: { id: string } };
      const saved = await app.request(`/api/work-map/roles/${body.role.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "internship",
          title: "Robotics Research Intern",
          organization: "Widener University",
        }),
      });
      expect(saved.status).toBe(200);
      await expect(saved.json()).resolves.toEqual({
        role: expect.objectContaining({
          id: body.role.id,
          kind: "internship",
          title: "Robotics Research Intern",
          organization: "Widener University",
        }),
      });

      const rejected = await app.request(`/api/work-map/roles/${body.role.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "gig" }),
      });
      expect(rejected.status).toBe(400);
      await expect(rejected.json()).resolves.toEqual({ error: "kind-invalid" });
    } finally {
      db.close();
    }
  });

  it("removes one role and leaves its copies", async () => {
    const db = openDatabase(":memory:");
    const app = createApp(db);
    try {
      const first = await app.request("/api/work-map/roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "job", title: "Technician", organization: "Giants Direct" }),
      });
      const second = await app.request("/api/work-map/roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "job", title: "Technician", organization: "Giants Direct" }),
      });
      const removedId = ((await first.json()) as { role: { id: string } }).role.id;
      const keptId = ((await second.json()) as { role: { id: string } }).role.id;
      const located = await app.request(`/api/work-map/roles/${removedId}/locations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: "Plant",
          address: "Lancaster, PA",
          latitude: 40.04,
          longitude: -76.3,
          kind: "primary",
        }),
      });
      expect(located.status).toBe(201);

      const removed = await app.request(`/api/work-map/roles/${removedId}`, {
        method: "DELETE",
      });
      expect(removed.status).toBe(200);
      const map = (await (await app.request("/api/work-map")).json()) as {
        roles: Array<{ id: string; locations: unknown[] }>;
      };
      expect(map.roles.map((role) => role.id)).toEqual([keptId]);

      const missing = await app.request(`/api/work-map/roles/${removedId}`, {
        method: "DELETE",
      });
      expect(missing.status).toBe(404);
      await expect(missing.json()).resolves.toEqual({ error: "role-missing" });
    } finally {
      db.close();
    }
  });

  it("stores a role photo privately and serves it for the map", async () => {
    const db = openDatabase(":memory:");
    const uploadsDir = mkdtempSync(join(tmpdir(), "proforna-role-photo-"));
    const app = createApp(db, { uploadsDir });
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    try {
      const created = await app.request("/api/work-map/roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "job", title: "Technician" }),
      });
      const { role } = (await created.json()) as { role: { id: string } };
      const form = new FormData();
      form.set("photo", new File([png], "cell.png", { type: "image/png" }));
      const saved = await app.request(`/api/work-map/roles/${role.id}/photos`, {
        method: "POST",
        body: form,
      });
      expect(saved.status).toBe(201);
      const body = (await saved.json()) as {
        media: { id: string; url: string; isPublic: boolean; kind: string };
      };
      expect(body.media).toMatchObject({
        kind: "photo",
        isPublic: false,
        url: `/api/work-map/media/${body.media.id}`,
      });

      const served = await app.request(body.media.url);
      expect(served.status).toBe(200);
      expect(served.headers.get("content-type")).toBe("image/png");

      const workMap = (await (await app.request("/api/work-map")).json()) as {
        roles: Array<{ media: Array<{ url: string; isPublic: boolean }> }>;
      };
      expect(workMap.roles[0]?.media).toEqual([
        expect.objectContaining({ url: body.media.url, isPublic: false }),
      ]);
    } finally {
      db.close();
      rmSync(uploadsDir, { recursive: true, force: true });
    }
  });
});

describe("achievement identity", () => {
  it("keeps the same id when an achievement line changes", async () => {
    const db = openDatabase(":memory:");
    const app = createApp(db, {
      places: {
        lookup: async () => ({
          label: "Home",
          address: "12 Private Lane",
          latitude: 12.345678,
          longitude: -98.765432,
        }),
      },
    });
    try {
      await app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          experience: [
            {
              company: "Acme",
              title: "Lead",
              isCurrent: true,
              achievements: ["Cut recovery from 42 to 11 minutes."],
            },
          ],
        }),
      });
      const first = (await (await app.request("/api/work-map")).json()) as {
        roles: Array<{ id: string; achievements: string[]; achievementIds: string[] }>;
      };
      const role = first.roles[0];
      expect(role?.achievements).toEqual(["Cut recovery from 42 to 11 minutes."]);
      expect(role?.achievementIds?.[0]).toEqual(expect.any(String));
      const again = (await (await app.request("/api/work-map")).json()) as typeof first;
      expect(again.roles[0]?.achievementIds).toEqual(role?.achievementIds);

      const saved = await app.request(`/api/work-map/roles/${role?.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          achievements: ["Cut recovery from 42 to 9 minutes."],
        }),
      });
      expect(saved.status).toBe(200);
      const body = (await saved.json()) as {
        role: { achievements: string[]; achievementIds: string[] };
      };
      expect(body.role.achievements).toEqual(["Cut recovery from 42 to 9 minutes."]);
      expect(body.role.achievementIds).toEqual(role?.achievementIds);
    } finally {
      db.close();
    }
  });
});

describe("canvas arrangement", () => {
  it("keeps a placed node on the role after the role itself is updated", async () => {
    const db = openDatabase(":memory:");
    const app = createApp(db, {
      places: {
        lookup: async () => ({
          label: "Home",
          address: "12 Private Lane",
          latitude: 12.345678,
          longitude: -98.765432,
        }),
      },
    });
    try {
      await app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          experience: [{ company: "Acme", title: "Lead", isCurrent: true }],
        }),
      });
      const workMap = (await (await app.request("/api/work-map")).json()) as {
        roles: Array<{ id: string; canvasBoards?: unknown }>;
      };
      const roleId = workMap.roles[0].id;
      expect(workMap.roles[0].canvasBoards).toBeUndefined();

      const saved = await app.request(`/api/work-map/roles/${roleId}/canvas`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          boards: [
            {
              id: roleId,
              name: "Lead",
              nodes: [{ id: "node-1", kind: "Design", title: "Hinge", x: 320, y: 140 }],
              groups: [],
            },
          ],
        }),
      });
      expect(saved.status).toBe(200);

      const renamed = await app.request(`/api/work-map/roles/${roleId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Principal" }),
      });
      expect(renamed.status).toBe(200);

      const again = (await (await app.request("/api/work-map")).json()) as {
        roles: Array<{ canvasBoards?: Array<{ nodes: Array<{ title: string; x: number; y: number }> }> }>;
      };
      expect(again.roles[0].canvasBoards?.[0].nodes).toEqual([
        expect.objectContaining({ title: "Hinge", x: 320, y: 140 }),
      ]);
    } finally {
      db.close();
    }
  });

  it("keeps a study board for every browser after save", async () => {
    const db = openDatabase(":memory:");
    const app = createApp(db, {
      places: {
        lookup: async () => ({
          label: "Home",
          address: "12 Private Lane",
          latitude: 12.345678,
          longitude: -98.765432,
        }),
      },
    });
    try {
      await app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          experience: [{ company: "Acme", title: "Lead", isCurrent: true }],
        }),
      });
      const workMap = (await (await app.request("/api/work-map")).json()) as {
        roles: Array<{ id: string }>;
        studyBoards: unknown[];
      };
      const roleId = workMap.roles[0].id;
      expect(workMap.studyBoards).toEqual([]);

      const saved = await app.request("/api/work-map/canvas", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          boards: [
            {
              id: roleId,
              name: "Lead",
              nodes: [{ id: "node-1", kind: "Design", title: "Hinge", x: 12, y: 24 }],
              groups: [],
            },
            {
              id: "sample-group",
              name: "Demo",
              nodes: [{ id: "north", kind: "Design", title: "North", x: 24, y: 48 }],
              groups: [{ id: "cluster", name: "Cluster", members: ["north", "east"], x: 24, y: 48 }],
            },
          ],
        }),
      });
      expect(saved.status).toBe(200);

      const again = (await (await app.request("/api/work-map")).json()) as {
        roles: Array<{ canvasBoards?: Array<{ nodes: Array<{ title: string }> }> }>;
        studyBoards: Array<{ id: string; name: string; nodes: Array<{ title: string }> }>;
      };
      expect(again.roles[0].canvasBoards?.[0].nodes).toEqual([
        expect.objectContaining({ title: "Hinge" }),
      ]);
      expect(again.studyBoards).toEqual([
        expect.objectContaining({
          id: "sample-group",
          name: "Demo",
          nodes: [expect.objectContaining({ title: "North" })],
        }),
      ]);
    } finally {
      db.close();
    }
  });
});
