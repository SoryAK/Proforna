import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import { PRODUCT } from "../core/index";
import { isHttpUrl, normalizeBaseUrl } from "../core/model-connection";
import { parseExtractedResume } from "../core/resume-extract";
import { listOpenAiCompatModels } from "./openai-compat";
import { pingDatabase } from "./db";
import { loadCareerFile, saveExtractedResume } from "./history";
import { ensureOccupant, readProfile } from "./occupant";
import {
  ModelConnectionError,
  listModelConnections,
  saveModelConnection,
} from "./models";
import {
  ProfileError,
  completeOnboarding,
  loadAvatar,
  saveProfile,
  storeAvatar,
  storeResume,
} from "./profile";
import {
  ResumeExtractError,
  extractResumeFromFile,
  type ResumeExtractDeps,
} from "./resume-extract";

export type AppOptions = {
  uploadsDir?: string;
  extract?: ResumeExtractDeps;
};

export function createApp(db: DatabaseSync, options: AppOptions = {}): Hono {
  const uploadsDir = options.uploadsDir ?? "data/uploads";
  const extractDeps = options.extract ?? {};
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
    const body = (await c.req.json()) as Record<string, unknown>;
    try {
      const profile = saveProfile(db, occupant.id, body);
      return c.json({ occupant, profile });
    } catch (err) {
      if (err instanceof ProfileError) {
        const messages: Record<string, string> = {
          "name-required": "A name is required.",
          "url-invalid": "Use an http(s) URL for LinkedIn, GitHub, or portfolio.",
        };
        return c.json({ error: messages[err.code] ?? "Could not save." }, 400);
      }
      throw err;
    }
  });

  app.post("/api/profile/avatar", async (c) => {
    const occupant = ensureOccupant(db);
    const form = await c.req.formData();
    const file = form.get("avatar");
    if (!(file instanceof File)) {
      return c.json({ error: "A photo file is required." }, 400);
    }
    try {
      const profile = storeAvatar(db, occupant.id, uploadsDir, {
        type: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
      return c.json({ occupant, profile }, 201);
    } catch (err) {
      if (err instanceof ProfileError) {
        const messages: Record<string, string> = {
          "avatar-type": "Use a jpeg, png, webp, or gif photo.",
          "avatar-too-large": "That photo is too large (5 MB max).",
        };
        return c.json({ error: messages[err.code] ?? "Could not save." }, 400);
      }
      throw err;
    }
  });

  app.get("/api/profile/avatar", (c) => {
    const occupant = ensureOccupant(db);
    const avatar = loadAvatar(db, occupant.id, uploadsDir);
    if (!avatar) return c.json({ error: "No photo yet." }, 404);
    return c.body(Buffer.from(avatar.bytes), 200, {
      "content-type": avatar.type,
    });
  });

  app.post("/api/onboarding/complete", (c) => {
    const occupant = ensureOccupant(db);
    try {
      const profile = completeOnboarding(db, occupant.id);
      return c.json({ occupant, profile });
    } catch (err) {
      if (err instanceof ProfileError && err.code === "name-required") {
        return c.json({ error: "A name is required." }, 400);
      }
      throw err;
    }
  });

  app.get("/api/models", (c) => {
    const occupant = ensureOccupant(db);
    return c.json({ connections: listModelConnections(db, occupant.id) });
  });

  app.post("/api/models/discover", async (c) => {
    const body = (await c.req.json()) as { baseUrl?: unknown; apiKey?: unknown };
    const baseUrl = normalizeBaseUrl(body.baseUrl);
    if (!baseUrl || !isHttpUrl(baseUrl)) {
      return c.json({ error: "A valid http(s) URL is required." }, 400);
    }
    const apiKey =
      typeof body.apiKey === "string" && body.apiKey.trim()
        ? body.apiKey.trim()
        : null;
    const result = await listOpenAiCompatModels({ baseUrl, apiKey });
    if (!result.ok) {
      return c.json({ error: result.error }, 422);
    }
    return c.json({ models: result.models });
  });

  app.post("/api/models", async (c) => {
    const occupant = ensureOccupant(db);
    const body = (await c.req.json()) as Record<string, unknown>;
    try {
      const connection = saveModelConnection(db, occupant.id, body);
      return c.json({ connection }, 201);
    } catch (err) {
      if (err instanceof ModelConnectionError) {
        const messages: Record<string, string> = {
          "hosting-required": "Choose local or cloud.",
          "url-required": "A base URL is required.",
          "url-invalid": "That does not look like an http(s) URL.",
          "key-required": "A cloud connection needs an API key.",
        };
        return c.json({ error: messages[err.code] ?? "Could not save." }, 400);
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

  app.post("/api/resumes/extract", async (c) => {
    const occupant = ensureOccupant(db);
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return c.json({ error: "A resume file is required." }, 400);
    }
    try {
      const result = await extractResumeFromFile(
        db,
        occupant.id,
        {
          name: file.name,
          type: file.type,
          bytes: new Uint8Array(await file.arrayBuffer()),
        },
        extractDeps,
      );
      return c.json(result);
    } catch (err) {
      if (err instanceof ResumeExtractError) {
        return c.json({ error: err.message }, err.status);
      }
      throw err;
    }
  });

  app.get("/api/history", (c) => {
    const occupant = ensureOccupant(db);
    return c.json(loadCareerFile(db, occupant.id));
  });

  app.post("/api/history", async (c) => {
    const occupant = ensureOccupant(db);
    const body: unknown = await c.req.json();
    const extracted = parseExtractedResume(body);
    if (!extracted) {
      return c.json({ error: "Could not read that extract." }, 400);
    }
    const saved = saveExtractedResume(db, occupant.id, extracted);
    return c.json({ ok: true, ...saved }, 201);
  });

  return app;
}
