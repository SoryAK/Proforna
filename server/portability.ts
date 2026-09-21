import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  PORTABLE_FORMAT_VERSION,
  validatePortableManifest,
  type PortableManifest,
} from "../core/index";

type JsonRow = Record<string, string | number | null>;

const directTables = [
  "profiles",
  "resumes",
  "model_connections",
  "work_history",
  "skills",
  "evidence",
  "career_facts",
  "change_sets",
  "audit_events",
  "agent_runs",
  "command_sessions",
  "command_messages",
  "worklog_entries",
  "work_history_details",
  "work_history_locations",
  "work_history_media",
  "work_map_publication_settings",
  "work_map_snapshots",
  "resume_variants",
  "resume_revisions",
  "interactive_projections",
  "publications",
  "opportunities",
  "applications",
  "interviews",
  "offers",
  "contacts",
  "contact_messages",
  "career_plans",
  "external_actions",
  "documents",
  "integration_connections",
] as const;

const restoreOrder = [
  "profiles",
  "resumes",
  "model_connections",
  "work_history",
  "skills",
  "evidence",
  "career_facts",
  "change_sets",
  "approvals",
  "audit_events",
  "agent_runs",
  "command_sessions",
  "command_messages",
  "worklog_entries",
  "work_history_details",
  "work_history_locations",
  "work_history_media",
  "work_map_publication_settings",
  "work_map_snapshots",
  "resume_variants",
  "resume_revisions",
  "interactive_projections",
  "publications",
  "projection_access_requests",
  "projection_access_grants",
  "projection_events",
  "opportunities",
  "applications",
  "interviews",
  "offers",
  "contacts",
  "contact_messages",
  "career_plans",
  "career_tasks",
  "external_actions",
  "documents",
  "integration_connections",
] as const;

export function createPortableArchive(
  db: DatabaseSync,
  occupantId: string,
  uploadsDir: string,
): Uint8Array {
  const tables: Record<string, JsonRow[]> = {};
  for (const table of directTables) {
    tables[table] = db
      .prepare(`SELECT * FROM ${table} WHERE occupant_id = ?`)
      .all(occupantId) as JsonRow[];
  }
  tables.approvals = db
    .prepare(
      `SELECT a.* FROM approvals a
       JOIN change_sets c ON c.id = a.change_set_id
       WHERE c.occupant_id = ?`,
    )
    .all(occupantId) as JsonRow[];
  tables.projection_access_requests = relatedProjectionRows(
    db,
    "projection_access_requests",
    occupantId,
  );
  tables.projection_access_grants = relatedProjectionRows(
    db,
    "projection_access_grants",
    occupantId,
  );
  tables.projection_events = relatedProjectionRows(
    db,
    "projection_events",
    occupantId,
  );
  tables.career_tasks = db
    .prepare(
      `SELECT t.* FROM career_tasks t
       JOIN career_plans p ON p.id = t.plan_id WHERE p.occupant_id = ?`,
    )
    .all(occupantId) as JsonRow[];

  const archiveFiles: Record<string, Uint8Array> = {};
  const storedNames = new Set<string>();
  for (const row of tables.resumes ?? []) addStoredName(row, storedNames);
  for (const row of tables.documents ?? []) addStoredName(row, storedNames);
  for (const row of tables.profiles ?? []) {
    if (typeof row.avatar_stored_name === "string") {
      storedNames.add(row.avatar_stored_name);
    }
  }
  for (const storedName of storedNames) {
    const fullPath = safeUploadPath(uploadsDir, storedName);
    if (!existsSync(fullPath)) continue;
    archiveFiles[`files/${storedName}`] = readFileSync(fullPath);
  }
  const dataBytes = strToU8(JSON.stringify({ tables }));
  const checksums: Record<string, string> = {
    "data.json": checksum(dataBytes),
  };
  for (const [name, bytes] of Object.entries(archiveFiles)) {
    checksums[name] = checksum(bytes);
  }
  const manifest: PortableManifest = {
    formatVersion: PORTABLE_FORMAT_VERSION,
    product: "Proforna",
    exportedAt: new Date().toISOString(),
    occupantId,
    dataFile: "data.json",
    fileCount: Object.keys(archiveFiles).length,
    checksums,
  };
  return zipSync(
    {
      "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
      "data.json": dataBytes,
      ...archiveFiles,
    },
    { level: 6 },
  );
}

