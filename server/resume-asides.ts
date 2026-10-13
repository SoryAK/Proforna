import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export type ResumeAside = {
  kind: "job" | "school";
  title: string;
  organization: string;
  startDate: string;
  endDate: string;
};

export function listResumeAsides(db: DatabaseSync, occupantId: string): ResumeAside[] {
  const rows = db
    .prepare(
      `SELECT kind, title, organization, start_date AS startDate, end_date AS endDate
       FROM resume_set_asides WHERE occupant_id = ? ORDER BY created_at`,
    )
    .all(occupantId) as ResumeAside[];
  return rows.map((row) => ({
    kind: row.kind === "school" ? "school" : "job",
    title: row.title,
    organization: row.organization,
    startDate: row.startDate,
    endDate: row.endDate,
  }));
}

export function replaceResumeAsides(
  db: DatabaseSync,
  occupantId: string,
  asides: readonly ResumeAside[],
): ResumeAside[] {
  const now = new Date().toISOString();
  db.prepare("DELETE FROM resume_set_asides WHERE occupant_id = ?").run(occupantId);
  const insert = db.prepare(
    `INSERT INTO resume_set_asides
      (id, occupant_id, kind, title, organization, start_date, end_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const aside of asides) {
    const title = aside.title.trim();
    const organization = aside.organization.trim();
    if (!title && !organization) continue;
    insert.run(
      randomUUID(),
      occupantId,
      aside.kind === "school" ? "school" : "job",
      title,
      organization,
      aside.startDate.trim(),
      aside.endDate.trim(),
      now,
    );
  }
  return listResumeAsides(db, occupantId);
}
