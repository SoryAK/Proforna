import { formatCareerSpan } from "./career-file";
import {
  isBlankOnboardingCheckItem,
  ONBOARDING_NO_PLACE,
  type OnboardingCheckItem,
} from "./onboarding-review";
import type { ExtractedJob, ExtractedResume, ExtractedSchool } from "./resume-extract";

/** A role confirmed in this session, still unsaved. */
export type HeldRole = {
  id: string;
  item: OnboardingCheckItem;
  /** Resume files that back the role's own fields, in the order they were accepted. */
  evidenceFiles: number[];
  /** Parallel to item.achievements. */
  achievementFiles: number[];
};

export type HeldSkill = {
  name: string;
  sourceFile: number;
};

/** A role the occupant declined. A later file may ask about it again. */
export type SetAsideRole = {
  id: string;
  item: OnboardingCheckItem;
};

export type ResumeMatchReason = "employer-and-dates" | "promotion" | "employer";

export type ResumeMatchHint = {
  roleId: string;
  reason: ResumeMatchReason;
};

export type ResumeFieldTake =
  | {
      field: "title" | "org" | "field" | "place" | "startDate" | "endDate" | "description" | "isCurrent";
    }
  | { field: "achievement"; text: string };

export type ResumeFieldDiff =
  | {
      field: "title" | "org" | "field" | "place" | "startDate" | "endDate" | "description";
      kept: string;
      incoming: string;
    }
  | { field: "isCurrent"; kept: boolean; incoming: boolean }
  | { field: "achievement"; incoming: string };

export type HeldHistory = {
  experience: ExtractedJob[];
  education: ExtractedSchool[];
  skills: string[];
  experienceEvidence: Array<{ files: number[]; achievements: number[] }>;
  educationEvidence: Array<{ files: number[] }>;
  skillFiles: number[];
};

export type HistoryEvidenceLinks = {
  experience: Array<{ resumeIds: string[]; achievementResumeIds: string[] }>;
  education: Array<{ resumeIds: string[] }>;
  skills: string[];
};

/** True when this digest is already queued. Identical bytes are refused before a read. */
export function queuedResumeDuplicate(digests: readonly string[], digest: string): boolean {
  const next = digest.trim().toLowerCase();
  if (!next) return false;
  return digests.some((row) => row.trim().toLowerCase() === next);
}

/** Indexes from one selection that are not already queued. A repeat inside the selection counts once. */
export function resumesToQueue(existing: readonly string[], incoming: readonly string[]): { indexes: number[]; skipped: number } {
  const seen = [...existing];
  const indexes: number[] = [];
  let skipped = 0;
  for (let index = 0; index < incoming.length; index += 1) {
    if (queuedResumeDuplicate(seen, incoming[index] ?? "")) {
      skipped += 1;
      continue;
    }
    seen.push(incoming[index] ?? "");
    indexes.push(index);
  }
  return { indexes, skipped };
}

/** Roles that survived Verify, attributed to the file they came from. */
export function holdVerifiedRoles(items: OnboardingCheckItem[], fileIndex: number): HeldRole[] {
  return items.filter((item) => !isBlankOnboardingCheckItem(item)).map((item) => holdRole(item, fileIndex));
}

/** A later file the occupant marked as a new role. A set-aside item is not added. */
export function addHeldRole(held: HeldRole[], item: OnboardingCheckItem, fileIndex: number): HeldRole[] {
  if (isBlankOnboardingCheckItem(item)) return held;
  return [...held, holdRole(item, fileIndex)];
}

/**
 * Hints only. A shared employer and nearby years can suggest a role.
 * The suggestion does not change either role.
 */
export function hintHeldRoles(held: readonly HeldRole[], incoming: OnboardingCheckItem): ResumeMatchHint[] {
  const org = orgKey(incoming.org);
  if (!org) return [];
  const hints: Array<ResumeMatchHint & { distance: number }> = [];
  for (const role of held) {
    if (role.item.source !== incoming.source) continue;
    if (orgKey(role.item.org) !== org) continue;
    hints.push({
      roleId: role.id,
      reason: matchReason(role.item, incoming),
      distance: startDistance(role.item, incoming),
    });
  }
  hints.sort((left, right) => {
    const rank = { "employer-and-dates": 0, promotion: 1, employer: 2 };
    if (left.reason !== right.reason) return rank[left.reason] - rank[right.reason];
    return left.distance - right.distance;
  });
  return hints.map(({ roleId, reason }) => ({ roleId, reason }));
}

