import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCAL_BASE_URL } from "../core/model-connection";
import type { AppOptions } from "./app";
import { createApp } from "./app";
import { openDatabase } from "./db";

const resumeText = `
Sory Kaba
Software Engineer
Acme Corp — Lead Electrician, 2019–2024
City College — AAS
Skills: conduit bending, TypeScript
`.repeat(2);

function setup(extract?: AppOptions["extract"]) {
  const db = openDatabase(":memory:");
  const uploadsDir = mkdtempSync(join(tmpdir(), "proforna-uploads-"));
  const app = createApp(db, { uploadsDir, extract });
  return {
    db,
    app,
    close() {
      db.close();
      rmSync(uploadsDir, { recursive: true, force: true });
    },
  };
}

async function saveLocalModel(
  app: ReturnType<typeof createApp>,
  model = "llama3.2",
) {
  await app.request("/api/models", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      hosting: "local",
      baseUrl: DEFAULT_LOCAL_BASE_URL,
      model,
    }),
  });
}

describe("resume extract HTTP", () => {
  it("refuses extract when no model is connected", async () => {
    const ctx = setup();
    try {
      const form = new FormData();
      form.append("file", new File([resumeText], "cv.txt", { type: "text/plain" }));
      const res = await ctx.app.request("/api/resumes/extract", {
        method: "POST",
        body: form,
      });
      expect(res.status).toBe(400);
    } finally {
      ctx.close();
    }
  });

  it("extracts jobs from a text resume through the saved model", async () => {
    const ctx = setup({
      complete: async () => ({
        model: "llama3.2",
        text: JSON.stringify({
          profile: { headline: "Software Engineer" },
          experience: [{ company: "Acme Corp", title: "Lead Electrician" }],
          education: [{ institution: "City College", degree: "AAS" }],
          skills: ["TypeScript"],
        }),
      }),
    });
    try {
      await saveLocalModel(ctx.app);
      const form = new FormData();
      form.append("file", new File([resumeText], "cv.txt", { type: "text/plain" }));
      const res = await ctx.app.request("/api/resumes/extract", {
        method: "POST",
        body: form,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        model: string;
        data: { experience: Array<{ company: string }> };
      };
      expect(body.model).toBe("llama3.2");
      expect(body.data.experience[0]?.company).toBe("Acme Corp");

      const saved = await ctx.app.request("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body.data),
      });
      expect(saved.status).toBe(201);
      await expect(saved.json()).resolves.toMatchObject({
        jobs: 1,
        schools: 1,
        skills: 1,
      });
    } finally {
      ctx.close();
    }
  });

  it("cancels extract when the request is aborted", async () => {
    let sawAbort = false;
    let started!: () => void;
    const startedAt = new Promise<void>((resolve) => {
      started = resolve;
    });
    const ctx = setup({
      complete: async (input) => {
        started();
        await new Promise<void>((resolve, reject) => {
          const fail = () => {
            sawAbort = true;
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          };
          if (input.signal?.aborted) {
            fail();
            return;
          }
          const timer = setTimeout(resolve, 5_000);
          input.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            fail();
          });
        });
        return { model: "llama3.2", text: "{}" };
      },
    });
    try {
      await saveLocalModel(ctx.app);
      const form = new FormData();
      form.append(
        "file",
        new File([resumeText], "cv.txt", { type: "text/plain" }),
      );
      const abort = new AbortController();
      const pending = ctx.app.request("/api/resumes/extract", {
        method: "POST",
        body: form,
        signal: abort.signal,
      });
      await startedAt;
      abort.abort();
      const res = await pending;
      expect(sawAbort).toBe(true);
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({
        error: "Extract cancelled.",
      });
    } finally {
      ctx.close();
    }
  });
});
