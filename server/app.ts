import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import { PRODUCT } from "../core/index";
import { pingDatabase } from "./db";
import { ensureOccupant, readProfile } from "./occupant";

export function createApp(db: DatabaseSync): Hono {
  const app = new Hono();

  app.get("/api/health", (c) =>
    c.json({ ok: true, product: PRODUCT.name, db: pingDatabase(db) }),
  );

  app.get("/api/me", (c) => {
    const occupant = ensureOccupant(db);
    const profile = readProfile(db, occupant.id);
    return c.json({ occupant, profile });
  });

  return app;
}
