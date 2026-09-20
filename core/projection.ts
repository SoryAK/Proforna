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
