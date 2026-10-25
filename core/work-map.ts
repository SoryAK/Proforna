import { formatHistoryPlace } from "./career-history";
import type { ProjectionVisibility } from "./projection";
import {
  canonicalFacts,
  type CareerFactVersion,
} from "./career-memory";
import {
  stableStringify,
  type ChangeOperation,
} from "./governance";

export type WorkMapLocation = {
  id: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  kind: "primary" | "site" | "client" | "travel";
  isPublic: boolean;
};

export type WorkMapMedia = {
  id: string;
  kind: "photo" | "video" | "attachment";
  title: string;
  url: string;
  caption: string;
  isPublic: boolean;
};

export function roleCoverPhoto(media: WorkMapMedia[]): WorkMapMedia | null {
  for (let index = media.length - 1; index >= 0; index -= 1) {
    const item = media[index];
    if (item?.kind === "photo") return item;
  }
  return null;
}

export const LINKED_EVIDENCE_KINDS = [
  "review",
  "article",
  "talk",
  "press-release",
  "social-post",
  "award",
] as const;

export const LINKED_EVIDENCE_CREDITS = ["names-me", "about-my-work"] as const;

export type LinkedEvidence = {
  id: string;
  evidenceId: string | null;
  url: string;
  title: string;
  outlet: string;
  publishedOn: string;
  kind: (typeof LINKED_EVIDENCE_KINDS)[number];
  contribution: string;
  credit: (typeof LINKED_EVIDENCE_CREDITS)[number];
  quote: string;
  timestamp: string;
  pin:
    | { kind: "achievement"; statement: string }
    | { kind: "event"; id: string }
    | null;
  isPublic: boolean;
};

export type PreparedLinkedEvidence = Omit<LinkedEvidence, "id" | "evidenceId">;

export type PublishedLinkedEvidence = Omit<LinkedEvidence, "evidenceId">;

export type LinkedEvidenceError =
  | "url-invalid"
  | "title-required"
  | "kind-invalid"
  | "credit-invalid"
  | "pin-missing"
  | "date-invalid"
  | "timestamp-invalid";

export function prepareLinkedEvidence(
  input: Record<string, unknown>,
  role: Pick<WorkMapRole, "achievements" | "details">,
):
  | { ok: true; value: PreparedLinkedEvidence }
  | { ok: false; error: LinkedEvidenceError } {
  const url = text(input.url);
  if (!isLinkedEvidenceUrl(url)) return { ok: false, error: "url-invalid" };
  const title = text(input.title);
  if (!title) return { ok: false, error: "title-required" };
  const kind = oneOf(LINKED_EVIDENCE_KINDS, input.kind);
  if (!kind) return { ok: false, error: "kind-invalid" };
  const credit = oneOf(LINKED_EVIDENCE_CREDITS, input.credit);
  if (!credit) return { ok: false, error: "credit-invalid" };
  const pin = linkedEvidencePin(input.pin, role);
  if (pin === undefined) return { ok: false, error: "pin-missing" };
  const publishedOn = text(input.publishedOn);
  if (publishedOn && !isCalendarDate(publishedOn)) {
    return { ok: false, error: "date-invalid" };
  }
  const timestamp = text(input.timestamp);
  if (timestamp && !/^(?:\d+:[0-5]\d:[0-5]\d|\d{1,3}:[0-5]\d)$/.test(timestamp)) {
    return { ok: false, error: "timestamp-invalid" };
  }
  return {
    ok: true,
    value: {
      url,
      title,
      outlet: text(input.outlet),
      publishedOn,
      kind,
      contribution: text(input.contribution),
      credit,
      quote: text(input.quote),
      timestamp,
      pin,
      isPublic: input.isPublic === true,
    },
  };
}

