import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openRelayDatabase(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS relay_publications (
      slug TEXT PRIMARY KEY,
      projection_json TEXT NOT NULL,
      visibility TEXT NOT NULL,
      expires_at TEXT,
      published_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE TABLE IF NOT EXISTS relay_grants (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL REFERENCES relay_publications(slug),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE TABLE IF NOT EXISTS relay_requests (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      requester_name TEXT NOT NULL,
      requester_email TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS relay_events (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      event_type TEXT NOT NULL,
      section TEXT,
      occurred_at TEXT NOT NULL
    );
  `);
  return db;
}
