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

export type WorkMapMoment = {
  id: string;
  date: string;
  title: string;
  detail: string;
  isPublic: boolean;
};

export type WorkMapRoleDetails = {
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
  details: WorkMapRoleDetails;
};

export type WorkMapPublishSection =
  | "profile"
  | "history"
  | "map"
  | "milestones"
  | "media"
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

export function publicationNeedsAudienceConfirm(input: {
  visibility: WorkMapPublicationSettings["visibility"];
  liveStatus?: string | null;
}): boolean {
  return (
    !publicationAllowsSnapshot(input.visibility) ||
    input.liveStatus !== "published"
  );
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
    description: string;
    achievements: string[];
    locations: WorkMapLocation[];
    media: WorkMapMedia[];
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
  };
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
        description: anonymous ? "" : role.description,
        achievements: anonymous ? [] : role.achievements,
        locations: sections.has("map")
          ? role.locations
              .filter((location) => location.isPublic)
              .map((location) =>
                settings.showExactLocations
                  ? location
                  : {
                      ...location,
                      address: "",
                      latitude: roundCoordinate(location.latitude),
                      longitude: roundCoordinate(location.longitude),
                    },
              )
          : [],
        media: sections.has("media")
          ? role.media.filter((item) => item.isPublic)
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

function roundCoordinate(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatSpan(startDate: string, endDate: string, current: boolean) {
  return [startDate.slice(0, 7), current ? "Present" : endDate.slice(0, 7)]
    .filter(Boolean)
    .join(" — ");
}