export function groupLinkedEvidence<T extends Pick<LinkedEvidence, "pin">>(
  achievements: string[],
  items: T[] | undefined,
): { achievements: Array<{ statement: string; evidence: T[] }>; other: T[] } {
  const grouped = achievements.map((statement) => ({ statement, evidence: [] as T[] }));
  const other: T[] = [];
  for (const item of items ?? []) {
    const wanted =
      item.pin?.kind === "achievement" ? item.pin.statement.trim().toLowerCase() : null;
    const home = wanted
      ? grouped.find((entry) => entry.statement.trim().toLowerCase() === wanted)
      : undefined;
    if (home) home.evidence.push(item);
    else other.push(item);
  }
  return { achievements: grouped, other };
}

export function prepareLinkedEvidenceDelete(input: {
  id?: unknown;
}):
  | { ok: true; value: { id: string } }
  | { ok: false; error: "linked-evidence-missing" } {
  const id = text(input.id);
  if (!id) return { ok: false, error: "linked-evidence-missing" };
  return { ok: true, value: { id } };
}

export function linkedEvidenceFromPage(page: {
  url: string;
  title: string;
  meta: Record<string, string>;
}): Pick<LinkedEvidence, "title" | "outlet" | "publishedOn" | "kind"> {
  const published = text(page.meta["article:published_time"]).slice(0, 10);
  return {
    title: text(page.meta["og:title"]) || text(page.title),
    outlet: text(page.meta["og:site_name"]) || pageHost(page.url),
    publishedOn: isCalendarDate(published) ? published : "",
    kind: text(page.meta["og:type"]).startsWith("video") ? "talk" : "article",
  };
}

function pageHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function linkedEvidencePin(
  value: unknown,
  role: Pick<WorkMapRole, "achievements" | "details">,
): LinkedEvidence["pin"] | undefined {
  if (value == null) return null;
  if (typeof value !== "object") return undefined;
  const pin = value as Record<string, unknown>;
  if (pin.kind === "event") {
    const id = text(pin.id);
    return role.details.events.some((event) => event.id === id)
      ? { kind: "event", id }
      : undefined;
  }
  if (pin.kind === "achievement") {
    const wanted = text(pin.statement).toLowerCase();
    const statement = role.achievements.find(
      (achievement) => achievement.trim().toLowerCase() === wanted,
    );
    return statement ? { kind: "achievement", statement: statement.trim() } : undefined;
  }
  return undefined;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown): T | null {
  return (allowed as readonly unknown[]).includes(value) ? (value as T) : null;
}

export function isLinkedEvidenceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export type WorkMapMoment = {
  id: string;
  date: string;
  title: string;
  detail: string;
  isPublic: boolean;
};

export type WorkMapColleague = {
  id: string;
  name: string;
  title: string;
  note: string;
  url: string;
};

export const WORK_MAP_OVERVIEW_FIELDS = [
  { key: "achievements", label: "Achievements" },
  { key: "events", label: "Events" },
  { key: "media", label: "Media" },
  { key: "tools", label: "Tools" },
  { key: "milestones", label: "Milestones" },
  { key: "skills", label: "Skills" },
  { key: "equipment", label: "Equipment" },
  { key: "colleagues", label: "Worked with" },
] as const;

export type WorkMapOverviewField =
  (typeof WORK_MAP_OVERVIEW_FIELDS)[number]["key"];

export const DEFAULT_WORK_MAP_OVERVIEW_FIELDS: WorkMapOverviewField[] = [
  "achievements",
  "events",
  "media",
  "tools",
];

export type WorkMapRoleDetails = {
  summary: string;
  website: string;
  linkedin: string;
  colleagues: WorkMapColleague[];
  overviewFields: WorkMapOverviewField[] | null;
  techStack: string[];
  milestones: WorkMapMoment[];
  events: WorkMapMoment[];
  notes: WorkMapMoment[];
  compensation: {
    currency: string;
    period: "hourly" | "annual";
    amount: number | null;
    visibility: "private" | "range" | "public";
  };
  schedule: {
    shift: string;
    hoursPerWeek: number | null;
    workMode: "onsite" | "hybrid" | "remote";
  };
  benefits: string[];
  paidTimeOff: string;
  environment: string;
  growth: string;
  departure: string;
  workplaceRating: number | null;
  uniform: string;
  equipment: string[];
  skills: string[];
  share: WorkMapShare;
};

