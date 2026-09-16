import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

function appWithMemoryDb() {
  const db = openDatabase(":memory:");
  return { db, app: createApp(db) };
}

describe("GET /api/me", () => {
  it("admits the local occupant without a login", async () => {
    const { db, app } = appWithMemoryDb();
    try {
      const res = await app.request("/api/me");
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        occupant: { id: "local" },
        profile: {
          fullName: "",
          headline: "",
          city: "",
          state: "",
          bio: "",
          linkedinUrl: "",
          githubUrl: "",
          portfolioUrl: "",
          avatarUrl: null,
          onboardingCompletedAt: null,
        },
      });
    } finally {
      db.close();
    }
  });

  it("returns the same occupant on a later request", async () => {
    const { db, app } = appWithMemoryDb();
    try {
      await app.request("/api/me");
      const res = await app.request("/api/me");
      const body = (await res.json()) as { occupant: { id: string } };
      expect(body.occupant.id).toBe("local");
      const count = db.prepare("SELECT COUNT(*) AS n FROM occupants").get() as {
        n: number;
      };
      expect(count.n).toBe(1);
    } finally {
      db.close();
    }
  });
});
