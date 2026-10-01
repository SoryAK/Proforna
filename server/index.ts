import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "./app";
import { openDatabase } from "./db";
import { createHttpProjectionRelay } from "./relay-client";

loadSignInEnv();

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

const staticRoot = process.env.PROFORNA_STATIC_ROOT ?? "web/dist";
if (existsSync(staticRoot)) {
  app.use("/*", serveStatic({ root: staticRoot }));
}

function loadSignInEnv() {
  for (const path of [join(process.cwd(), ".env"), join(process.cwd(), "..", "nango", "proforna.env")]) {
    loadSignInFile(path);
  }
}

function loadSignInFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq);
    if (!key.startsWith("NANGO_") || process.env[key]) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST;
serve(hostname ? { fetch: app.fetch, port, hostname } : { fetch: app.fetch, port });
console.log(`Proforna http://${hostname ?? "localhost"}:${port}`);
