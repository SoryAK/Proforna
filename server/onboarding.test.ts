import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { openDatabase } from "./db";

function setup() {
  const db = openDatabase(":memory:");
  const uploadsDir = mkdtempSync(join(tmpdir(), "proforna-uploads-"));
  const app = createApp(db, { uploadsDir });
  return {
    db,
    app,
    uploadsDir,
    close() {
      db.close();
      rmSync(uploadsDir, { recursive: true, force: true });
    },
  };
}

describe("onboarding HTTP", () => {
  it("rejects a blank profile name", async () => {
    const ctx = setup();
    try {
      const res = await ctx.app.request("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName: "   " }),
      });
      expect(res.status).toBe(400);
    } finally {
      ctx.close();
    }
  });

  it("saves a name then the wizard can finish without a resume", async () => {
    const ctx = setup();
    try {
      const saved = await ctx.app.request("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName: "Ada Lovelace" }),
      });
      expect(saved.status).toBe(200);
      await expect(saved.json()).resolves.toMatchObject({
        profile: { fullName: "Ada Lovelace", onboardingCompletedAt: null },
      });

      const early = await ctx.app.request("/api/onboarding/complete", {
        method: "POST",
      });
      expect(early.status).toBe(200);
      const done = (await early.json()) as {
        profile: { onboardingCompletedAt: string | null };
      };
      expect(done.profile.onboardingCompletedAt).toBeTruthy();
    } finally {
      ctx.close();
    }
  });

  it("refuses to complete without a name", async () => {
    const ctx = setup();
    try {
      const res = await ctx.app.request("/api/onboarding/complete", {
        method: "POST",
      });
      expect(res.status).toBe(400);
    } finally {
      ctx.close();
    }
  });

  it("stores an optional resume file", async () => {
    const ctx = setup();
    try {
      await ctx.app.request("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName: "Ada Lovelace" }),
      });
      const form = new FormData();
      form.append(
        "file",
        new File(["%PDF-1.4 resume"], "cv.pdf", { type: "application/pdf" }),
      );
      const res = await ctx.app.request("/api/resumes", {
        method: "POST",
        body: form,
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { resume: { originalName: string } };
      expect(body.resume.originalName).toBe("cv.pdf");
    } finally {
      ctx.close();
    }
  });
});