export type WorkMapShare = {
  growth: boolean;
  departure: boolean;
  schedule: boolean;
  benefits: boolean;
  paidTimeOff: boolean;
  environment: boolean;
  workplaceRating: boolean;
  equipment: boolean;
  uniform: boolean;
};

export type WorkMapClaim = {
  text: string;
  factId: string;
  factVersion: number;
  evidenceIds: string[];
};

export type WorkMapRole = {
  id: string;
  kind: "job" | "school" | "internship";
  title: string;
  organization: string;
  locationLabel: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
  achievements: string[];
  factId: string | null;
  factVersion: number | null;
  evidenceIds: string[];
  claims: WorkMapClaim[];
  locations: WorkMapLocation[];
  media: WorkMapMedia[];
  linkedEvidence: LinkedEvidence[];
  details: WorkMapRoleDetails;
};

export type WorkMapPublishSection =
  | "profile"
  | "history"
  | "map"
  | "milestones"
  | "media"
  | "evidence"
  | "skills"
  | "contact";

export type WorkMapPublicationSettings = {
  slug: string;
  targetRole: string;
  theme: "dark" | "light" | "system";
  visibility: ProjectionVisibility;
  sections: WorkMapPublishSection[];
  hideCurrentEmployer: boolean;
  showExactLocations: boolean;
  expiresAt: string | null;
};

export function publicationAllowsSnapshot(
  visibility: WorkMapPublicationSettings["visibility"],
): boolean {
  return visibility !== "private";
}

export type PublicationEmbed =
  | { ok: true; page: string; code: string }
  | {
      ok: false;
      reason: "private" | "access-controlled" | "slug" | "origin";
    };

export function publicationEmbed(input: {
  origin: string | null | undefined;
  slug: string;
  visibility: WorkMapPublicationSettings["visibility"];
}): PublicationEmbed {
  if (input.visibility === "private") return { ok: false, reason: "private" };
  if (input.visibility === "access-controlled") {
    return { ok: false, reason: "access-controlled" };
  }
  const slug = normalizeSlug(input.slug);
  if (!slug) return { ok: false, reason: "slug" };
  const origin = embedOrigin(input.origin);
  if (!origin) return { ok: false, reason: "origin" };
  const page = `${origin}/r/${encodeURIComponent(slug)}?embed=1`;
  const code = `<iframe src="${page}" title="Career" width="100%" height="640" style="border:0"></iframe>`;
  return { ok: true, page, code };
}

function embedOrigin(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function publicationNeedsAudienceConfirm(input: {
  visibility: WorkMapPublicationSettings["visibility"];
  liveStatus?: string | null;
}): boolean {
  return (
    !publicationAllowsSnapshot(input.visibility) ||
    input.liveStatus !== "published"
  );
}

export function prepareWorkMapRoleDelete(input: {
  id?: unknown;
}):
  | { ok: true; value: { id: string } }
  | { ok: false; error: "role-missing" } {
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!id) return { ok: false, error: "role-missing" };
  return { ok: true, value: { id } };
}

export function prepareWorkMapRoleCreate(input: {
  kind?: unknown;
}):
  | { ok: true; value: { kind: WorkMapRole["kind"] } }
  | { ok: false; error: "kind-invalid" } {
  if (
    input.kind === "job" ||
    input.kind === "internship" ||
    input.kind === "school"
  ) {
    return { ok: true, value: { kind: input.kind } };
  }
  return { ok: false, error: "kind-invalid" };
}

