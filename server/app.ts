import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import { PRODUCT } from "../core/index";
import { pingDatabase } from "./db";
import { ensureOccupant, readProfile } from "./occupant";
import { completeOnboarding, saveFullName, storeResume } from "./profile";

export type AppOptions = {
  uploadsDir?: string;
};

export function createApp(db: DatabaseSync, options: AppOptions = {}): Hono {
  const uploadsDir = options.uploadsDir ?? "data/uploads";
  const app = new Hono();

  app.get("/api/health", (c) =>
    c.json({ ok: true, product: PRODUCT.name, db: pingDatabase(db) }),
  );

  app.get("/api/me", (c) => {
    const occupant = ensureOccupant(db);
    const profile = readProfile(db, occupant.id);
    return c.json({ occupant, profile });
  });

  app.put("/api/profile", async (c) => {
    const occupant = ensureOccupant(db);
    const body = (await c.req.json()) as { fullName?: unknown };
    const fullName = typeof body.fullName === "string" ? body.fullName : "";
    try {
      const profile = saveFullName(db, occupant.id, fullName);
      return c.json({ occupant, profile });
    } catch (err) {
      if (err instanceof Error && err.message === "name-required") {
        return c.json({ error: "A name is required." }, 400);
      }
      throw err;
    }
  });

  app.post("/api/onboarding/complete", (c) => {
    const occupant = ensureOccupant(db);
    try {
      const profile = completeOnboarding(db, occupant.id);
      return c.json({ occupant, profile });
    } catch (err) {
      if (err instanceof Error && err.message === "name-required") {
        return c.json({ error: "A name is required." }, 400);
      }
      throw err;
    }
  });

  app.post("/api/resumes", async (c) => {
    const occupant = ensureOccupant(db);
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return c.json({ error: "A resume file is required." }, 400);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const resume = storeResume(db, occupant.id, uploadsDir, {
      name: file.name,
      bytes,
    });
    return c.json({ resume }, 201);
  });

  return app;
}
