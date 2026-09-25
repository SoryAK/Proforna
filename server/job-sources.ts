import type { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_JOB_SOURCE_SETTINGS,
  prepareJobSourceSettings,
  type JobSourceSettings,
  type JobSourceSettingsError,
} from "../core/job-sources";

export class JobSourceSettingsStoreError extends Error {
  readonly code: JobSourceSettingsError;
  constructor(code: JobSourceSettingsError) {
    super(code);
    this.code = code;
  }
}

export function readJobSourceSettings(
  db: DatabaseSync,
  occupantId: string,
): JobSourceSettings {
  const row = db
    .prepare("SELECT settings_json FROM job_source_settings WHERE occupant_id = ?")
    .get(occupantId) as { settings_json: string } | undefined;
  if (!row) return DEFAULT_JOB_SOURCE_SETTINGS;
  try {
    const prepared = prepareJobSourceSettings(JSON.parse(row.settings_json) as object);
    return prepared.ok ? prepared.value : DEFAULT_JOB_SOURCE_SETTINGS;
  } catch {
    return DEFAULT_JOB_SOURCE_SETTINGS;
  }
}

export function saveJobSourceSettings(
  db: DatabaseSync,
  occupantId: string,
  input: {
    sources?: unknown;
    adzuna?: unknown;
    adzunaAppId?: unknown;
    adzunaAppKey?: unknown;
    sites?: unknown;
    judgment?: unknown;
  },
): JobSourceSettings {
  const prepared = prepareJobSourceSettings(input);
  if (!prepared.ok) throw new JobSourceSettingsStoreError(prepared.error);
  db.prepare(
    `INSERT INTO job_source_settings (occupant_id, settings_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(occupant_id) DO UPDATE SET
       settings_json = excluded.settings_json,
       updated_at = excluded.updated_at`,
  ).run(occupantId, JSON.stringify(prepared.value), new Date().toISOString());
  return prepared.value;
}