export type WorkMapSnapshot = {
  id: string;
  occupantId: string;
  slug: string;
  visibility: ProjectionVisibility;
  targetRole: string;
  theme: WorkMapPublicationSettings["theme"];
  profile: {
    displayName: string;
    headline: string;
    city: string;
    state: string;
    bio: string;
    links: { linkedin: string; github: string; portfolio: string };
  };
  roles: Array<{
    id: string;
    kind: WorkMapRole["kind"];
    title: string;
    organization: string;
    span: string;
    place: string;
    description: string;
    achievements: string[];
    locations: WorkMapLocation[];
    media: WorkMapMedia[];
    linkedEvidence: PublishedLinkedEvidence[];
    milestones: WorkMapMoment[];
    events: WorkMapMoment[];
    techStack: string[];
    skills: string[];
    growth?: string;
    departure?: string;
    schedule?: WorkMapRoleDetails["schedule"];
    benefits?: string[];
    paidTimeOff?: string;
    environment?: string;
    workplaceRating?: number;
    equipment?: string[];
    uniform?: string;
    compensation?: {
      currency: string;
      period: "hourly" | "annual";
      amount: number | null;
    };
  }>;
  skills: string[];
  sections: WorkMapPublishSection[];
  expiresAt: string | null;
  sourceFingerprint: string;
  createdAt: string;
};

export const EMPTY_WORK_MAP_DETAILS: WorkMapRoleDetails = {
  summary: "",
  website: "",
  linkedin: "",
  colleagues: [],
  overviewFields: null,
  techStack: [],
  milestones: [],
  events: [],
  notes: [],
  compensation: {
    currency: "USD",
    period: "annual",
    amount: null,
    visibility: "private",
  },
  schedule: { shift: "", hoursPerWeek: null, workMode: "onsite" },
  benefits: [],
  paidTimeOff: "",
  environment: "",
  growth: "",
  departure: "",
  workplaceRating: null,
  uniform: "",
  equipment: [],
  skills: [],
  share: {
    growth: false,
    departure: false,
    schedule: false,
    benefits: false,
    paidTimeOff: false,
    environment: false,
    workplaceRating: false,
    equipment: false,
    uniform: false,
  },
};

export function normalizeWorkMapDetails(
  details: Partial<WorkMapRoleDetails> | null | undefined,
): WorkMapRoleDetails {
  const empty = structuredClone(EMPTY_WORK_MAP_DETAILS);
  return {
    ...empty,
    ...details,
    compensation: { ...empty.compensation, ...details?.compensation },
    schedule: { ...empty.schedule, ...details?.schedule },
    share: { ...empty.share, ...details?.share },
    summary: typeof details?.summary === "string" ? details.summary.trim() : "",
    website: workMapLink(details?.website),
    linkedin: workMapLink(details?.linkedin),
    colleagues: workMapColleagues(details?.colleagues),
    overviewFields: workMapOverviewFields(details?.overviewFields),
  };
}

export function workMapOverviewFields(
  value: unknown,
): WorkMapOverviewField[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const allowed = new Set<string>(WORK_MAP_OVERVIEW_FIELDS.map((field) => field.key));
  const seen = new Set<string>();
  const fields: WorkMapOverviewField[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !allowed.has(item) || seen.has(item)) continue;
    seen.add(item);
    fields.push(item as WorkMapOverviewField);
  }
  return fields;
}

export function workMapLink(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed && isLinkedEvidenceUrl(trimmed) ? trimmed : "";
}

export function workMapColleagues(value: unknown): WorkMapColleague[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!name || !id) return [];
    return [{
      id,
      name,
      title: typeof row.title === "string" ? row.title.trim() : "",
      note: typeof row.note === "string" ? row.note.trim() : "",
      url: workMapLink(row.url),
    }];
  });
}

