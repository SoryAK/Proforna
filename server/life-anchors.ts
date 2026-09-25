import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { prepareLifeAnchor, type LifeAnchor, type LifeAnchorError } from "../core/life-anchor";

type JsonObject = Record<string, unknown>;

export class LifeAnchorStoreError extends Error {
  readonly code: LifeAnchorError | "anchor-missing";
  constructor(code: LifeAnchorError | "anchor-missing") {
    super(code);
    this.code = code;
  }
}

export function listLifeAnchors(db: DatabaseSync, occupantId: string): LifeAnchor[] {
  return db
    .prepare(
      `SELECT id, occupant_id AS occupantId, label, icon, address,
              latitude, longitude, weight
       FROM life_anchors WHERE occupant_id = ?
       ORDER BY created_at`,
    )
    .all(occupantId) as LifeAnchor[];
}

export function createLifeAnchor(
  db: DatabaseSync,
  occupantId: string,
  input: JsonObject,
): LifeAnchor {
  const prepared = prepareLifeAnchor(input, randomUUID(), occupantId);
  if (!prepared.ok) throw new LifeAnchorStoreError(prepared.error);
  const anchor = prepared.value;
  db.prepare(
    `INSERT INTO life_anchors
      (id, occupant_id, label, icon, address, latitude, longitude, weight, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    anchor.id,
    occupantId,
    anchor.label,
    anchor.icon,
    anchor.address,
    anchor.latitude,
    anchor.longitude,
    anchor.weight,
    new Date().toISOString(),
  );
  return anchor;
}

export function deleteLifeAnchor(
  db: DatabaseSync,
  occupantId: string,
  anchorId: string,
): void {
  const existing = db
    .prepare("SELECT id FROM life_anchors WHERE id = ? AND occupant_id = ?")
    .get(anchorId, occupantId);
  if (!existing) throw new LifeAnchorStoreError("anchor-missing");
  db.prepare("DELETE FROM life_anchors WHERE id = ? AND occupant_id = ?").run(
    anchorId,
    occupantId,
  );
}