export function rememberSetAside(
  current: readonly SetAsideRole[],
  item: OnboardingCheckItem,
): SetAsideRole[] {
  if (isBlankOnboardingCheckItem(item)) return [...current];
  const id = setAsideId(item);
  if (current.some((row) => row.id === id)) return [...current];
  return [...current, { id, item: { ...item, achievements: [...item.achievements] } }];
}

export function dropSetAside(current: readonly SetAsideRole[], id: string): SetAsideRole[] {
  return current.filter((row) => row.id !== id);
}

/** A later file that repeats a declined role. This does not restore it. */
export function hintSetAside(
  asides: readonly SetAsideRole[],
  incoming: OnboardingCheckItem,
): SetAsideRole | null {
  const org = orgKey(incoming.org);
  if (!org) return null;
  const matches = asides.filter((aside) => {
    if (aside.item.source !== incoming.source) return false;
    if (orgKey(aside.item.org) !== org) return false;
    return datesNear(aside.item, incoming) || isPromotion(aside.item, incoming) || sameText(aside.item.title, incoming.title);
  });
  matches.sort((left, right) => startDistance(left.item, incoming) - startDistance(right.item, incoming));
  return matches[0] ?? null;
}

/** Kept roles already stored, so a later resume can be compared with them. */
export function heldFromCareer(file: {
  jobs: Array<{
    id: string;
    title: string;
    company: string;
    location: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
    description: string;
    achievements: string[];
  }>;
  schools: Array<{
    id: string;
    institution: string;
    degree: string;
    field: string;
    location: string;
    startDate: string;
    endDate: string;
    description: string;
  }>;
}): HeldRole[] {
  const jobs = file.jobs.map((job, sourceIndex) =>
    careerHeld(job.id, {
      source: "job",
      sourceIndex,
      kind: "Job",
      org: job.company,
      title: job.title,
      field: "",
      place: job.location,
      startDate: job.startDate,
      endDate: job.endDate,
      isCurrent: job.isCurrent,
      description: job.description,
      achievements: job.achievements,
    }),
  );
  const schools = file.schools.map((school, sourceIndex) =>
    careerHeld(school.id, {
      source: "school",
      sourceIndex,
      kind: "School",
      org: school.institution,
      title: school.degree,
      field: school.field,
      place: school.location,
      startDate: school.startDate,
      endDate: school.endDate,
      isCurrent: false,
      description: school.description,
      achievements: [],
    }),
  );
  return [...jobs, ...schools];
}

export function roleTookFile(role: HeldRole, fileIndex: number): boolean {
  return role.evidenceFiles.includes(fileIndex) || role.achievementFiles.includes(fileIndex);
}

/** Fields that differ. Missing duties are not deletions, so they are not listed. */
export function roleFieldDiffs(kept: OnboardingCheckItem, incoming: OnboardingCheckItem): ResumeFieldDiff[] {
  const diffs: ResumeFieldDiff[] = [];
  pushText(diffs, "title", kept.title, incoming.title);
  pushText(diffs, "org", kept.org, incoming.org);
  pushText(diffs, "field", kept.field, incoming.field);
  if (placeKey(kept) !== placeKey(incoming)) {
    diffs.push({ field: "place", kept: displayPlace(kept), incoming: displayPlace(incoming) });
  }
  pushText(diffs, "startDate", kept.startDate, incoming.startDate);
  if (kept.isCurrent !== incoming.isCurrent) {
    diffs.push({ field: "isCurrent", kept: kept.isCurrent, incoming: incoming.isCurrent });
  } else if (!kept.isCurrent && !incoming.isCurrent) {
    pushText(diffs, "endDate", kept.endDate, incoming.endDate);
  }
  pushText(diffs, "description", kept.description, incoming.description);
  const have = new Set(kept.achievements.map((line) => line.trim().toLowerCase()).filter(Boolean));
  for (const line of incoming.achievements) {
    const text = line.trim();
    if (!text || have.has(text.toLowerCase())) continue;
    diffs.push({ field: "achievement", incoming: text });
  }
  return diffs;
}

