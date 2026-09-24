import type { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_MAP_SETTINGS,
  parseMapIcons,
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
      `SELECT provider, google_maps_api_key AS googleMapsApiKey,
              pin_theme AS theme, pin_icons_json AS iconsJson
       FROM map_settings WHERE occupant_id = ?`,
    )
    .get(occupantId) as
    | {
        provider: string;
        googleMapsApiKey: string;
        theme: string | null;
        iconsJson: string | null;
      }
    | undefined;
  if (!row) return DEFAULT_MAP_SETTINGS;
  const theme = row.theme === "gold" ? "gold" : "kind";
  return {
    provider: row.provider === "google" ? "google" : "openstreetmap",
    googleMapsApiKey: row.googleMapsApiKey ?? "",
    theme,
    icons: parseMapIcons(row.iconsJson),
  };
}

export function saveMapSettings(
  db: DatabaseSync,
  occupantId: string,
  input: {
    provider?: unknown;
    googleMapsApiKey?: unknown;
    theme?: unknown;
    icons?: unknown;
  },
): MapSettings {
  const prepared = prepareMapSettings(input, readMapSettings(db, occupantId));
  if (!prepared.ok) throw new MapSettingsError(prepared.error);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO map_settings (
       occupant_id, provider, google_maps_api_key, pin_theme, pin_icons_json, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(occupant_id) DO UPDATE SET
       provider = excluded.provider,
       google_maps_api_key = excluded.google_maps_api_key,
       pin_theme = excluded.pin_theme,
       pin_icons_json = excluded.pin_icons_json,
       updated_at = excluded.updated_at`,
  ).run(
    occupantId,
    prepared.value.provider,
    prepared.value.googleMapsApiKey,
    prepared.value.theme,
    JSON.stringify(prepared.value.icons),
    now,
  );
  return prepared.value;
}
