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
  db.exec(`
    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      source_type TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      title TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      checksum TEXT NOT NULL,
      sensitivity TEXT NOT NULL,
      content_json TEXT NOT NULL,
      UNIQUE(occupant_id, source_type, source_ref)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS career_facts (
      id TEXT PRIMARY KEY,
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      fact_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      value_json TEXT NOT NULL,
      evidence_ids_json TEXT NOT NULL,
      sensitivity TEXT NOT NULL,
      version INTEGER NOT NULL,
      status TEXT NOT NULL,
      supersedes_id TEXT,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS change_sets (
      id TEXT PRIMARY KEY,
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      purpose TEXT NOT NULL,
      destination TEXT NOT NULL,
      operations_json TEXT NOT NULL,
      change_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      change_set_id TEXT NOT NULL REFERENCES change_sets(id),
      change_hash TEXT NOT NULL,
      destination TEXT NOT NULL,
      approved_by TEXT NOT NULL,
      approved_at TEXT NOT NULL,
      expires_at TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      event_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      change_set_id TEXT,
      approval_id TEXT,
      detail_json TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      purpose TEXT NOT NULL,
      capability_grant_json TEXT NOT NULL,
      inputs_json TEXT NOT NULL,
      outputs_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS worklog_entries (
      id TEXT PRIMARY KEY,
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      occurred_on TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      role_id TEXT,
      project TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_history_details (
      work_history_id TEXT PRIMARY KEY REFERENCES work_history(id),
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      details_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_history_locations (
      id TEXT PRIMARY KEY,
      work_history_id TEXT NOT NULL REFERENCES work_history(id),
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      label TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      kind TEXT NOT NULL,
      is_public INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_history_media (
      id TEXT PRIMARY KEY,
      work_history_id TEXT NOT NULL REFERENCES work_history(id),
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      caption TEXT NOT NULL DEFAULT '',
      is_public INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_map_publication_settings (
      occupant_id TEXT PRIMARY KEY REFERENCES occupants(id),
      settings_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_map_snapshots (
      id TEXT PRIMARY KEY,
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      slug TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      source_fingerprint TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS resume_variants (
      id TEXT PRIMARY KEY,
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      name TEXT NOT NULL,
      target_role TEXT NOT NULL,
      audience TEXT NOT NULL DEFAULT '',
      intent TEXT NOT NULL DEFAULT '',
      selected_fact_ids_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS resume_revisions (
      id TEXT PRIMARY KEY,
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      variant_id TEXT NOT NULL REFERENCES resume_variants(id),
      revision_number INTEGER NOT NULL,
      revision_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(variant_id, revision_number)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS interactive_projections (
      id TEXT PRIMARY KEY,
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      revision_id TEXT REFERENCES resume_revisions(id),
      snapshot_id TEXT REFERENCES work_map_snapshots(id),
      slug TEXT NOT NULL,
      visibility TEXT NOT NULL,
      projection_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(occupant_id, slug)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS publications (
      id TEXT PRIMARY KEY,
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      projection_id TEXT NOT NULL REFERENCES interactive_projections(id),
      slug TEXT NOT NULL,
      audience TEXT NOT NULL,
      published_at TEXT NOT NULL,
      expires_at TEXT,
      revoked_at TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS projection_access_requests (
      id TEXT PRIMARY KEY,
      projection_id TEXT NOT NULL REFERENCES interactive_projections(id),
      requester_name TEXT NOT NULL,
      requester_email TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL,
      opportunity_id TEXT,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS projection_access_grants (
      id TEXT PRIMARY KEY,
      projection_id TEXT NOT NULL REFERENCES interactive_projections(id),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS projection_events (
      id TEXT PRIMARY KEY,
      projection_id TEXT NOT NULL REFERENCES interactive_projections(id),
      event_type TEXT NOT NULL,
      section TEXT,
      occurred_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      organization TEXT NOT NULL,
      source_url TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      fit_summary TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      opportunity_id TEXT NOT NULL REFERENCES opportunities(id),
      resume_revision_id TEXT,
      stage TEXT NOT NULL,
      next_step TEXT NOT NULL DEFAULT '',
      deadline TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS interviews (
      id TEXT PRIMARY KEY,
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      application_id TEXT NOT NULL REFERENCES applications(id),
      kind TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS offers (
      id TEXT PRIMARY KEY,
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      application_id TEXT NOT NULL REFERENCES applications(id),
      summary TEXT NOT NULL,
      decision_due_at TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      name TEXT NOT NULL,
      organization TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS contact_messages (
      id TEXT PRIMARY KEY,
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      contact_id TEXT NOT NULL REFERENCES contacts(id),
      direction TEXT NOT NULL,
      body TEXT NOT NULL,
      evidence_id TEXT NOT NULL REFERENCES evidence(id),
      change_set_id TEXT REFERENCES change_sets(id),
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS career_plans (
      id TEXT PRIMARY KEY,
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      title TEXT NOT NULL,
      outcome TEXT NOT NULL DEFAULT '',
      horizon TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS career_tasks (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES career_plans(id),
      title TEXT NOT NULL,
      due_on TEXT,
      status TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS external_actions (
      id TEXT PRIMARY KEY,
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      kind TEXT NOT NULL,
      destination TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      change_set_id TEXT NOT NULL REFERENCES change_sets(id),
      result_json TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      media_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      checksum TEXT NOT NULL,
      category TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS integration_connections (
      id TEXT PRIMARY KEY,
      occupant_id TEXT NOT NULL REFERENCES occupants(id),
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      config_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  addColumnIfMissing(db, "profiles", "headline", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "profiles", "city", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "profiles", "state", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "profiles", "bio", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "profiles", "linkedin_url", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "profiles", "github_url", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(
    db,
    "profiles",
    "portfolio_url",
    "TEXT NOT NULL DEFAULT ''",
  );
  addColumnIfMissing(
    db,
    "interactive_projections",
    "snapshot_id",
    "TEXT REFERENCES work_map_snapshots(id)",
  );
  makeLegacyProjectionRevisionOptional(db);
  addColumnIfMissing(db, "profiles", "avatar_stored_name", "TEXT");
  addColumnIfMissing(
    db,
    "career_plans",
    "kind",
    "TEXT NOT NULL DEFAULT 'career'",
  );
  addColumnIfMissing(db, "projection_access_requests", "opportunity_id", "TEXT");
  addColumnIfMissing(
    db,
    "contacts",
    "unread_inbound",
    "INTEGER NOT NULL DEFAULT 0",
  );
  return db;
}

function addColumnIfMissing(
  db: DatabaseSync,
  table: string,
  name: string,
  spec: string,
) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (cols.some((col) => col.name === name)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${spec}`);
}

