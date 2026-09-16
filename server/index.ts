import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { createApp } from "./app";
import { openDatabase } from "./db";

const db = openDatabase(process.env.DATABASE_PATH ?? "data/proforna.sqlite");
const app = createApp(db, {
  uploadsDir: process.env.UPLOADS_DIR ?? "data/uploads",
});

if (existsSync("web/dist")) {
  app.use("/*", serveStatic({ root: "web/dist" }));
}

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port });
console.log(`Proforna http://localhost:${port}`);
