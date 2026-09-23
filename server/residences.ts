import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  prepareResidence,
  residencesToClose,
  type Residence,
} from "../core/residence";
import { readProfile } from "./occupant";

type JsonObject = Record<string, unknown>;

export class ResidenceStoreError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export function listResidences(
  db: DatabaseSync,
  occupantId: string,
): Residence[] {
  return (
    db
      .prepare(
        `SELECT id, occupant_id AS occupantId, label, address, latitude, longitude,
                start_date AS startDate, end_date AS endDate
         FROM residences WHERE occupant_id = ?
         ORDER BY COALESCE(start_date, '0000-01'), created_at`,
      )
      .all(occupantId) as Residence[]
  );
}

export function createResidence(
  db: DatabaseSync,
  occupantId: string,
  input: JsonObject,
): Residence {
  return writeResidence(db, occupantId, randomUUID(), input);
}

export function updateResidence(
  db: DatabaseSync,
  occupantId: string,
  residenceId: string,
  input: JsonObject,
): Residence {
  requireResidence(db, occupantId, residenceId);
  return writeResidence(db, occupantId, residenceId, input);
}

export function deleteResidence(
  db: DatabaseSync,
  occupantId: string,
  residenceId: string,
): void {
  requireResidence(db, occupantId, residenceId);
  db.prepare(
    "DELETE FROM residences WHERE id = ? AND occupant_id = ?",
  ).run(residenceId, occupantId);
}

export async function placeUnpinnedResidences(
  db: DatabaseSync,
  occupantId: string,
  lookup: (query: string) => Promise<{ latitude: number; longitude: number } | null>,
): Promise<void> {
  const pending = listResidences(db, occupantId).filter(
    (residence) => residence.latitude == null || residence.longitude == null,
  );
  for (const residence of pending) {
    try {
      const found = await lookup(residence.address);
      if (!found) continue;
      db.prepare(
        `UPDATE residences SET latitude = ?, longitude = ?
         WHERE id = ? AND occupant_id = ?`,
      ).run(found.latitude, found.longitude, residence.id, occupantId);
      if (!residence.endDate) {
        db.prepare(
          `UPDATE profiles SET address_latitude = ?, address_longitude = ?
           WHERE occupant_id = ?`,
        ).run(found.latitude, found.longitude, occupantId);
      }
    } catch {
      /* the home stays saved and can be placed on a later visit */
    }
  }
}

export function adoptProfileHome(db: DatabaseSync, occupantId: string): void {
  const count = db
    .prepare("SELECT COUNT(*) AS total FROM residences WHERE occupant_id = ?")
    .get(occupantId) as { total: number };
  if (count.total > 0) return;
  const profile = readProfile(db, occupantId);
  if (profile.addressLatitude == null || profile.addressLongitude == null) return;
  const address = placeLine(profile);
  if (!address) return;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO residences
      (id, occupant_id, label, address, latitude, longitude, start_date, end_date, created_at)
     VALUES (?, ?, 'Home', ?, ?, ?, NULL, NULL, ?)`,
  ).run(
    randomUUID(),
    occupantId,
    address,
    profile.addressLatitude,
    profile.addressLongitude,
    now,
  );
}

export function syncOpenResidence(
  db: DatabaseSync,
  occupantId: string,
  profile: { address: string; city: string; state: string; addressLatitude: number | null; addressLongitude: number | null },
): void {
  if (profile.addressLatitude == null || profile.addressLongitude == null) return;
  const address = placeLine(profile);
  if (!address) return;
  const open = db
    .prepare(
      `SELECT id FROM residences
       WHERE occupant_id = ? AND end_date IS NULL
       ORDER BY COALESCE(start_date, '0000-01') DESC LIMIT 1`,
    )
    .get(occupantId) as { id: string } | undefined;
  if (open) {
    db.prepare(
      `UPDATE residences SET address = ?, latitude = ?, longitude = ?
       WHERE id = ? AND occupant_id = ?`,
    ).run(
      address,
      profile.addressLatitude,
      profile.addressLongitude,
      open.id,
      occupantId,
    );
    return;
  }
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO residences
      (id, occupant_id, label, address, latitude, longitude, start_date, end_date, created_at)
     VALUES (?, ?, 'Home', ?, ?, ?, NULL, NULL, ?)`,
  ).run(
    randomUUID(),
    occupantId,
    address,
    profile.addressLatitude,
    profile.addressLongitude,
    now,
  );
}

function writeResidence(
  db: DatabaseSync,
  occupantId: string,
  residenceId: string,
  input: JsonObject,
): Residence {
  const prepared = prepareResidence(input);
  if (!prepared.ok) throw new ResidenceStoreError(prepared.error);
  const value = prepared.value;
  const now = new Date().toISOString();
  const existing = listResidences(db, occupantId);
  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO residences
        (id, occupant_id, label, address, latitude, longitude, start_date, end_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         label = excluded.label,
         address = excluded.address,
         latitude = excluded.latitude,
         longitude = excluded.longitude,
         start_date = excluded.start_date,
         end_date = excluded.end_date`,
    ).run(
      residenceId,
      occupantId,
      value.label,
      value.address,
      value.latitude,
      value.longitude,
      value.startDate,
      value.endDate,
      now,
    );
    if (!value.endDate) {
      const closeAt = value.startDate ?? now.slice(0, 7);
      for (const close of residencesToClose(existing, { id: residenceId, startDate: value.startDate }, closeAt)) {
        db.prepare(
          "UPDATE residences SET end_date = ? WHERE id = ? AND occupant_id = ?",
        ).run(close.endDate, close.id, occupantId);
      }
      db.prepare(
        `UPDATE profiles SET address = ?, address_latitude = ?, address_longitude = ?
         WHERE occupant_id = ?`,
      ).run(value.address, value.latitude, value.longitude, occupantId);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const saved = listResidences(db, occupantId).find((item) => item.id === residenceId);
  if (!saved) throw new ResidenceStoreError("residence-missing");
  return saved;
}

function requireResidence(
  db: DatabaseSync,
  occupantId: string,
  residenceId: string,
) {
  const row = db
    .prepare("SELECT id FROM residences WHERE id = ? AND occupant_id = ?")
    .get(residenceId, occupantId);
  if (!row) throw new ResidenceStoreError("residence-missing");
}

function placeLine(profile: {
  address: string;
  city: string;
  state: string;
}): string {
  return [profile.address, profile.city, profile.state].filter(Boolean).join(", ");
}