export function buildWorkMapSnapshot(input: {
  id: string;
  occupantId: string;
  profile: {
    fullName: string;
    headline: string;
    city: string;
    state: string;
    bio: string;
    linkedinUrl: string;
    githubUrl: string;
    portfolioUrl: string;
  };
  roles: WorkMapRole[];
  skills: string[];
  settings: WorkMapPublicationSettings;
  sourceFingerprint: string;
  createdAt: string;
  previewLocations?: boolean;
}): WorkMapSnapshot {
  const settings = input.settings;
  const restricted =
    settings.visibility === "stealth" ||
    settings.visibility === "anonymous";
  const anonymous = settings.visibility === "anonymous";
  const sections = new Set(settings.sections);
  const roles = sections.has("history")
    ? input.roles.map((role) => ({
        id: role.id,
        kind: role.kind,
        title: role.title,
        organization:
          restricted && role.isCurrent && settings.hideCurrentEmployer
            ? "Current employer"
            : anonymous
              ? "Verified organization"
              : role.organization,
        span: formatSpan(role.startDate, role.endDate, role.isCurrent),
        place: anonymous ? "" : publicRolePlace(role),
        description: anonymous ? "" : role.description,
        achievements: anonymous ? [] : role.achievements,
        locations: sections.has("map")
          ? role.locations
              .filter((location) => input.previewLocations || location.isPublic)
              .map((location) =>
                settings.showExactLocations
                  ? location
                  : {
                      ...location,
                      address: publicSitePlace(location.address, role.organization),
                      latitude: input.previewLocations
                        ? location.latitude
                        : roundCoordinate(location.latitude),
                      longitude: input.previewLocations
                        ? location.longitude
                        : roundCoordinate(location.longitude),
                    },
              )
          : [],
        media: sections.has("media")
          ? role.media.filter((item) => item.isPublic)
          : [],
        linkedEvidence:
          sections.has("evidence") && !anonymous
            ? publishedLinkedEvidence(role, sections.has("milestones"))
            : [],
        milestones: sections.has("milestones")
          ? role.details.milestones.filter((item) => item.isPublic)
          : [],
        events: sections.has("milestones")
          ? role.details.events.filter((item) => item.isPublic)
          : [],
        techStack: role.details.techStack,
        skills: role.details.skills,
        ...publishedRoleConditions(role.details),
      }))
    : [];
  return {
    id: input.id,
    occupantId: input.occupantId,
    slug: normalizeSlug(settings.slug),
    visibility: settings.visibility,
    targetRole: settings.targetRole,
    theme: settings.theme,
    profile: {
      displayName: restricted
        ? "Verified career professional"
        : input.profile.fullName,
      headline: input.profile.headline,
      city: settings.showExactLocations ? input.profile.city : "",
      state: input.profile.state,
      bio: anonymous ? "" : input.profile.bio,
      links: restricted
        ? { linkedin: "", github: "", portfolio: "" }
        : {
            linkedin: input.profile.linkedinUrl,
            github: input.profile.githubUrl,
            portfolio: input.profile.portfolioUrl,
          },
    },
    roles,
    skills: sections.has("skills") ? input.skills : [],
    sections: [...new Set(settings.sections)],
    expiresAt: settings.expiresAt,
    sourceFingerprint: input.sourceFingerprint,
    createdAt: input.createdAt,
  };
}

function publishedLinkedEvidence(
  role: WorkMapRole,
  eventsPublished: boolean,
): PublishedLinkedEvidence[] {
  const publicEvents = new Set(
    eventsPublished
      ? role.details.events.filter((event) => event.isPublic).map((event) => event.id)
      : [],
  );
  return role.linkedEvidence
    .filter((item) => item.isPublic)
    .map(({ evidenceId: _private, ...item }) =>
      item.pin?.kind === "event" && !publicEvents.has(item.pin.id)
        ? { ...item, pin: null }
        : item,
    );
}

