import type { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_MAP_SETTINGS,
  parseMapIcons,
  prepareMapSettings,
  type MapSettings,
  type MapSettingsError as MapSettingsErrorCode,
} from "../core/map-settings";
import { isSealed, openSecret, sealSecret } from "./vault-seal";
import { vaultKey } from "./vault-key";

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
    googleMapsApiKey: revealMapKey(db, occupantId, row.googleMapsApiKey ?? ""),
    theme,
    icons: parseMapIcons(row.iconsJson),
  };
}

function storedMapKey(plain: string): string {
  if (!plain) return "";
  return sealSecret(plain, vaultKey(true));
}

function revealMapKey(db: DatabaseSync, occupantId: string, stored: string): string {
  if (!stored) return "";
  if (!isSealed(stored)) {
    const key = vaultKey(true);
    db.prepare(
      `UPDATE map_settings SET google_maps_api_key = ? WHERE occupant_id = ?`,
    ).run(sealSecret(stored, key), occupantId);
    return stored;
  }
  return openSecret(stored, vaultKey(false));
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
    storedMapKey(prepared.value.googleMapsApiKey),
    prepared.value.theme,
    JSON.stringify(prepared.value.icons),
    now,
  );
  return prepared.value;
}
