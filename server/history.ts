import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  presentCareerFile,
  type CareerFile,
} from "../core/career-file";
import {
  planResumeImportFacts,
  type ResumeImportRole,
} from "../core/career-memory";
import type { ExtractedResume } from "../core/resume-extract";
import { prepareWorkMapLocation } from "../core/work-map";
import { commitOccupantFactOperations } from "./career-memory";

export async function saveExtractedResume(
  db: DatabaseSync,
  occupantId: string,
  extracted: ExtractedResume,
  evidenceId?: string | null,
): Promise<{ jobs: number; schools: number; skills: number }> {
  const now = new Date().toISOString();
  let jobs = 0;
  let schools = 0;
  let skills = 0;
  const roles: ResumeImportRole[] = [];
  const newSkills: string[] = [];

  const insertHistory = db.prepare(
    `INSERT INTO work_history
      (id, occupant_id, kind, title, company, location, start_date, end_date,
       is_current, description, achievements_json, degree, field, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const job of extracted.experience) {
    const jobId = randomUUID();
    const achievements = job.achievements
      .map((line) => line.trim())
      .filter(Boolean);
    insertHistory.run(
      jobId,
      occupantId,
      "job",
      job.title,
      job.company,
      job.location,
      job.startDate,
      job.endDate,
      job.isCurrent ? 1 : 0,
      job.description,
      JSON.stringify(achievements),
      "",
      "",
      now,
    );
    if (job.site) {
      persistExtractedSite(db, occupantId, jobId, job.site);
    }
    roles.push({
      id: jobId,
      kind: "job",
      title: job.title,
      organization: job.company,
      location: job.location,
      startDate: job.startDate,
      endDate: job.endDate,
      isCurrent: job.isCurrent,
      description: job.description,
      achievements,
    });
    jobs += 1;
  }

  for (const school of extracted.education) {
    const schoolId = randomUUID();
    insertHistory.run(
      schoolId,
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
    roles.push({
      id: schoolId,
      kind: "school",
      title: school.degree || "Education",
      organization: school.institution,
      location: school.location,
      startDate: school.startDate,
      endDate: school.endDate,
      isCurrent: false,
      description: school.description,
      achievements: [],
    });
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
    newSkills.push(name);
    skills += 1;
  }

  if (evidenceId) {
    await commitOccupantFactOperations(
      db,
      occupantId,
      "Record resume extract",
      planResumeImportFacts({
        evidenceId,
        roles,
        skills: newSkills,
      }),
    );
  }

  return { jobs, schools, skills };
}

export function loadCareerFile(
  db: DatabaseSync,
  occupantId: string,
): CareerFile {
  const history = db
    .prepare(
      `SELECT
        id,
        kind,
        title,
        company,
        location,
        start_date AS startDate,
        end_date AS endDate,
        is_current AS isCurrent,
        description,
        achievements_json AS achievementsJson,
        degree,
        field
      FROM work_history
      WHERE occupant_id = ?`,
    )
    .all(occupantId) as Array<{
    id: string;
    kind: string;
    title: string;
    company: string;
    location: string;
    startDate: string;
    endDate: string;
    isCurrent: number;
    description: string;
    achievementsJson: string;
    degree: string;
    field: string;
  }>;

  const skillRows = db
    .prepare(
      "SELECT name FROM skills WHERE occupant_id = ? ORDER BY created_at ASC",
    )
    .all(occupantId) as Array<{ name: string }>;

  return presentCareerFile(
    history.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      company: row.company,
      location: row.location,
      startDate: row.startDate,
      endDate: row.endDate,
      isCurrent: row.isCurrent === 1,
      description: row.description,
      achievements: parseAchievements(row.achievementsJson),
      degree: row.degree,
      field: row.field,
    })),
    skillRows.map((row) => row.name),
  );
}

function persistExtractedSite(
  db: DatabaseSync,
  occupantId: string,
  roleId: string,
  site: { label: string; address: string; latitude: number; longitude: number },
) {
  const prepared = prepareWorkMapLocation({
    ...site,
    kind: "primary",
    isPublic: false,
  });
  if (!prepared.ok) return;
  db.prepare(
    `INSERT INTO work_history_locations
      (id, work_history_id, occupant_id, label, address, latitude, longitude,
       kind, is_public, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    roleId,
    occupantId,
    prepared.value.label,
    prepared.value.address,
    prepared.value.latitude,
    prepared.value.longitude,
    prepared.value.kind,
    Number(prepared.value.isPublic),
    new Date().toISOString(),
  );
}

function parseAchievements(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is string => typeof item === "string" && Boolean(item.trim()),
    );
  } catch {
    return [];
  }
}