function publishedRoleConditions(details: WorkMapRoleDetails) {
  const detailsNormalized = normalizeWorkMapDetails(details);
  const shared: {
    growth?: string;
    departure?: string;
    schedule?: WorkMapRoleDetails["schedule"];
    benefits?: string[];
    paidTimeOff?: string;
    environment?: string;
    workplaceRating?: number;
    equipment?: string[];
    uniform?: string;
    compensation?: {
      currency: string;
      period: "hourly" | "annual";
      amount: number | null;
    };
  } = {};
  if (detailsNormalized.share.growth && detailsNormalized.growth) {
    shared.growth = detailsNormalized.growth;
  }
  if (detailsNormalized.share.departure && detailsNormalized.departure) {
    shared.departure = detailsNormalized.departure;
  }
  if (detailsNormalized.share.schedule) {
    shared.schedule = detailsNormalized.schedule;
  }
  if (detailsNormalized.share.benefits && detailsNormalized.benefits.length) {
    shared.benefits = detailsNormalized.benefits;
  }
  if (detailsNormalized.share.paidTimeOff && detailsNormalized.paidTimeOff) {
    shared.paidTimeOff = detailsNormalized.paidTimeOff;
  }
  if (detailsNormalized.share.environment && detailsNormalized.environment) {
    shared.environment = detailsNormalized.environment;
  }
  if (
    detailsNormalized.share.workplaceRating &&
    detailsNormalized.workplaceRating != null
  ) {
    shared.workplaceRating = detailsNormalized.workplaceRating;
  }
  if (detailsNormalized.share.equipment && detailsNormalized.equipment.length) {
    shared.equipment = detailsNormalized.equipment;
  }
  if (detailsNormalized.share.uniform && detailsNormalized.uniform) {
    shared.uniform = detailsNormalized.uniform;
  }
  if (detailsNormalized.compensation.visibility === "public") {
    shared.compensation = {
      currency: detailsNormalized.compensation.currency,
      period: detailsNormalized.compensation.period,
      amount: detailsNormalized.compensation.amount,
    };
  }
  return shared;
}

export function attachFactsToWorkMapRole(
  role: WorkMapRole,
  facts: CareerFactVersion[],
): WorkMapRole {
  const canonical = canonicalFacts(facts);
  const roleFact = canonical.find(
    (fact) =>
      fact.subjectId === role.id &&
      fact.factType === (role.kind === "school" ? "education" : "role"),
  );
  const claims = orderClaims(
    role.achievements,
    canonical
      .filter(
        (fact) =>
          fact.factType === "achievement" && fact.subjectId === role.id,
      )
      .map(claimFromFact)
      .filter((claim) => claim.text),
  );
  return {
    ...role,
    factId: roleFact?.id ?? null,
    factVersion: roleFact?.version ?? null,
    evidenceIds: unique([
      ...(roleFact?.evidenceIds ?? []),
      ...claims.flatMap((claim) => claim.evidenceIds),
    ]),
    claims,
    achievements: role.achievements,
  };
}

export function planWorkMapRoleFactSync(input: {
  role: WorkMapRole;
  facts: CareerFactVersion[];
  evidenceId: string;
}): ChangeOperation[] {
  if (!input.evidenceId) return [];
  const canonical = canonicalFacts(input.facts);
  const factType = input.role.kind === "school" ? "education" : "role";
  const roleFact = canonical.find(
    (fact) => fact.subjectId === input.role.id && fact.factType === factType,
  );
  const operations: ChangeOperation[] = [];
  const roleValue = {
    title: input.role.title,
    company: input.role.organization,
    organization: input.role.organization,
    location: input.role.locationLabel,
    startDate: input.role.startDate,
    endDate: input.role.endDate,
    isCurrent: input.role.isCurrent,
    description: input.role.description,
  };
  if (!roleFact) {
    operations.push({
      action: "create",
      entityType: "career-fact",
      values: {
        factType,
        subjectId: input.role.id,
        value: roleValue,
        evidenceIds: [input.evidenceId],
      },
    });
  } else if (!sameRoleValue(roleFact.value, roleValue)) {
    operations.push({
      action: "supersede",
      entityType: "career-fact",
      entityId: roleFact.id,
      values: {
        factType,
        subjectId: input.role.id,
        value: roleValue,
        evidenceIds: unique([...roleFact.evidenceIds, input.evidenceId]),
      },
    });
  }

  const existingStatements = new Set(
    canonical
      .filter(
        (fact) =>
          fact.factType === "achievement" && fact.subjectId === input.role.id,
      )
      .map((fact) => factStatement(fact).toLowerCase()),
  );
  for (const raw of input.role.achievements) {
    const statement = raw.trim();
    if (!statement || existingStatements.has(statement.toLowerCase())) continue;
    operations.push({
      action: "create",
      entityType: "career-fact",
      values: {
        factType: "achievement",
        subjectId: input.role.id,
        value: { statement },
        evidenceIds: [input.evidenceId],
      },
    });
    existingStatements.add(statement.toLowerCase());
  }
  return operations;
}

