import type { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_JOB_SOURCE_SETTINGS,
  prepareJobSourceSettings,
  type JobSourceSettings,
  type JobSourceSettingsError,
} from "../core/job-sources";
import { isSealed, openSecret, sealSecret } from "./vault-seal";
import { vaultKey } from "./vault-key";

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
    const stored = JSON.parse(row.settings_json) as object;
    const secrets = collectApiKeys(stored);
    const sealed = secrets.some((secret) => isSealed(secret));
    const plain = secrets.some((secret) => !isSealed(secret));
    const key = sealed || plain ? vaultKey(!sealed) : null;
    const revealed = key ? revealApiKeys(stored, key) : stored;
    const prepared = prepareJobSourceSettings(revealed as object);
    if (!prepared.ok) return DEFAULT_JOB_SOURCE_SETTINGS;
    if (plain && key) {
      db.prepare(
        `UPDATE job_source_settings SET settings_json = ? WHERE occupant_id = ?`,
      ).run(JSON.stringify(sealJobSourceSettings(prepared.value, key)), occupantId);
    }
    return prepared.value;
  } catch (error) {
    if (error instanceof Error && error.name !== "SyntaxError") throw error;
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
  ).run(
    occupantId,
    JSON.stringify(storedJobSourceSettings(prepared.value)),
    new Date().toISOString(),
  );
  return prepared.value;
}

function storedJobSourceSettings(settings: JobSourceSettings): JobSourceSettings {
  if (!settings.sources.some((source) => source.apiKey)) return settings;
  return sealJobSourceSettings(settings, vaultKey(true));
}

function sealJobSourceSettings(
  settings: JobSourceSettings,
  key: Buffer,
): JobSourceSettings {
  return {
    ...settings,
    sources: settings.sources.map((source) => ({
      ...source,
      apiKey: sealSecret(source.apiKey, key),
    })),
  };
}

function collectApiKeys(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  const found: string[] = [];
  if (typeof row.adzunaAppKey === "string" && row.adzunaAppKey) {
    found.push(row.adzunaAppKey);
  }
  if (Array.isArray(row.sources)) {
    for (const source of row.sources) {
      if (!source || typeof source !== "object") continue;
      const apiKey = (source as { apiKey?: unknown }).apiKey;
      if (typeof apiKey === "string" && apiKey) found.push(apiKey);
    }
  }
  return found;
}

function revealApiKeys(value: unknown, key: Buffer): unknown {
  if (!value || typeof value !== "object") return value;
  const row = structuredClone(value) as Record<string, unknown>;
  if (typeof row.adzunaAppKey === "string" && isSealed(row.adzunaAppKey)) {
    row.adzunaAppKey = openSecret(row.adzunaAppKey, key);
  }
  if (Array.isArray(row.sources)) {
    row.sources = row.sources.map((source) => {
      if (!source || typeof source !== "object") return source;
      const item = source as { apiKey?: unknown };
      if (typeof item.apiKey !== "string" || !isSealed(item.apiKey)) return source;
      return { ...item, apiKey: openSecret(item.apiKey, key) };
    });
  }
  return row;
}
