import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { createApp } from "./app";
import { openDatabase } from "./db";
import { createHttpProjectionRelay } from "./relay-client";

const db = openDatabase(process.env.DATABASE_PATH ?? "data/proforna.sqlite");
const relay =
  process.env.RELAY_URL && process.env.RELAY_OWNER_TOKEN
    ? createHttpProjectionRelay(
        process.env.RELAY_URL,
        process.env.RELAY_OWNER_TOKEN,
      )
    : undefined;
const app = createApp(db, {
  uploadsDir: process.env.UPLOADS_DIR ?? "data/uploads",
  relay,
});

if (existsSync("web/dist")) {
  app.use("/*", serveStatic({ root: "web/dist" }));
}

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port });
console.log(`Proforna http://localhost:${port}`);