type LinkedEvidenceBacking = {
  evidenceId: string | null;
  pin: LinkedEvidence["pin"];
};

export function planLinkedEvidenceFacts(input: {
  roleId: string;
  facts: CareerFactVersion[];
  before: LinkedEvidenceBacking | null;
  after: LinkedEvidenceBacking | null;
}): ChangeOperation[] {
  const achievements = canonicalFacts(input.facts).filter(
    (fact) => fact.factType === "achievement" && fact.subjectId === input.roleId,
  );
  const backedFact = (backing: LinkedEvidenceBacking | null) => {
    if (!backing?.evidenceId || backing.pin?.kind !== "achievement") return null;
    const wanted = backing.pin.statement.toLowerCase();
    return achievements.find((fact) => factStatement(fact).toLowerCase() === wanted) ?? null;
  };
  const next = new Map<string, string[]>();
  const from = backedFact(input.before);
  if (from && input.before?.evidenceId) {
    next.set(
      from.id,
      from.evidenceIds.filter((id) => id !== input.before?.evidenceId),
    );
  }
  const to = backedFact(input.after);
  if (to && input.after?.evidenceId) {
    next.set(to.id, unique([...(next.get(to.id) ?? to.evidenceIds), input.after.evidenceId]));
  }
  const operations: ChangeOperation[] = [];
  for (const [factId, evidenceIds] of next) {
    const fact = achievements.find((item) => item.id === factId);
    if (!fact || evidenceIds.length === 0) continue;
    if (stableStringify(evidenceIds) === stableStringify(fact.evidenceIds)) continue;
    operations.push({
      action: "supersede",
      entityType: "career-fact",
      entityId: fact.id,
      values: {
        factType: "achievement",
        subjectId: input.roleId,
        value: fact.value,
        evidenceIds,
      },
    });
  }
  return operations;
}

export function planWorkMapPublicationSettings(input: {
  current: WorkMapPublicationSettings;
  next: WorkMapPublicationSettings;
}): ChangeOperation[] {
  if (stableStringify(input.current) === stableStringify(input.next)) {
    return [];
  }
  return [
    {
      action: "transition",
      entityType: "work-map-publication-settings",
      values: { from: input.current, to: input.next },
    },
  ];
}

function claimFromFact(fact: CareerFactVersion): WorkMapClaim {
  return {
    text: factStatement(fact),
    factId: fact.id,
    factVersion: fact.version,
    evidenceIds: fact.evidenceIds,
  };
}

function factStatement(fact: CareerFactVersion): string {
  const value = fact.value;
  const statement = value.statement ?? value.title ?? value.name;
  return typeof statement === "string" ? statement.trim() : "";
}

