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
import { commitOccupantFactOperations, holdImportFactBackfill, queueImportFactSync, readCareerMemory, replayPendingImportFacts } from "./career-memory";
import { evidenceIdForResume } from "./profile";
import { replaceResumeAsides, type ResumeAside } from "./resume-asides";

export type ImportEvidence = {
  experience: Array<{ evidenceIds: string[]; achievementEvidenceIds: string[] }>;
  education: Array<{ evidenceIds: string[] }>;
  skillEvidenceIds: string[];
};

let historyImportTail: Promise<void> = Promise.resolve();

/** Test-only pause so two history saves can be forced to overlap. */
type HistoryImportGate = {
  onQueued?: () => void;
  beforeFacts?: () => Promise<void>;
};

let historyImportGate: HistoryImportGate | null = null;

export function setHistoryImportGateForTest(gate: HistoryImportGate | null) {
  historyImportGate = gate;
}

export function saveExtractedResume(
  db: DatabaseSync,
  occupantId: string,
  extracted: ExtractedResume,
  evidenceId?: string | null,
  imports?: ImportEvidence | null,
  roleIds?: { experience: readonly string[]; education: readonly string[] } | null,
): Promise<{ jobs: number; schools: number; skills: number }> {
  historyImportGate?.onQueued?.();
  const run = historyImportTail.then(() =>
    importExtractedResume(db, occupantId, extracted, evidenceId, imports, roleIds),
  );
  historyImportTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function importExtractedResume(
  db: DatabaseSync,
  occupantId: string,
  extracted: ExtractedResume,
  evidenceId?: string | null,
  imports?: ImportEvidence | null,
  roleIds?: { experience: readonly string[]; education: readonly string[] } | null,
): Promise<{ jobs: number; schools: number; skills: number }> {
  const now = new Date().toISOString();
  let jobs = 0;
  let schools = 0;
  let skills = 0;
  const roles: ResumeImportRole[] = [];
  const revised: ResumeImportRole[] = [];
  const newSkills: string[] = [];
  const marker = db.prepare(
    `INSERT OR IGNORE INTO resume_import_markers
      (occupant_id, evidence_id, item_key, work_history_id, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const markerRow = db.prepare(
    `SELECT work_history_id AS workHistoryId FROM resume_import_markers
     WHERE occupant_id = ? AND evidence_id = ? AND item_key = ?`,
  );
  const markerRetarget = db.prepare(
    `UPDATE resume_import_markers SET work_history_id = ?
     WHERE occupant_id = ? AND evidence_id = ? AND item_key = ?`,
  );

  db.exec("BEGIN IMMEDIATE");
  try {
    const indexed = loadImportIndex(db, occupantId);
    const imported = indexed.keys;
    const importRows = indexed.rows;
    const keyRows = indexed.keyRows;
    const historyIds = indexed.historyIds;
    const remember = (evidenceIds: string[], key: string, workHistoryId: string | null) => {
      for (const id of evidenceIds) {
        const existing = markerRow.get(occupantId, id, key) as { workHistoryId: string | null } | undefined;
        const currentLive = Boolean(existing?.workHistoryId && historyIds.has(existing.workHistoryId));
        if (!existing) {
          marker.run(occupantId, id, key, workHistoryId, now);
        } else if (workHistoryId && !currentLive) {
          markerRetarget.run(workHistoryId, occupantId, id, key);
        }
        if (workHistoryId && (!existing || !currentLive)) {
          historyIds.add(workHistoryId);
          keyRows.set(`${id}\n${key}`, workHistoryId);
        }
        const keys = imported.get(id) ?? new Set<string>();
        keys.add(key);
        imported.set(id, keys);
      }
    };
    const rememberImport = (evidenceIds: string[], importId: string, workHistoryId: string) => {
      remember(evidenceIds, `import\n${importId}`, workHistoryId);
      for (const id of evidenceIds) importRows.set(`${id}\n${importId}`, workHistoryId);
    };
    const rowForImport = (evidenceIds: string[], importId: string) => {
      for (const id of evidenceIds) {
        const rowId = importRows.get(`${id}\n${importId}`);
        if (rowId) return rowId;
      }
      return undefined;
    };
    const rowForKey = (evidenceIds: string[], key: string) => {
      for (const id of evidenceIds) {
        const rowId = keyRows.get(`${id}\n${key}`);
        if (rowId) return rowId;
      }
      return undefined;
    };
    const known = (evidenceIds: string[], key: string) =>
      evidenceIds.some((id) => imported.get(id)?.has(key));
    const insertHistory = db.prepare(
      `INSERT INTO work_history
        (id, occupant_id, kind, title, company, location, start_date, end_date,
         is_current, description, achievements_json, degree, field, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const [index, job] of extracted.experience.entries()) {
      const key = historyItemKey("role", {
        title: job.title,
        organization: job.company,
        startDate: job.startDate,
        endDate: job.endDate,
      });
      const jobEvidence = imports?.experience[index];
      const linked = itemEvidenceIds(jobEvidence?.evidenceIds, evidenceId);
      const importId = importIdentity(roleIds?.experience[index]);
      const storedId = importId ? rowForImport(linked, importId) : undefined;
      const matchedId = storedId ?? (importId ? rowForKey(linked, key) : undefined);
      const paired = job.achievements
        .map((line, achievementIndex) => ({
          line: line.trim(),
          evidence: jobEvidence?.achievementEvidenceIds[achievementIndex] ?? "",
        }))
        .filter((row) => row.line);
      const achievements = paired.map((row) => row.line);
      if (matchedId) {
        reviseImportedJob(db, occupantId, matchedId, job, achievements);
        remember(linked, key, matchedId);
        if (importId) rememberImport(linked, importId, matchedId);
        revised.push({
          id: matchedId,
          kind: "job",
          title: job.title,
          organization: job.company,
          location: job.location,
          startDate: job.startDate,
          endDate: job.isCurrent ? "" : job.endDate,
          isCurrent: job.isCurrent,
          description: job.description,
          achievements,
          evidenceIds: jobEvidence?.evidenceIds,
          achievementEvidenceIds: jobEvidence ? paired.map((row) => row.evidence) : undefined,
        });
        queueRevisedFacts(db, occupantId, revised[revised.length - 1]!, evidenceId, now);
        jobs += 1;
        continue;
      }
      if (rowForKey(linked, key)) {
        jobs += 1;
        continue;
      }
      const jobId = randomUUID();
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
      remember(linked, key, jobId);
      if (importId) rememberImport(linked, importId, jobId);
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

    for (const [index, school] of extracted.education.entries()) {
      const key = historyItemKey("education", {
        title: school.degree || "Education",
        organization: school.institution,
        startDate: school.startDate,
        endDate: school.endDate,
      });
      const schoolEvidence = imports?.education[index];
      const linked = itemEvidenceIds(schoolEvidence?.evidenceIds, evidenceId);
      const importId = importIdentity(roleIds?.education[index]);
      const storedId = importId ? rowForImport(linked, importId) : undefined;
      const matchedId = storedId ?? (importId ? rowForKey(linked, key) : undefined);
      if (matchedId) {
        reviseImportedSchool(db, occupantId, matchedId, school);
        remember(linked, key, matchedId);
        if (importId) rememberImport(linked, importId, matchedId);
        revised.push({
          id: matchedId,
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
        queueRevisedFacts(db, occupantId, revised[revised.length - 1]!, evidenceId, now);
        schools += 1;
        continue;
      }
      if (rowForKey(linked, key)) {
        schools += 1;
        continue;
      }
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
      remember(linked, key, schoolId);
      if (importId) rememberImport(linked, importId, schoolId);
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
    for (const [index, name] of extracted.skills.entries()) {
      const key = name.toLowerCase();
      const linked = itemEvidenceIds(
        imports ? [imports.skillEvidenceIds[index] ?? ""] : [],
        evidenceId,
      );
      const skillKey = historyItemKey("skill", { name });
      if (seen.has(key)) {
        if (known(linked, skillKey)) {
          skills += 1;
        }
        continue;
      }
      seen.add(key);
      insertSkill.run(randomUUID(), occupantId, name, now);
      remember(linked, skillKey, null);
      newSkills.push(name);
      skills += 1;
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const releaseBackfill = holdImportFactBackfill(occupantId, [
    ...roles.map((role) => role.id),
    ...revised.map((role) => role.id),
  ]);
  try {
    if (historyImportGate?.beforeFacts) await historyImportGate.beforeFacts();

    replayPendingImportFacts(db, occupantId);

    if ((evidenceId || imports) && (roles.length > 0 || newSkills.length > 0)) {
      const skillEvidenceIds = imports
        ? newSkills.map((name) => {
            const index = extracted.skills.findIndex((skill) => skill.toLowerCase() === name.toLowerCase());
            return index >= 0 ? (imports.skillEvidenceIds[index] ?? "") : "";
          })
        : undefined;
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
  } finally {
    releaseBackfill();
  }
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

function queueRevisedFacts(
  db: DatabaseSync,
  occupantId: string,
  role: ResumeImportRole,
  evidenceId: string | null | undefined,
  createdAt: string,
) {
  const linked =
    role.evidenceIds?.find((id) => id.trim()) ||
    role.achievementEvidenceIds?.find((id) => id.trim()) ||
    evidenceId ||
    "";
  if (!linked) return;
  queueImportFactSync(db, occupantId, {
    workHistoryId: role.id,
    evidenceId: linked,
    achievementEvidenceIds: role.achievementEvidenceIds ?? [],
    retireMissing: role.kind === "job",
    createdAt,
  });
}

function importIdentity(id: string | undefined): string {
  const trimmed = id?.trim() ?? "";
  if (!trimmed || trimmed.includes("\n")) return "";
  return trimmed;
}

function reviseImportedJob(
  db: DatabaseSync,
  occupantId: string,
  roleId: string,
  job: ExtractedResume["experience"][number],
  achievements: string[],
) {
  const existing = db
    .prepare("SELECT achievements_json FROM work_history WHERE id = ? AND occupant_id = ?")
    .get(roleId, occupantId) as { achievements_json: string } | undefined;
  if (!existing) return;
  db.prepare(
    `UPDATE work_history SET title = ?, company = ?, location = ?, start_date = ?,
       end_date = ?, is_current = ?, description = ?, achievements_json = ?
     WHERE id = ? AND occupant_id = ?`,
  ).run(
    job.title,
    job.company,
    job.location,
    job.startDate,
    job.isCurrent ? "" : job.endDate,
    job.isCurrent ? 1 : 0,
    job.description,
    JSON.stringify(
      reconcileRoleAchievements(
        readRoleAchievements(existing.achievements_json, randomUUID).items,
        achievements,
        randomUUID,
      ),
    ),
    roleId,
    occupantId,
  );
  if (job.site) reviseImportedSite(db, occupantId, roleId, job.site);
}

function reviseImportedSchool(
  db: DatabaseSync,
  occupantId: string,
  roleId: string,
  school: ExtractedResume["education"][number],
) {
  db.prepare(
    `UPDATE work_history SET title = ?, company = ?, location = ?, start_date = ?,
       end_date = ?, description = ?, degree = ?, field = ?
     WHERE id = ? AND occupant_id = ?`,
  ).run(
    school.degree || "Education",
    school.institution,
    school.location,
    school.startDate,
    school.endDate,
    school.description,
    school.degree,
    school.field,
    roleId,
    occupantId,
  );
  if (school.site) reviseImportedSite(db, occupantId, roleId, school.site);
}

function reviseImportedSite(
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
  const existing = db
    .prepare(
      `SELECT id FROM work_history_locations
       WHERE work_history_id = ? AND occupant_id = ? AND kind = 'primary'
       ORDER BY created_at LIMIT 1`,
    )
    .get(roleId, occupantId) as { id: string } | undefined;
  if (!existing) {
    persistExtractedSite(db, occupantId, roleId, site);
    return;
  }
  db.prepare(
    `UPDATE work_history_locations
     SET label = ?, address = ?, latitude = ?, longitude = ?
     WHERE id = ? AND occupant_id = ?`,
  ).run(
    prepared.value.label,
    prepared.value.address,
    prepared.value.latitude,
    prepared.value.longitude,
    existing.id,
    occupantId,
  );
}

/** Identity of one requested job, school, or skill already stored for this resume. */
function historyItemKey(
  kind: "role" | "education" | "skill",
  item: { title?: string; organization?: string; name?: string; startDate?: string; endDate?: string },
): string {
  if (kind === "skill") return `skill\n${(item.name ?? "").trim().toLowerCase()}`;
  return [
    kind,
    (item.organization ?? "").trim().toLowerCase(),
    (item.title ?? "").trim().toLowerCase(),
    (item.startDate ?? "").trim(),
    (item.endDate ?? "").trim(),
  ].join("\n");
}

function itemEvidenceIds(own: readonly string[] | undefined, fallback?: string | null): string[] {
  const linked = (own ?? []).map((id) => id.trim()).filter(Boolean);
  if (linked.length > 0) return [...new Set(linked)];
  const shared = fallback?.trim() ?? "";
  return shared ? [shared] : [];
}

function loadImportIndex(
  db: DatabaseSync,
  occupantId: string,
): {
  keys: Map<string, Set<string>>;
  rows: Map<string, string>;
  keyRows: Map<string, string>;
  historyIds: Set<string>;
} {
  const keys = new Map<string, Set<string>>();
  const rows = new Map<string, string>();
  const keyRows = new Map<string, string>();
  const add = (evidenceId: string, key: string, rowId?: string | null) => {
    const knownKeys = keys.get(evidenceId) ?? new Set<string>();
    knownKeys.add(key);
    keys.set(evidenceId, knownKeys);
    if (!rowId) return;
    const slot = `${evidenceId}\n${key}`;
    if (!keyRows.has(slot)) keyRows.set(slot, rowId);
  };
  const historyIds = new Set(
    (
      db.prepare("SELECT id FROM work_history WHERE occupant_id = ?").all(occupantId) as Array<{
        id: string;
      }>
    ).map((row) => row.id),
  );
  const markers = db
    .prepare(
      `SELECT evidence_id AS evidenceId, item_key AS itemKey, work_history_id AS workHistoryId
       FROM resume_import_markers WHERE occupant_id = ?`,
    )
    .all(occupantId) as Array<{ evidenceId: string; itemKey: string; workHistoryId: string | null }>;
  for (const row of markers) {
    if (row.itemKey.startsWith("import\n")) {
      const importId = row.itemKey.slice("import\n".length);
      if (importId && row.workHistoryId && historyIds.has(row.workHistoryId)) {
        rows.set(`${row.evidenceId}\n${importId}`, row.workHistoryId);
      }
      continue;
    }
    if (row.itemKey.startsWith("skill\n") || (row.workHistoryId && historyIds.has(row.workHistoryId))) {
      add(row.evidenceId, row.itemKey, row.workHistoryId);
    }
  }
  const facts = db
    .prepare(
      `SELECT fact_type AS factType, subject_id AS subjectId, value_json AS valueJson,
              evidence_ids_json AS evidenceIdsJson
       FROM career_facts
       WHERE occupant_id = ? AND status = 'canonical'
         AND fact_type IN ('role', 'education', 'skill')`,
    )
    .all(occupantId) as Array<{
    factType: string;
    subjectId: string;
    valueJson: string;
    evidenceIdsJson: string;
  }>;
  for (const row of facts) {
    if (row.factType !== "skill" && !historyIds.has(row.subjectId)) continue;
    let ids: unknown;
    let value: unknown;
    try {
      ids = JSON.parse(row.evidenceIdsJson);
      value = JSON.parse(row.valueJson);
    } catch {
      continue;
    }
    if (!Array.isArray(ids) || !value || typeof value !== "object") continue;
    const fields = value as Record<string, unknown>;
    const text = (key: string) => (typeof fields[key] === "string" ? fields[key] : "");
    const itemKey =
      row.factType === "skill"
        ? historyItemKey("skill", { name: text("name") })
        : row.factType === "role" || row.factType === "education"
          ? historyItemKey(row.factType, {
              organization: text("organization") || text("company"),
              title: text("title"),
              startDate: text("startDate"),
              endDate: text("endDate"),
            })
          : null;
    if (!itemKey) continue;
    for (const id of ids) {
      if (typeof id === "string" && id) add(id, itemKey, row.factType === "skill" ? null : row.subjectId);
    }
  }
  return { keys, rows, keyRows, historyIds };
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
