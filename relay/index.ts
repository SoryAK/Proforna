import { serve } from "@hono/node-server";
import { createRelayApp } from "./app";
import { openRelayDatabase } from "./db";

const ownerToken = process.env.RELAY_OWNER_TOKEN;
if (!ownerToken) {
  throw new Error("RELAY_OWNER_TOKEN is required.");
}

const db = openRelayDatabase(
  process.env.RELAY_DATABASE_PATH ?? "data/relay.sqlite",
);
const port = Number(process.env.RELAY_PORT ?? 3100);
const app = createRelayApp(db, ownerToken);

serve({ fetch: app.fetch, port });
console.log(`Proforna relay http://localhost:${port}`);