/** Copies the chosen wording onto the kept role and remembers which file it came from. */
export function applySameRole(
  role: HeldRole,
  incoming: OnboardingCheckItem,
  fileIndex: number,
  takes: readonly ResumeFieldTake[],
): HeldRole {
  const next: HeldRole = {
    ...role,
    item: { ...role.item, achievements: [...role.item.achievements] },
    evidenceFiles: [...role.evidenceFiles],
    achievementFiles: [...role.achievementFiles],
  };
  for (const take of takes) {
    if (take.field === "achievement") {
      const text = take.text.trim();
      if (!text) continue;
      if (next.item.achievements.some((line) => line.trim().toLowerCase() === text.toLowerCase())) continue;
      next.item.achievements.push(text);
      next.achievementFiles.push(fileIndex);
      continue;
    }
    if (!next.evidenceFiles.includes(fileIndex)) next.evidenceFiles.push(fileIndex);
    if (take.field === "title") next.item.title = incoming.title;
    if (take.field === "org") next.item.org = incoming.org;
    if (take.field === "field") next.item.field = incoming.field;
    if (take.field === "place") {
      next.item.place = incoming.place;
      next.item.lat = incoming.lat;
      next.item.lng = incoming.lng;
    }
    if (take.field === "startDate") next.item.startDate = incoming.startDate;
    if (take.field === "endDate") next.item.endDate = incoming.endDate;
    if (take.field === "description") next.item.description = incoming.description;
    if (take.field === "isCurrent") {
      next.item.isCurrent = incoming.isCurrent;
      next.item.endDate = incoming.isCurrent ? "" : incoming.endDate;
    }
  }
  return retouch(next);
}

export function rememberSkills(
  current: readonly HeldSkill[],
  names: readonly string[],
  sourceFile: number,
  accept: boolean,
): HeldSkill[] {
  if (!accept) return [...current];
  const seen = new Set(current.map((skill) => skill.name.trim().toLowerCase()));
  const next = [...current];
  for (const name of names) {
    const trimmed = name.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    next.push({ name: trimmed, sourceFile });
  }
  return next;
}

/** One history write for the whole session. Each field still names the file it came from. */
export function historyFromHeld(roles: readonly HeldRole[], skills: readonly HeldSkill[]): HeldHistory {
  const experience: ExtractedJob[] = [];
  const education: ExtractedSchool[] = [];
  const experienceEvidence: HeldHistory["experienceEvidence"] = [];
  const educationEvidence: HeldHistory["educationEvidence"] = [];
  for (const role of roles) {
    if (isBlankOnboardingCheckItem(role.item)) continue;
    const place = role.item.place === ONBOARDING_NO_PLACE ? "" : role.item.place.trim();
    const site =
      role.item.lat != null && role.item.lng != null && place
        ? { label: place, address: place, latitude: role.item.lat, longitude: role.item.lng }
        : null;
    const achievements = role.item.achievements
      .map((line, index) => ({ line: line.trim(), file: role.achievementFiles[index] ?? role.evidenceFiles[0] ?? 0 }))
      .filter((row) => row.line);
    if (role.item.source === "school") {
      education.push({
        institution: role.item.org.trim() || "Untitled school",
        degree: role.item.title.trim(),
        field: role.item.field.trim(),
        location: place,
        startDate: role.item.startDate,
        endDate: role.item.endDate,
        description: role.item.description.trim(),
        site,
      });
      educationEvidence.push({ files: role.evidenceFiles.length > 0 ? [...role.evidenceFiles] : [0] });
      continue;
    }
    experience.push({
      company: role.item.org.trim() || "Untitled role",
      title: role.item.title.trim() || "Role",
      location: place,
      startDate: role.item.startDate,
      endDate: role.item.isCurrent ? "" : role.item.endDate,
      isCurrent: role.item.isCurrent,
      description: role.item.description.trim(),
      achievements: achievements.map((row) => row.line),
      site,
    });
    experienceEvidence.push({
      files: role.evidenceFiles.length > 0 ? [...role.evidenceFiles] : [0],
      achievements: achievements.map((row) => row.file),
    });
  }
  return {
    experience,
    education,
    skills: skills.map((skill) => skill.name),
    experienceEvidence,
    educationEvidence,
    skillFiles: skills.map((skill) => skill.sourceFile),
  };
}