function makeLegacyProjectionRevisionOptional(db: DatabaseSync) {
  const columns = db
    .prepare("PRAGMA table_info(interactive_projections)")
    .all() as Array<{ name: string; notnull: number }>;
  if (!columns.some((column) => column.name === "revision_id" && column.notnull)) {
    return;
  }
  db.exec("PRAGMA foreign_keys = OFF");
  try {
    db.exec(`
      BEGIN;
      CREATE TABLE interactive_projections_next (
        id TEXT PRIMARY KEY,
        occupant_id TEXT NOT NULL REFERENCES occupants(id),
        revision_id TEXT REFERENCES resume_revisions(id),
        snapshot_id TEXT REFERENCES work_map_snapshots(id),
        slug TEXT NOT NULL,
        visibility TEXT NOT NULL,
        projection_json TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(occupant_id, slug)
      );
      INSERT INTO interactive_projections_next
        (id, occupant_id, revision_id, snapshot_id, slug, visibility,
         projection_json, status, created_at)
      SELECT id, occupant_id, revision_id, snapshot_id, slug, visibility,
             projection_json, status, created_at
      FROM interactive_projections;
      DROP TABLE interactive_projections;
      ALTER TABLE interactive_projections_next RENAME TO interactive_projections;
      COMMIT;
    `);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

export function pingDatabase(db: DatabaseSync): "ok" {
  db.prepare("SELECT 1 AS n").get();
  return "ok";
}
