import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ExtractedResume } from "../core/resume-extract";

export function saveExtractedResume(
  db: DatabaseSync,
  occupantId: string,
  extracted: ExtractedResume,
): { jobs: number; schools: number; skills: number } {
  const now = new Date().toISOString();
  let jobs = 0;
  let schools = 0;
  let skills = 0;

  const insertHistory = db.prepare(
    `INSERT INTO work_history
      (id, occupant_id, kind, title, company, location, start_date, end_date,
       is_current, description, achievements_json, degree, field, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const job of extracted.experience) {
    insertHistory.run(
      randomUUID(),
      occupantId,
      "job",
      job.title,
      job.company,
      job.location,
      job.startDate,
      job.endDate,
      job.isCurrent ? 1 : 0,
      job.description,
      JSON.stringify(job.achievements),
      "",
      "",
      now,
    );
    jobs += 1;
  }

  for (const school of extracted.education) {
    insertHistory.run(
      randomUUID(),
      occupantId,
      "school",
      school.degree || "Education",
      school.institution,
      school.location,
      school.startDate,
      school.endDate,
      0,
      school.description,
      "[]",
      school.degree,
      school.field,
      now,
    );
    schools += 1;
  }

  const insertSkill = db.prepare(
    "INSERT INTO skills (id, occupant_id, name, created_at) VALUES (?, ?, ?, ?)",
  );
  const existing = db
    .prepare("SELECT name FROM skills WHERE occupant_id = ?")
    .all(occupantId) as Array<{ name: string }>;
  const seen = new Set(existing.map((row) => row.name.toLowerCase()));
  for (const name of extracted.skills) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    insertSkill.run(randomUUID(), occupantId, name, now);
    skills += 1;
  }

  return { jobs, schools, skills };
}
