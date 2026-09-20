import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  EMPTY_WORK_MAP_DETAILS,
  attachFactsToWorkMapRole,
  buildWorkMapSnapshot,
  normalizeSlug,
  planWorkMapPublicationSettings,
  planWorkMapRoleFactSync,
  type WorkMapLocation,
  type WorkMapMedia,
  type WorkMapMoment,
  type WorkMapPublicationSettings,
  type WorkMapRole,
  type WorkMapRoleDetails,
  type WorkMapSnapshot,
} from "../core/index";
import {
  mintOccupantApproval,
  persistApprovedChange,
  persistAuditEvent,
} from "./change-sets";
import {
  backfillCareerMemory,
  commitOccupantFactOperations,
  readCareerMemory,
  saveEvidence,
} from "./career-memory";
import { loadCareerFile } from "./history";
import { readProfile } from "./occupant";

type JsonObject = Record<string, unknown>;

export function readWorkMap(db: DatabaseSync, occupantId: string) {
  backfillCareerMemory(db, occupantId);
  const career = loadCareerFile(db, occupantId);
  const facts = readCareerMemory(db, occupantId).facts;
  const records = db
    .prepare(
      `SELECT id, kind, title, company, location, start_date, end_date,
              is_current, description, achievements_json
       FROM work_history WHERE occupant_id = ?`,
    )
    .all(occupantId) as JsonObject[];
  const roles = records.map((row) =>
    attachFactsToWorkMapRole(mapRole(db, occupantId, row), facts),
  );
  return {
    profile: readProfile(db, occupantId),
    roles,
    skills: career.skills,
    settings: readWorkMapSettings(db, occupantId),
    stats: {
      roles: roles.filter((role) => role.kind === "job").length,
      education: roles.filter((role) => role.kind === "school").length,
      mapped: roles.filter((role) => role.locations.length > 0).length,
      publicMedia: roles.flatMap((role) => role.media).filter((item) => item.isPublic)
        .length,
    },
  };
}

export async function updateWorkMapRole(
  db: DatabaseSync,
  occupantId: string,
  roleId: string,
  input: JsonObject,
) {
  requireRole(db, occupantId, roleId);
  backfillCareerMemory(db, occupantId);
  const existing = db
    .prepare(
      `SELECT title, company, location, start_date, end_date, is_current,
              description, achievements_json
       FROM work_history WHERE id = ? AND occupant_id = ?`,
    )
    .get(roleId, occupantId) as JsonObject;
  const achievements = stringArray(input.achievements);
  db.prepare(
    `UPDATE work_history SET title = ?, company = ?, location = ?,
       start_date = ?, end_date = ?, is_current = ?, description = ?,
       achievements_json = ? WHERE id = ? AND occupant_id = ?`,
  ).run(
    text(input.title) || String(existing.title),
    text(input.organization) || String(existing.company),
    text(input.locationLabel) || String(existing.location),
    text(input.startDate) || String(existing.start_date),
    "endDate" in input ? text(input.endDate) : String(existing.end_date),
    typeof input.isCurrent === "boolean"
      ? Number(input.isCurrent)
      : Number(existing.is_current),
    "description" in input ? text(input.description) : String(existing.description),
    achievements.length
      ? JSON.stringify(achievements)
      : String(existing.achievements_json),
    roleId,
    occupantId,
  );
  const updated = db
    .prepare(
      `SELECT id, kind, title, company, location, start_date, end_date,
              is_current, description, achievements_json
       FROM work_history WHERE id = ? AND occupant_id = ?`,
    )
    .get(roleId, occupantId) as JsonObject;
  const role = mapRole(db, occupantId, updated);
  const evidence = saveEvidence(db, occupantId, {
    sourceType: "work-map",
    sourceRef: `work-map:${roleId}:${randomUUID()}`,
    title: `Work Map edit: ${role.title}`,
    content: {
      roleId,
      title: role.title,
      organization: role.organization,
      locationLabel: role.locationLabel,
      startDate: role.startDate,
      endDate: role.endDate,
      isCurrent: role.isCurrent,
      description: role.description,
      achievements: role.achievements,
    },
  });
  const facts = readCareerMemory(db, occupantId).facts;
  await commitOccupantFactOperations(
    db,
    occupantId,
    `Sync Work Map role: ${role.title}`,
    planWorkMapRoleFactSync({
      role,
      facts,
      evidenceId: evidence.id,
    }),
  );
  return readWorkMap(db, occupantId).roles.find((item) => item.id === roleId);
}

