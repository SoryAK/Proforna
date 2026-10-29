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
import type { HistoryEvidenceLinks } from "../core/resume-compare";
import {
  EMPTY_WORK_MAP_DETAILS,
  planWorkMapRoleFactSync,
  prepareWorkMapLocation,
  type WorkMapRole,
} from "../core/work-map";
import { readRoleAchievements, reconcileRoleAchievements, roleAchievementStatements } from "../core/role-achievements";
import { commitOccupantFactOperations, readCareerMemory } from "./career-memory";
import { evidenceIdForResume } from "./profile";
import { replaceResumeAsides, type ResumeAside } from "./resume-asides";

export type ImportEvidence = {
  experience: Array<{ evidenceIds: string[]; achievementEvidenceIds: string[] }>;
  education: Array<{ evidenceIds: string[] }>;
  skillEvidenceIds: string[];
};

export async function saveExtractedResume(
  db: DatabaseSync,
  occupantId: string,
  extracted: ExtractedResume,
  evidenceId?: string | null,
  imports?: ImportEvidence | null,
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
    const jobEvidence = imports?.experience[jobs];
    const paired = job.achievements
      .map((line, index) => ({
        line: line.trim(),
        evidence: jobEvidence?.achievementEvidenceIds[index] ?? "",
      }))
      .filter((row) => row.line);
    const achievements = paired.map((row) => row.line);
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
      evidenceIds: jobEvidence?.evidenceIds,
      achievementEvidenceIds: jobEvidence ? paired.map((row) => row.evidence) : undefined,
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
    if (school.site) {
      persistExtractedSite(db, occupantId, schoolId, school.site);
    }
    const schoolEvidence = imports?.education[schools];
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
      evidenceIds: schoolEvidence?.evidenceIds,
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

  const skillEvidenceIds = imports
    ? newSkills.map((name) => {
        const index = extracted.skills.findIndex((skill) => skill.toLowerCase() === name.toLowerCase());
        return index >= 0 ? (imports.skillEvidenceIds[index] ?? "") : "";
      })
    : undefined;
  if (evidenceId || imports) {
    await commitOccupantFactOperations(
      db,
      occupantId,
      "Record resume extract",
      planResumeImportFacts({
        evidenceId: evidenceId ?? "",
        roles,
        skills: newSkills,
        skillEvidenceIds,
      }),
    );
  }

  return { jobs, schools, skills };
}

export function resolveImportEvidence(
  db: DatabaseSync,
  occupantId: string,
  links: HistoryEvidenceLinks,
): ImportEvidence | null {
  const experience: ImportEvidence["experience"] = [];
  for (const link of links.experience) {
    const evidenceIds = resolveResumeEvidence(db, occupantId, link.resumeIds);
    const achievementEvidenceIds = resolveResumeEvidence(db, occupantId, link.achievementResumeIds);
    if (!evidenceIds || !achievementEvidenceIds) return null;
    experience.push({ evidenceIds, achievementEvidenceIds });
  }
  const education: ImportEvidence["education"] = [];
  for (const link of links.education) {
    const evidenceIds = resolveResumeEvidence(db, occupantId, link.resumeIds);
    if (!evidenceIds) return null;
    education.push({ evidenceIds });
  }
  const skillEvidenceIds: string[] = [];
  for (const resumeId of links.skills) {
    if (!resumeId.trim()) {
      skillEvidenceIds.push("");
      continue;
    }
    const evidenceId = evidenceIdForResume(db, occupantId, resumeId);
    if (!evidenceId) return null;
    skillEvidenceIds.push(evidenceId);
  }
  return { experience, education, skillEvidenceIds };
}

function resolveResumeEvidence(
  db: DatabaseSync,
  occupantId: string,
  resumeIds: string[],
): string[] | null {
  const evidenceIds: string[] = [];
  for (const resumeId of resumeIds) {
    const evidenceId = evidenceIdForResume(db, occupantId, resumeId);
    if (!evidenceId) return null;
    evidenceIds.push(evidenceId);
  }
  return evidenceIds;
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

export type ComparedRoleUpdate = {
  id: string;
  kind: "job" | "school";
  title: string;
  organization: string;
  location: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
  achievements: string[];
};

export async function applyComparedResume(
  db: DatabaseSync,
  occupantId: string,
  input: {
    evidenceId: string;
    updates: ComparedRoleUpdate[];
    created: ExtractedResume;
    asides: ResumeAside[];
  },
): Promise<{ updated: number; created: { jobs: number; schools: number; skills: number } }> {
  let updated = 0;
  for (const role of input.updates) {
    const existing = db
      .prepare(
        "SELECT id, kind, achievements_json FROM work_history WHERE id = ? AND occupant_id = ?",
      )
      .get(role.id, occupantId) as
      | { id: string; kind: string; achievements_json: string }
      | undefined;
    if (!existing) continue;
    db.prepare(
      `UPDATE work_history SET title = ?, company = ?, location = ?, start_date = ?,
         end_date = ?, is_current = ?, description = ?, achievements_json = ?
       WHERE id = ? AND occupant_id = ?`,
    ).run(
      role.title,
      role.organization,
      role.location,
      role.startDate,
      role.isCurrent ? "" : role.endDate,
      role.isCurrent ? 1 : 0,
      role.description,
      JSON.stringify(
        reconcileRoleAchievements(
          readRoleAchievements(existing.achievements_json, randomUUID).items,
          role.achievements,
          randomUUID,
        ),
      ),
      role.id,
      occupantId,
    );
    const kind = existing.kind === "school" ? "school" : existing.kind === "internship" ? "internship" : "job";
    const facts = readCareerMemory(db, occupantId).facts;
    await commitOccupantFactOperations(
      db,
      occupantId,
      "Record a later resume",
      planWorkMapRoleFactSync({
        role: factRole(role, kind),
        facts,
        evidenceId: input.evidenceId,
      }),
    );
    updated += 1;
  }
  const created = await saveExtractedResume(db, occupantId, input.created, input.evidenceId);
  replaceResumeAsides(db, occupantId, input.asides);
  return { updated, created };
}

function factRole(role: ComparedRoleUpdate, kind: WorkMapRole["kind"]): WorkMapRole {
  return {
    id: role.id,
    kind,
    title: role.title,
    organization: role.organization,
    locationLabel: role.location,
    startDate: role.startDate,
    endDate: role.isCurrent ? "" : role.endDate,
    isCurrent: role.isCurrent,
    description: role.description,
    achievements: role.achievements,
    factId: null,
    factVersion: null,
    evidenceIds: [],
    claims: [],
    locations: [],
    media: [],
    linkedEvidence: [],
    details: structuredClone(EMPTY_WORK_MAP_DETAILS),
  };
}

function parseAchievements(raw: string): string[] {
  return roleAchievementStatements(raw);
}
