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
    CREATE TABLE IF NOT EXISTS relay_asks (
      token_hash TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      body TEXT NOT NULL,
      from_name TEXT NOT NULL,
      from_headline TEXT NOT NULL DEFAULT '',
      recipient_name TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      opened_at TEXT,
      answered_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS relay_events (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      event_type TEXT NOT NULL,
      section TEXT,
      occurred_at TEXT NOT NULL
    );
  `);
  // Added after these tables first shipped; harmless when already present.
  for (const [table, column] of [
    ["relay_asks", "join_choice TEXT"],
    ["relay_asks", "join_json TEXT"],
    // The sections one link opens; NULL opens the whole page.
    ["relay_grants", "sections_json TEXT"],
  ]) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column}`);
    } catch {
      /* the column exists */
    }
  }
  // When each link was opened, read back by the owner for Activity.
  db.exec(`
    CREATE TABLE IF NOT EXISTS relay_grant_opens (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      opened_at TEXT NOT NULL
    );
  `);
  return db;
}
