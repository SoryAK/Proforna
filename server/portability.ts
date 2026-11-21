import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { isSafeStoredName, uploadPath } from "./upload-path";
import {
  PORTABLE_FORMAT_VERSION,
  validatePortableManifest,
  type PortableManifest,
} from "../core/index";

type JsonRow = Record<string, string | number | null>;

const directTables = [
  "profiles",
  "residences",
  "life_anchors",
  "resumes",
  "model_connections",
  "map_settings",
  "job_source_settings",
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
  "work_history_linked_evidence",
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
  "residences",
  "life_anchors",
  "resumes",
  "model_connections",
  "map_settings",
  "job_source_settings",
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
  "work_history_linked_evidence",
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

  // A row naming a file outside the uploads folder would make the whole backup
  // unrestorable, so it leaves the export: file rows are dropped, and a profile
  // keeps its other fields without the photo.
  for (const table of ["resumes", "documents", "work_history_media"]) {
    if (tables[table]) {
      tables[table] = tables[table]!.filter(
        (row) => row.stored_name === null || row.stored_name === undefined || isSafeStoredName(row.stored_name),
      );
    }
  }
  for (const row of tables.profiles ?? []) {
    if (row.avatar_stored_name !== null && row.avatar_stored_name !== undefined && !isSafeStoredName(row.avatar_stored_name)) {
      row.avatar_stored_name = null;
    }
  }

  const archiveFiles: Record<string, Uint8Array> = {};
  const storedNames = new Set<string>();
  for (const row of tables.resumes ?? []) addStoredName(row, storedNames);
  for (const row of tables.documents ?? []) addStoredName(row, storedNames);
  for (const row of tables.profiles ?? []) {
    if (typeof row.avatar_stored_name === "string") {
      storedNames.add(row.avatar_stored_name);
    }
  }
  for (const row of tables.work_history_media ?? []) addStoredName(row, storedNames);
  for (const storedName of storedNames) {
    // A name that escapes the uploads folder is left out rather than read.
    if (!isSafeStoredName(storedName)) continue;
    const fullPath = safeUploadPath(uploadsDir, storedName);
    if (!existsSync(fullPath)) continue;
    archiveFiles[`files/${storedName}`] = readFileSync(fullPath);
  }
  const dataBytes = strToU8(JSON.stringify({ tables }));
  // A backup must be one that restore accepts; refuse rather than hand back an
  // archive that can never be restored.
  const unpacked = dataBytes.byteLength + Object.values(archiveFiles).reduce((total, bytes) => total + bytes.byteLength, 0);
  if (
    unpacked > DEFAULT_RESTORE_LIMITS.maxUnpackedBytes ||
    Object.keys(archiveFiles).length + 2 > DEFAULT_RESTORE_LIMITS.maxEntries
  ) {
    throw new PortabilityError("export-too-large");
  }
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
  const zipped = zipSync(
    {
      "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
      "data.json": dataBytes,
      ...archiveFiles,
    },
    { level: 6 },
  );
  if (zipped.byteLength > MAX_RESTORE_ARCHIVE_BYTES) throw new PortabilityError("export-too-large");
  return zipped;
}

/** Largest archive file accepted for restore, before unpacking. */
export const MAX_RESTORE_ARCHIVE_BYTES = 512 * 1024 * 1024;

export type RestoreLimits = {
  /** Total size of every file once unpacked. */
  maxUnpackedBytes: number;
  /** Number of entries in the archive, manifest included. */
  maxEntries: number;
};

export const DEFAULT_RESTORE_LIMITS: RestoreLimits = {
  maxUnpackedBytes: 1024 * 1024 * 1024,
  maxEntries: 10_000,
};

export function restorePortableArchive(
  db: DatabaseSync,
  occupantId: string,
  uploadsDir: string,
  bytes: Uint8Array,
  limits: RestoreLimits = DEFAULT_RESTORE_LIMITS,
): { rows: number; files: number } {
  if (bytes.byteLength > MAX_RESTORE_ARCHIVE_BYTES) {
    throw new PortabilityError("archive-too-large");
  }
  // fflate never inflates more than an entry's declared size, so adding up the
  // declared sizes bounds memory. A stored (uncompressed) entry is copied by its
  // compressed size instead, so its two sizes must agree and that size counts.
  // An entry that lies about its size comes out truncated and fails its checksum.
  let archive: Record<string, Uint8Array>;
  let entries = 0;
  let unpackedBytes = 0;
  try {
    archive = unzipSync(bytes, {
      filter(file) {
        entries += 1;
        if (file.compression === 0 && file.size !== file.originalSize) {
          throw new PortabilityError("archive-invalid");
        }
        unpackedBytes += Math.max(file.originalSize, file.size);
        if (
          entries > limits.maxEntries ||
          unpackedBytes > limits.maxUnpackedBytes
        ) {
          throw new PortabilityError("archive-too-large");
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof PortabilityError) throw error;
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
  const checksums = validated.value.checksums;
  if (!Object.hasOwn(checksums, "data.json")) {
    throw new PortabilityError("checksum-mismatch");
  }
  for (const [name, expected] of Object.entries(checksums)) {
    const file = Object.hasOwn(archive, name) ? archive[name] : undefined;
    if (!file || checksum(file) !== expected) {
      throw new PortabilityError("checksum-mismatch");
    }
  }
  // Every entry besides the manifest must be one the manifest vouches for, and
  // every file must land inside the uploads folder. Both are checked before
  // anything is written, so a bad archive changes nothing.
  const filesToWrite: Array<{ destination: string; file: Uint8Array }> = [];
  for (const [name, file] of Object.entries(archive)) {
    if (name === "manifest.json") continue;
    if (!Object.hasOwn(checksums, name)) {
      throw new PortabilityError("file-unlisted");
    }
    if (name === "data.json") continue;
    if (!name.startsWith("files/")) {
      throw new PortabilityError("file-unlisted");
    }
    const storedName = name.slice("files/".length);
    filesToWrite.push({
      destination: safeUploadPath(uploadsDir, storedName),
      file,
    });
  }
  if (!isDataPayload(dataValue)) {
    throw new PortabilityError("archive-invalid");
  }
  if (!rowsNameSafeFiles(dataValue.tables)) {
    throw new PortabilityError("path-invalid");
  }

  let restoredRows = 0;
  db.exec("BEGIN");
  try {
    for (const table of restoreOrder) {
      const rows = dataValue.tables[table] ?? [];
      for (const source of rows) {
        const row = { ...source };
        if ("occupant_id" in row) row.occupant_id = occupantId;
        for (const name of ["stored_name", "avatar_stored_name"]) {
          const storedName = row[name];
          if (typeof storedName === "string" && storedName !== "") {
            safeUploadPath(uploadsDir, storedName);
          }
        }
        insertRow(db, table, row);
        restoredRows += 1;
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  for (const { destination, file } of filesToWrite) {
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, file);
  }
  return { rows: restoredRows, files: filesToWrite.length };
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
  try {
    return uploadPath(root, storedName);
  } catch {
    throw new PortabilityError("path-invalid");
  }
}

/** Columns that name an uploaded file. Restored rows must keep them inside the uploads folder. */
const storedNameColumns = ["stored_name", "avatar_stored_name"] as const;

function rowsNameSafeFiles(tables: Record<string, JsonRow[]>): boolean {
  for (const rows of Object.values(tables)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      for (const column of storedNameColumns) {
        const value = (row as JsonRow)[column];
        if (value !== null && value !== undefined && !isSafeStoredName(value)) {
          return false;
        }
      }
    }
  }
  return true;
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