function sameRoleValue(
  current: Record<string, unknown>,
  next: Record<string, unknown>,
): boolean {
  return (
    String(current.title ?? current.role ?? "") === String(next.title) &&
    String(current.company ?? current.organization ?? "") ===
      String(next.organization) &&
    String(current.location ?? "") === String(next.location) &&
    String(current.startDate ?? current.start_date ?? "") ===
      String(next.startDate) &&
    String(current.endDate ?? current.end_date ?? "") === String(next.endDate) &&
    Boolean(current.isCurrent ?? current.is_current) === Boolean(next.isCurrent) &&
    String(current.description ?? "") === String(next.description)
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function orderClaims(preferred: string[], claims: WorkMapClaim[]): WorkMapClaim[] {
  const remaining = new Map(
    claims.map((claim) => [claim.text.toLowerCase(), claim]),
  );
  const ordered: WorkMapClaim[] = [];
  for (const text of preferred) {
    const key = text.toLowerCase();
    const claim = remaining.get(key);
    if (!claim) continue;
    ordered.push(claim);
    remaining.delete(key);
  }
  ordered.push(...remaining.values());
  return ordered;
}

export function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type PreparedWorkMapLocation = Omit<WorkMapLocation, "id">;

export type WorkMapPlace = {
  label: string;
  address: string;
  latitude: number;
  longitude: number;
};

export function prepareWorkMapLocation(
  input: Record<string, unknown>,
):
  | { ok: true; value: PreparedWorkMapLocation }
  | { ok: false; error: "coordinates-required" } {
  const latitude = parseCoordinate(input.latitude);
  const longitude = parseCoordinate(input.longitude);
  if (latitude === null || longitude === null) {
    return { ok: false, error: "coordinates-required" };
  }
  return {
    ok: true,
    value: {
      label: text(input.label) || "Work site",
      address: text(input.address),
      latitude,
      longitude,
      kind: parseLocationKind(input.kind),
      isPublic: input.isPublic === true,
    },
  };
}

export function presentWorkMapPlace(hit: {
  name?: string | null;
  displayName: string;
  latitude: number;
  longitude: number;
}): WorkMapPlace {
  const address = hit.displayName.trim();
  const named = (hit.name ?? "").trim();
  return {
    label: named || address.split(",")[0]?.trim() || "Work site",
    address,
    latitude: hit.latitude,
    longitude: hit.longitude,
  };
}

export function nominatimAddressLine(
  address: Record<string, string | undefined> | undefined,
  displayName: string,
): string {
  const street = [address?.house_number, address?.road]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  const city = [
    address?.city,
    address?.town,
    address?.village,
    address?.hamlet,
    address?.municipality,
  ]
    .map((part) => part?.trim() ?? "")
    .find(Boolean);
  const iso = address?.["ISO3166-2-lvl4"] ?? "";
  const region = iso.includes("-") ? iso.slice(iso.lastIndexOf("-") + 1) : "";
  const state = /^[A-Z]{2}$/.test(region) ? region : "";
  if (!street || !city) return displayName.trim();
  return [street, city, state].filter(Boolean).join(", ");
}

function parseCoordinate(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseLocationKind(value: unknown): WorkMapLocation["kind"] {
  return value === "site" || value === "client" || value === "travel"
    ? value
    : "primary";
}

export function workSitePublicationNote(input: {
  isPublic: boolean;
  exactLocations: boolean;
}): string {
  if (!input.isPublic) return "Only on this preview";
  if (!input.exactLocations) return "Included. A publication uses a coarser pin.";
  return "Included";
}

export function previewRoleMark(
  locations: Array<{ isPublic: boolean }>,
): string {
  if (
    locations.length === 0 ||
    locations.every((location) => location.isPublic)
  ) {
    return "Included";
  }
  return "Only on this preview";
}

export function recruiterWorkMapSnapshot<
  T extends { roles: Array<{ locations: WorkMapLocation[] }> },
>(snapshot: T, exactLocations: boolean): T {
  return {
    ...snapshot,
    roles: snapshot.roles.map((role) => ({
      ...role,
      locations: role.locations
        .filter((location) => location.isPublic)
        .map((location) =>
          exactLocations
            ? location
            : {
                ...location,
                latitude: roundCoordinate(location.latitude),
                longitude: roundCoordinate(location.longitude),
              },
        ),
    })),
  };
}

function publicSitePlace(address: string, organization: string): string {
  return omitZipOnly(
    formatHistoryPlace({
      organization,
      locationLabel: "",
      locations: [{ address }],
    }),
  );
}

function publicRolePlace(role: WorkMapRole): string {
  const fromSite = role.locations
    .map((location) => publicSitePlace(location.address, role.organization))
    .find(Boolean);
  if (fromSite) return fromSite;
  return omitZipOnly(
    formatHistoryPlace({
      organization: role.organization,
      locationLabel: role.locationLabel,
      locations: [],
    }),
  );
}

function omitZipOnly(place: string): string {
  return /^[A-Z]{2}\s+\d{5}(?:-\d{4})?$/.test(place) ? "" : place;
}

function roundCoordinate(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatSpan(startDate: string, endDate: string, current: boolean) {
  return [startDate.slice(0, 7), current ? "Present" : endDate.slice(0, 7)]
    .filter(Boolean)
    .join(" — ");
}
