import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openDatabase(path: string): DatabaseSync {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS occupants (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      occupant_id TEXT PRIMARY KEY REFERENCES occupants(id),
      full_name TEXT NOT NULL DEFAULT '',
      onboarding_completed_at TEXT,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS resumes (
      id TEXT PRIMARY KEY,
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS model_connections (
      id TEXT PRIMARY KEY,
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      hosting TEXT NOT NULL,
      base_url TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT '',
      api_key TEXT,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_history (
      id TEXT PRIMARY KEY,
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      start_date TEXT NOT NULL DEFAULT '',
      end_date TEXT NOT NULL DEFAULT '',
      is_current INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL DEFAULT '',
      achievements_json TEXT NOT NULL DEFAULT '[]',
      degree TEXT NOT NULL DEFAULT '',
      field TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  return db;
}

export function pingDatabase(db: DatabaseSync): "ok" {
  db.prepare("SELECT 1 AS n").get();
  return "ok";
}