export function saveWorkMapDetails(
  db: DatabaseSync,
  occupantId: string,
  roleId: string,
  input: JsonObject,
): WorkMapRoleDetails {
  requireRole(db, occupantId, roleId);
  const current = readDetails(db, occupantId, roleId);
  const details: WorkMapRoleDetails = {
    techStack: arrayOrCurrent(input.techStack, current.techStack),
    milestones: momentsOrCurrent(input.milestones, current.milestones),
    events: momentsOrCurrent(input.events, current.events),
    notes: momentsOrCurrent(input.notes, current.notes),
    compensation: isObject(input.compensation)
      ? {
          currency: text(input.compensation.currency) || current.compensation.currency,
          period:
            input.compensation.period === "hourly" ? "hourly" : "annual",
          amount:
            typeof input.compensation.amount === "number"
              ? input.compensation.amount
              : current.compensation.amount,
          visibility:
            input.compensation.visibility === "public" ||
            input.compensation.visibility === "range"
              ? input.compensation.visibility
              : "private",
        }
      : current.compensation,
    schedule: isObject(input.schedule)
      ? {
          shift: text(input.schedule.shift),
          hoursPerWeek:
            typeof input.schedule.hoursPerWeek === "number"
              ? input.schedule.hoursPerWeek
              : null,
          workMode:
            input.schedule.workMode === "remote" ||
            input.schedule.workMode === "hybrid"
              ? input.schedule.workMode
              : "onsite",
        }
      : current.schedule,
    benefits: arrayOrCurrent(input.benefits, current.benefits),
    paidTimeOff:
      "paidTimeOff" in input ? text(input.paidTimeOff) : current.paidTimeOff,
    environment:
      "environment" in input ? text(input.environment) : current.environment,
    growth: "growth" in input ? text(input.growth) : current.growth,
    departure: "departure" in input ? text(input.departure) : current.departure,
    workplaceRating:
      typeof input.workplaceRating === "number"
        ? Math.max(1, Math.min(5, input.workplaceRating))
        : current.workplaceRating,
    uniform: "uniform" in input ? text(input.uniform) : current.uniform,
    equipment: arrayOrCurrent(input.equipment, current.equipment),
    skills: arrayOrCurrent(input.skills, current.skills),
  };
  db.prepare(
    `INSERT INTO work_history_details
      (work_history_id, occupant_id, details_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(work_history_id) DO UPDATE SET
       details_json = excluded.details_json,
       updated_at = excluded.updated_at`,
  ).run(roleId, occupantId, JSON.stringify(details), new Date().toISOString());
  return details;
}

