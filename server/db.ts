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
    );
    CREATE TABLE IF NOT EXISTS profiles (
      occupant_id TEXT PRIMARY KEY REFERENCES occupants(id),
      full_name TEXT NOT NULL DEFAULT '',
      onboarding_completed_at TEXT,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

export function pingDatabase(db: DatabaseSync): "ok" {
  db.prepare("SELECT 1 AS n").get();
  return "ok";
}