/** Absent `evidence` keeps the single-resume save. A present block must be well formed. */
export function parseHistoryEvidence(
  raw: unknown,
): { ok: true; links: HistoryEvidenceLinks | null } | { ok: false } {
  if (!raw || typeof raw !== "object") return { ok: false };
  const body = raw as Record<string, unknown>;
  if (!("evidence" in body) || body.evidence == null) return { ok: true, links: null };
  const evidence = body.evidence;
  if (!evidence || typeof evidence !== "object") return { ok: false };
  const record = evidence as Record<string, unknown>;
  const experience = readExperienceLinks(record.experience);
  const education = readEducationLinks(record.education);
  const skills = readSkillLinks(record.skills);
  if (!experience || !education || !skills) return { ok: false };
  return { ok: true, links: { experience, education, skills } };
}

export function evidenceLinksFit(extracted: ExtractedResume, links: HistoryEvidenceLinks): boolean {
  if (links.experience.length !== extracted.experience.length) return false;
  if (links.education.length !== extracted.education.length) return false;
  if (links.skills.length !== extracted.skills.length) return false;
  return links.experience.every(
    (link, index) => link.achievementResumeIds.length === extracted.experience[index].achievements.length,
  );
}

function holdRole(item: OnboardingCheckItem, fileIndex: number): HeldRole {
  const achievements = item.achievements.map((line) => line.trim()).filter(Boolean);
  return retouch({
    id: `file-${fileIndex}-${item.source}-${item.sourceIndex}`,
    item: { ...item, achievements },
    evidenceFiles: [fileIndex],
    achievementFiles: achievements.map(() => fileIndex),
  });
}

function retouch(role: HeldRole): HeldRole {
  const achievements = role.item.achievements.map((line) => line.trim()).filter(Boolean);
  const files = role.item.achievements
    .map((line, index) => ({ line: line.trim(), file: role.achievementFiles[index] ?? role.evidenceFiles[0] ?? 0 }))
    .filter((row) => row.line)
    .map((row) => row.file);
  const description = role.item.description.trim();
  const endDate = role.item.isCurrent ? "" : role.item.endDate;
  return {
    ...role,
    item: {
      ...role.item,
      achievements,
      description,
      endDate,
      span: formatCareerSpan(role.item.startDate, endDate, role.item.isCurrent),
      lines: [...achievements, description].filter(Boolean),
    },
    achievementFiles: files,
  };
}

function pushText(
  diffs: ResumeFieldDiff[],
  field: "title" | "org" | "field" | "place" | "startDate" | "endDate" | "description",
  kept: string,
  incoming: string,
) {
  if (kept.trim() === incoming.trim()) return;
  diffs.push({ field, kept: kept.trim(), incoming: incoming.trim() });
}

function displayPlace(item: OnboardingCheckItem): string {
  return item.place === ONBOARDING_NO_PLACE ? "" : item.place.trim();
}

function placeKey(item: OnboardingCheckItem): string {
  return `${displayPlace(item)}|${item.lat ?? ""}|${item.lng ?? ""}`;
}

function orgKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(incorporated|inc|llc|ltd|corp|co|company)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function months(value: string): number | null {
  const match = /^(\d{4})(?:-(\d{2}))?/.exec(value.trim());
  if (!match) return null;
  const month = match[2] ? Number(match[2]) : 1;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return Number(match[1]) * 12 + (month - 1);
}

function matchReason(kept: OnboardingCheckItem, incoming: OnboardingCheckItem): ResumeMatchReason {
  if (isPromotion(kept, incoming)) return "promotion";
  if (datesNear(kept, incoming)) return "employer-and-dates";
  return "employer";
}

