import type { ChangeOperation } from "./governance";
import type {
  WorkMapPublishSection,
  WorkMapSnapshot,
} from "./work-map";

export type ProjectionVisibility =
  | "public"
  | "unlisted"
  | "access-controlled"
  | "stealth"
  | "anonymous"
  | "private";

export type ProjectionDisclosure = {
  visibility: ProjectionVisibility;
  sections: WorkMapPublishSection[];
  expiresAt: string | null;
};

export type InteractiveProjection = WorkMapSnapshot;

export type ProjectionError =
  | "slug-required"
  | "sections-required"
  | "private-not-publishable";

export function buildInteractiveProjection(input: {
  snapshot: WorkMapSnapshot;
}):
  | { ok: true; value: InteractiveProjection }
  | { ok: false; error: ProjectionError } {
  if (!input.snapshot.slug) return { ok: false, error: "slug-required" };
  if (input.snapshot.sections.length === 0) {
    return { ok: false, error: "sections-required" };
  }
  return { ok: true, value: input.snapshot };
}

export function mayPublishProjection(
  projection: InteractiveProjection,
):
  | { ok: true }
  | { ok: false; error: ProjectionError } {
  return projection.visibility === "private"
    ? { ok: false, error: "private-not-publishable" }
    : { ok: true };
}

export type RelayStatus =
  | { state: "private"; publishedAt?: string; projectionId?: string }
  | { state: "unpublished" }
  | { state: "current"; publishedAt: string }
  | { state: "changed"; publishedAt: string; changes: string[] };

export function presentRelayStatus(input: {
  current: WorkMapSnapshot;
  live: { publishedAt: string; snapshot: WorkMapSnapshot | null } | null;
}): RelayStatus {
  if (input.current.visibility === "private") {
    return input.live ? { state: "private", publishedAt: input.live.publishedAt } : { state: "private" };
  }
  if (!input.live) return { state: "unpublished" };
  const published = input.live.snapshot;
  if (published?.sourceFingerprint === input.current.sourceFingerprint) {
    return { state: "current", publishedAt: input.live.publishedAt };
  }
  return {
    state: "changed",
    publishedAt: input.live.publishedAt,
    changes: published ? describeRelayChanges(published, input.current) : [],
  };
}

export function describeRelayChanges(
  published: WorkMapSnapshot,
  current: WorkMapSnapshot,
): string[] {
  const lines: string[] = [];
  if (
    !sameValue(published.profile, current.profile) ||
    published.targetRole !== current.targetRole
  ) {
    lines.push("Profile updated");
  }
  const before = new Map(published.roles.map((role) => [role.id, role]));
  const after = new Map(current.roles.map((role) => [role.id, role]));
  const added = current.roles.filter((role) => !before.has(role.id));
  const removed = published.roles.filter((role) => !after.has(role.id));
  const edited = current.roles.filter((role) => {
    const earlier = before.get(role.id);
    return earlier != null && !sameValue(earlier, role);
  });
  lines.push(...roleLines("Added", added));
  lines.push(...roleLines("Edited", edited));
  lines.push(...roleLines("Removed", removed));
  const skillsAdded = current.skills.filter((skill) => !published.skills.includes(skill)).length;
  const skillsRemoved = published.skills.filter((skill) => !current.skills.includes(skill)).length;
  if (skillsAdded > 0) lines.push(`Added ${count(skillsAdded, "skill")}`);
  if (skillsRemoved > 0) lines.push(`Removed ${count(skillsRemoved, "skill")}`);
  if (
    published.visibility !== current.visibility ||
    published.theme !== current.theme ||
    published.expiresAt !== current.expiresAt ||
    !sameValue(published.sections, current.sections)
  ) {
    lines.push("Publication settings changed");
  }
  return lines;
}

function roleLines(
  verb: string,
  roles: Array<{ organization: string; title: string }>,
): string[] {
  if (roles.length === 0) return [];
  if (roles.length > 2) return [`${verb} ${count(roles.length, "role")}`];
  return roles.map((role) => `${verb} ${role.organization || role.title || "a role"}`);
}

function count(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function canViewProjection(
  projection: InteractiveProjection,
  input: { now: string; hasAccessGrant: boolean },
): boolean {
  if (projection.expiresAt && projection.expiresAt <= input.now) return false;
  if (projection.visibility === "private") return false;
  if (projection.visibility === "access-controlled") {
    return input.hasAccessGrant;
  }
  return true;
}

export function planProjectionRevoke(input: {
  projectionId: string;
  slug: string;
}): ChangeOperation {
  return {
    action: "revoke",
    entityType: "interactive-projection",
    entityId: input.projectionId,
    values: { slug: input.slug },
  };
}

export function planProjectionGrant(input: {
  projectionId: string;
  slug: string;
  expiresAt: string;
  tokenHash: string;
}): ChangeOperation {
  return {
    action: "create",
    entityType: "projection-access-grant",
    entityId: input.projectionId,
    values: {
      slug: input.slug,
      expiresAt: input.expiresAt,
      tokenHash: input.tokenHash,
    },
  };
}

export function planProjectionAccessDecision(input: {
  requestId: string;
  projectionId: string;
  slug: string;
  decision: "granted" | "declined";
}): ChangeOperation {
  return {
    action: "transition",
    entityType: "projection-access-request",
    entityId: input.requestId,
    values: { slug: input.slug, projectionId: input.projectionId, decision: input.decision },
  };
}