export function addWorkMapLocation(
  db: DatabaseSync,
  occupantId: string,
  roleId: string,
  input: JsonObject,
): WorkMapLocation {
  requireRole(db, occupantId, roleId);
  const latitude = number(input.latitude);
  const longitude = number(input.longitude);
  if (latitude === null || longitude === null) {
    throw new WorkMapStoreError("coordinates-required");
  }
  const location: WorkMapLocation = {
    id: randomUUID(),
    label: text(input.label) || "Work site",
    address: text(input.address),
    latitude,
    longitude,
    kind: parseLocationKind(input.kind),
    isPublic: input.isPublic === true,
  };
  db.prepare(
    `INSERT INTO work_history_locations
      (id, work_history_id, occupant_id, label, address, latitude, longitude,
       kind, is_public, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    location.id,
    roleId,
    occupantId,
    location.label,
    location.address,
    latitude,
    longitude,
    location.kind,
    Number(location.isPublic),
    new Date().toISOString(),
  );
  return location;
}

export function addWorkMapMedia(
  db: DatabaseSync,
  occupantId: string,
  roleId: string,
  input: JsonObject,
): WorkMapMedia {
  requireRole(db, occupantId, roleId);
  const url = text(input.url);
  if (!url) throw new WorkMapStoreError("media-url-required");
  const media: WorkMapMedia = {
    id: randomUUID(),
    kind:
      input.kind === "video" || input.kind === "attachment"
        ? input.kind
        : "photo",
    title: text(input.title) || "Career media",
    url,
    caption: text(input.caption),
    isPublic: input.isPublic === true,
  };
  db.prepare(
    `INSERT INTO work_history_media
      (id, work_history_id, occupant_id, kind, title, url, caption, is_public,
       created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    media.id,
    roleId,
    occupantId,
    media.kind,
    media.title,
    media.url,
    media.caption,
    Number(media.isPublic),
    new Date().toISOString(),
  );
  return media;
}

export function readWorkMapSettings(
  db: DatabaseSync,
  occupantId: string,
): WorkMapPublicationSettings {
  const row = db
    .prepare(
      "SELECT settings_json FROM work_map_publication_settings WHERE occupant_id = ?",
    )
    .get(occupantId) as { settings_json: string } | undefined;
  if (row) return JSON.parse(row.settings_json) as WorkMapPublicationSettings;
  const profile = readProfile(db, occupantId);
  return {
    slug: normalizeSlug(profile.fullName) || "career-map",
    targetRole: profile.headline,
    theme: "dark",
    visibility: "unlisted",
    sections: [
      "profile",
      "history",
      "map",
      "milestones",
      "media",
      "skills",
      "contact",
    ],
    hideCurrentEmployer: false,
    showExactLocations: false,
    expiresAt: null,
  };
}

export async function saveWorkMapSettings(
  db: DatabaseSync,
  occupantId: string,
  input: JsonObject,
): Promise<WorkMapPublicationSettings> {
  const current = readWorkMapSettings(db, occupantId);
  const allowedSections = new Set([
    "profile",
    "history",
    "map",
    "milestones",
    "media",
    "skills",
    "contact",
  ]);
  const settings: WorkMapPublicationSettings = {
    slug: normalizeSlug(text(input.slug) || current.slug),
    targetRole:
      "targetRole" in input ? text(input.targetRole) : current.targetRole,
    theme:
      input.theme === "light" || input.theme === "system"
        ? input.theme
        : "dark",
    visibility:
      input.visibility === "public" ||
      input.visibility === "access-controlled" ||
      input.visibility === "stealth" ||
      input.visibility === "anonymous" ||
      input.visibility === "private"
        ? input.visibility
        : "unlisted",
    sections: Array.isArray(input.sections)
      ? (input.sections.filter(
          (section): section is WorkMapPublicationSettings["sections"][number] =>
            typeof section === "string" && allowedSections.has(section),
        ) as WorkMapPublicationSettings["sections"])
      : current.sections,
    hideCurrentEmployer:
      typeof input.hideCurrentEmployer === "boolean"
        ? input.hideCurrentEmployer
        : current.hideCurrentEmployer,
    showExactLocations:
      typeof input.showExactLocations === "boolean"
        ? input.showExactLocations
        : current.showExactLocations,
    expiresAt:
      "expiresAt" in input ? text(input.expiresAt) || null : current.expiresAt,
  };
  if (!settings.slug) throw new WorkMapStoreError("slug-required");
  const operations = planWorkMapPublicationSettings({
    current,
    next: settings,
  });
  const now = new Date().toISOString();
  if (operations.length === 0) return settings;
  const minted = await mintOccupantApproval(occupantId, {
    purpose: "Update Work Map publication settings",
    destination: "work-map:publication-settings",
    operations,
    now,
  });
  db.exec("BEGIN");
  try {
    persistApprovedChange(db, minted.changeSet, minted.hash, minted.approval);
    db.prepare(
      `INSERT INTO work_map_publication_settings
        (occupant_id, settings_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(occupant_id) DO UPDATE SET
         settings_json = excluded.settings_json,
         updated_at = excluded.updated_at`,
    ).run(occupantId, JSON.stringify(settings), now);
    persistAuditEvent(db, {
      id: randomUUID(),
      occupantId,
      eventType: "publication-settings-updated",
      entityType: "work-map-publication-settings",
      entityId: occupantId,
      changeSetId: minted.changeSet.id,
      approvalId: minted.approval.id,
      detail: { from: current, to: settings },
      occurredAt: now,
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return settings;
}

export function createWorkMapSnapshot(
  db: DatabaseSync,
  occupantId: string,
): WorkMapSnapshot {
  const source = readWorkMap(db, occupantId);
  const profile = readProfile(db, occupantId);
  const createdAt = new Date().toISOString();
  const sourceFingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        profile,
        roles: source.roles,
        skills: source.skills,
        settings: source.settings,
      }),
    )
    .digest("hex");
  const snapshot = buildWorkMapSnapshot({
    id: randomUUID(),
    occupantId,
    profile,
    roles: source.roles,
    skills: source.skills,
    settings: source.settings,
    sourceFingerprint,
    createdAt,
  });
  db.prepare(
    `INSERT INTO work_map_snapshots
      (id, occupant_id, slug, snapshot_json, source_fingerprint, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    snapshot.id,
    occupantId,
    snapshot.slug,
    JSON.stringify(snapshot),
    sourceFingerprint,
    createdAt,
  );
  return snapshot;
}

function mapRole(
  db: DatabaseSync,
  occupantId: string,
  row: JsonObject,
): WorkMapRole {
  return {
    id: String(row.id),
    kind: row.kind === "school" ? "school" : "job",
    title: String(row.title),
    organization: String(row.company),
    locationLabel: String(row.location),
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    isCurrent: Number(row.is_current) === 1,
    description: String(row.description),
    achievements: parseStringArray(row.achievements_json),
    factId: null,
    factVersion: null,
    evidenceIds: [],
    claims: [],
    locations: readLocations(db, occupantId, String(row.id)),
    media: readMedia(db, occupantId, String(row.id)),
    details: readDetails(db, occupantId, String(row.id)),
  };
}

function readDetails(
  db: DatabaseSync,
  occupantId: string,
  roleId: string,
): WorkMapRoleDetails {
  const row = db
    .prepare(
      `SELECT details_json FROM work_history_details
       WHERE work_history_id = ? AND occupant_id = ?`,
    )
    .get(roleId, occupantId) as { details_json: string } | undefined;
  return row
    ? ({ ...EMPTY_WORK_MAP_DETAILS, ...JSON.parse(row.details_json) } as WorkMapRoleDetails)
    : structuredClone(EMPTY_WORK_MAP_DETAILS);
}

function readLocations(
  db: DatabaseSync,
  occupantId: string,
  roleId: string,
): WorkMapLocation[] {
  return (
    db
      .prepare(
        `SELECT id, label, address, latitude, longitude, kind, is_public
         FROM work_history_locations
         WHERE work_history_id = ? AND occupant_id = ? ORDER BY created_at`,
      )
      .all(roleId, occupantId) as JsonObject[]
  ).map((row) => ({
    id: String(row.id),
    label: String(row.label),
    address: String(row.address),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    kind: parseLocationKind(row.kind),
    isPublic: Number(row.is_public) === 1,
  }));
}

function readMedia(
  db: DatabaseSync,
  occupantId: string,
  roleId: string,
): WorkMapMedia[] {
  return (
    db
      .prepare(
        `SELECT id, kind, title, url, caption, is_public
         FROM work_history_media
         WHERE work_history_id = ? AND occupant_id = ? ORDER BY created_at`,
      )
      .all(roleId, occupantId) as JsonObject[]
  ).map((row) => ({
    id: String(row.id),
    kind:
      row.kind === "video" || row.kind === "attachment"
        ? row.kind
        : "photo",
    title: String(row.title),
    url: String(row.url),
    caption: String(row.caption),
    isPublic: Number(row.is_public) === 1,
  }));
}

function requireRole(db: DatabaseSync, occupantId: string, roleId: string) {
  if (
    !db
      .prepare("SELECT id FROM work_history WHERE id = ? AND occupant_id = ?")
      .get(roleId, occupantId)
  ) {
    throw new WorkMapStoreError("role-missing");
  }
}

function momentsOrCurrent(
  value: unknown,
  current: WorkMapMoment[],
): WorkMapMoment[] {
  if (!Array.isArray(value)) return current;
  return value.filter(isObject).map((moment) => ({
    id: text(moment.id) || randomUUID(),
    date: text(moment.date),
    title: text(moment.title),
    detail: text(moment.detail),
    isPublic: moment.isPublic === true,
  }));
}

function arrayOrCurrent(value: unknown, current: string[]) {
  return Array.isArray(value) ? stringArray(value) : current;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function parseStringArray(value: unknown): string[] {
  try {
    return stringArray(JSON.parse(String(value)));
  } catch {
    return [];
  }
}

function parseLocationKind(value: unknown): WorkMapLocation["kind"] {
  return value === "site" || value === "client" || value === "travel"
    ? value
    : "primary";
}

function number(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export class WorkMapStoreError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
