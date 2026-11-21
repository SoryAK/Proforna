import type { DatabaseSync } from "node:sqlite";
import { prepareDistinctPair, type DistinctPair } from "../core/index";

export function listDistinctPairs(db: DatabaseSync, occupantId: string): DistinctPair[] {
  return (
    db
      .prepare(
        `SELECT first_role_id, second_role_id FROM role_distinct_pairs
          WHERE occupant_id = ? ORDER BY created_at`,
      )
      .all(occupantId) as Array<{ first_role_id: string; second_role_id: string }>
  ).map((row) => ({
    firstId: row.first_role_id,
    secondId: row.second_role_id,
    key: `${row.first_role_id}|${row.second_role_id}`,
  }));
}

/** Marks two saved roles as different. Marking the same pair again is harmless. */
export function markDistinctPair(db: DatabaseSync, occupantId: string, input: unknown): DistinctPair {
  const prepared = prepareDistinctPair(input);
  if (!prepared.ok) throw new DistinctPairError(prepared.error);
  const owned = db
    .prepare("SELECT COUNT(*) AS n FROM work_history WHERE occupant_id = ? AND id IN (?, ?)")
    .get(occupantId, prepared.value.firstId, prepared.value.secondId) as { n: number };
  if (owned.n !== 2) throw new DistinctPairError("role-missing");
  db.prepare(
    `INSERT OR IGNORE INTO role_distinct_pairs (occupant_id, first_role_id, second_role_id, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(occupantId, prepared.value.firstId, prepared.value.secondId, new Date().toISOString());
  return prepared.value;
}

/** Takes a "not a duplicate" mark back, so the review can pair the roles again. */
export function unmarkDistinctPair(db: DatabaseSync, occupantId: string, input: unknown): void {
  const prepared = prepareDistinctPair(input);
  if (!prepared.ok) throw new DistinctPairError(prepared.error);
  db.prepare(
    `DELETE FROM role_distinct_pairs
      WHERE occupant_id = ? AND first_role_id = ? AND second_role_id = ?`,
  ).run(occupantId, prepared.value.firstId, prepared.value.secondId);
}

export class DistinctPairError extends Error {
  constructor(readonly code: "pair-invalid" | "role-missing") {
    super(code);
  }
}
