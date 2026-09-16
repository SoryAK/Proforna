import { Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import { PRODUCT } from "../core/index";
import { pingDatabase } from "./db";

export function createApp(db: DatabaseSync): Hono {
  const app = new Hono();

  app.get("/api/health", (c) =>
    c.json({ ok: true, product: PRODUCT.name, db: pingDatabase(db) }),
  );

  return app;
}