function isPromotion(kept: OnboardingCheckItem, incoming: OnboardingCheckItem): boolean {
  if (sameText(kept.title, incoming.title)) return false;
  const left = span(kept);
  const right = span(incoming);
  if (!left || !right) return false;
  const earlier = left.start <= right.start ? left : right;
  const later = left.start <= right.start ? right : left;
  if (later.start - earlier.start <= 1) return false;
  const gap = later.start - earlier.start === 0 ? 0 : later.start - earlier.end;
  return gap >= -1 && gap <= 6;
}

function sameText(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function setAsideId(item: OnboardingCheckItem): string {
  return [item.source, orgKey(item.org), item.title.trim().toLowerCase(), item.startDate.trim()].join(":");
}

function careerHeld(
  id: string,
  input: {
    source: OnboardingCheckItem["source"];
    sourceIndex: number;
    kind: OnboardingCheckItem["kind"];
    org: string;
    title: string;
    field: string;
    place: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
    description: string;
    achievements: string[];
  },
): HeldRole {
  const achievements = input.achievements.map((line) => line.trim()).filter(Boolean);
  const place = input.place.trim() || ONBOARDING_NO_PLACE;
  const description = input.description.trim();
  const endDate = input.isCurrent ? "" : input.endDate;
  return {
    id,
    item: {
      source: input.source,
      sourceIndex: input.sourceIndex,
      kind: input.kind,
      org: input.org.trim() || (input.kind === "School" ? "Untitled school" : "Untitled role"),
      title: input.title.trim(),
      field: input.field.trim(),
      place,
      span: formatCareerSpan(input.startDate, endDate, input.isCurrent),
      startDate: input.startDate,
      endDate,
      isCurrent: input.isCurrent,
      description,
      achievements,
      lines: [...achievements, description].filter(Boolean),
      lat: null,
      lng: null,
    },
    evidenceFiles: [],
    achievementFiles: achievements.map(() => -1),
  };
}

function datesNear(left: OnboardingCheckItem, right: OnboardingCheckItem): boolean {
  const a = span(left);
  const b = span(right);
  if (!a || !b) return false;
  const overlap = a.start <= b.end && b.start <= a.end;
  const startsClose = Math.abs(a.start - b.start) <= 12;
  return overlap || startsClose;
}

function span(item: OnboardingCheckItem): { start: number; end: number } | null {
  const start = months(item.startDate);
  if (start == null) return null;
  if (item.isCurrent || !item.endDate.trim()) return { start, end: start + 12 * 80 };
  const end = months(item.endDate);
  if (end == null) return { start, end: start };
  return { start, end: Math.max(start, end) };
}

function startDistance(left: OnboardingCheckItem, right: OnboardingCheckItem): number {
  const a = months(left.startDate);
  const b = months(right.startDate);
  if (a == null || b == null) return Number.MAX_SAFE_INTEGER;
  return Math.abs(a - b);
}

function readExperienceLinks(
  raw: unknown,
): HistoryEvidenceLinks["experience"] | null {
  if (!Array.isArray(raw)) return null;
  const links: HistoryEvidenceLinks["experience"] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const record = entry as Record<string, unknown>;
    const resumeIds = readIdList(record.resumeIds);
    const achievementResumeIds = readIdList(record.achievements);
    if (!resumeIds || !achievementResumeIds || resumeIds.length === 0) return null;
    links.push({ resumeIds, achievementResumeIds });
  }
  return links;
}

function readEducationLinks(raw: unknown): HistoryEvidenceLinks["education"] | null {
  if (!Array.isArray(raw)) return null;
  const links: HistoryEvidenceLinks["education"] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const resumeIds = readIdList((entry as Record<string, unknown>).resumeIds);
    if (!resumeIds || resumeIds.length === 0) return null;
    links.push({ resumeIds });
  }
  return links;
}

function readSkillLinks(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const ids: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string" || !entry.trim()) return null;
    ids.push(entry.trim());
  }
  return ids;
}

function readIdList(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const ids: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string" || !entry.trim()) return null;
    ids.push(entry.trim());
  }
  return ids;
}