export function restorePortableArchive(
  db: DatabaseSync,
  occupantId: string,
  uploadsDir: string,
  bytes: Uint8Array,
): { rows: number; files: number } {
  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(bytes);
  } catch {
    throw new PortabilityError("archive-invalid");
  }
  const manifestBytes = archive["manifest.json"];
  const dataBytes = archive["data.json"];
  if (!manifestBytes || !dataBytes) {
    throw new PortabilityError("archive-invalid");
  }
  let manifestValue: unknown;
  let dataValue: unknown;
  try {
    manifestValue = JSON.parse(strFromU8(manifestBytes));
    dataValue = JSON.parse(strFromU8(dataBytes));
  } catch {
    throw new PortabilityError("archive-invalid");
  }
  const validated = validatePortableManifest(manifestValue);
  if (!validated.ok) throw new PortabilityError(validated.error);
  for (const [name, expected] of Object.entries(validated.value.checksums)) {
    const file = archive[name];
    if (!file || checksum(file) !== expected) {
      throw new PortabilityError("checksum-mismatch");
    }
  }
  if (!isDataPayload(dataValue)) {
    throw new PortabilityError("archive-invalid");
  }

  let restoredRows = 0;
  db.exec("BEGIN");
  try {
    for (const table of restoreOrder) {
      const rows = dataValue.tables[table] ?? [];
      for (const source of rows) {
        const row = { ...source };
        if ("occupant_id" in row) row.occupant_id = occupantId;
        insertRow(db, table, row);
        restoredRows += 1;
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  let restoredFiles = 0;
  for (const [name, file] of Object.entries(archive)) {
    if (!name.startsWith("files/")) continue;
    const storedName = name.slice("files/".length);
    const destination = safeUploadPath(uploadsDir, storedName);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, file);
    restoredFiles += 1;
  }
  return { rows: restoredRows, files: restoredFiles };
}

function relatedProjectionRows(
  db: DatabaseSync,
  table: string,
  occupantId: string,
): JsonRow[] {
  return db
    .prepare(
      `SELECT r.* FROM ${table} r
       JOIN interactive_projections p ON p.id = r.projection_id
       WHERE p.occupant_id = ?`,
    )
    .all(occupantId) as JsonRow[];
}

function insertRow(db: DatabaseSync, table: string, row: JsonRow) {
  const columns = db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((column) => String((column as { name: string }).name));
  const names = Object.keys(row).filter((name) => columns.includes(name));
  if (names.length === 0) return;
  const quoted = names.map((name) => `"${name}"`).join(", ");
  const placeholders = names.map(() => "?").join(", ");
  db.prepare(
    `INSERT OR REPLACE INTO ${table} (${quoted}) VALUES (${placeholders})`,
  ).run(...names.map((name) => row[name]));
}

function addStoredName(row: JsonRow, names: Set<string>) {
  if (typeof row.stored_name === "string") names.add(row.stored_name);
}

function safeUploadPath(root: string, storedName: string): string {
  if (
    !storedName ||
    isAbsolute(storedName) ||
    storedName.split(/[\\/]/).includes("..")
  ) {
    throw new PortabilityError("path-invalid");
  }
  return join(root, storedName);
}

function checksum(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isDataPayload(
  value: unknown,
): value is { tables: Record<string, JsonRow[]> } {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "tables" in value &&
      (value as { tables?: unknown }).tables &&
      typeof (value as { tables: unknown }).tables === "object",
  );
}

export class PortabilityError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
