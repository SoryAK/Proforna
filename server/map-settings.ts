import type { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_MAP_SETTINGS,
  prepareMapSettings,
  type MapSettings,
  type MapSettingsError as MapSettingsErrorCode,
} from "../core/map-settings";

export class MapSettingsError extends Error {
  readonly code: MapSettingsErrorCode;
  constructor(code: MapSettingsErrorCode) {
    super(code);
    this.code = code;
  }
}

export function readMapSettings(db: DatabaseSync, occupantId: string): MapSettings {
  const row = db
    .prepare(
      `SELECT provider, google_maps_api_key AS googleMapsApiKey
       FROM map_settings WHERE occupant_id = ?`,
    )
    .get(occupantId) as MapSettings | undefined;
  if (!row) return DEFAULT_MAP_SETTINGS;
  return {
    provider: row.provider === "google" ? "google" : "openstreetmap",
    googleMapsApiKey: row.googleMapsApiKey ?? "",
  };
}

export function saveMapSettings(
  db: DatabaseSync,
  occupantId: string,
  input: { provider?: unknown; googleMapsApiKey?: unknown },
): MapSettings {
  const prepared = prepareMapSettings(input);
  if (!prepared.ok) throw new MapSettingsError(prepared.error);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO map_settings (occupant_id, provider, google_maps_api_key, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(occupant_id) DO UPDATE SET
       provider = excluded.provider,
       google_maps_api_key = excluded.google_maps_api_key,
       updated_at = excluded.updated_at`,
  ).run(
    occupantId,
    prepared.value.provider,
    prepared.value.googleMapsApiKey,
    now,
  );
  return prepared.value;
}
