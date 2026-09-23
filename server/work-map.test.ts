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
