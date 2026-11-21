import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  authorizeChangeSet,
  buildInteractiveProjection,
  canViewProjection,
  createApproval,
  hashChangeSet,
  mayPublishProjection,
  planProjectionAccessDecision,
  planProjectionGrant,
  planProjectionGrantRevoke,
  planProjectionRemove,
  planProjectionRevoke,
  presentInboundAccessRequest,
  presentRelayStatus,
  resolveInboundAccessRequest,
  type ChangeSet,
  type InteractiveProjection,
  type RelayStatus,
  type WorkMapSnapshot,
} from "../core/index";
import { createContact, createOpportunity } from "./career-management";
import {
  mintOccupantApproval,
  persistApprovedChange,
  persistAuditEvent,
} from "./change-sets";
import {
  composeWorkMapSnapshot,
  createWorkMapSnapshot,
  readWorkMapSettings,
} from "./work-map";

type JsonObject = Record<string, unknown>;
export type RelayProjection = Omit<InteractiveProjection, "occupantId">;

export type ProjectionRelay = {
  publish(projection: RelayProjection): Promise<void>;
  revoke(slug: string): Promise<void>;
  grant?(
    slug: string,
    grant: { token: string; expiresAt: string },
  ): Promise<void>;
  /** Takes back one access link, named by the hash of its token. */
  revokeGrant?(slug: string, tokenHash: string): Promise<void>;
  /** Erases the page and everything the relay holds for it. */
  erase?(slug: string): Promise<void>;
};

export function listProjections(db: DatabaseSync, occupantId: string) {
  return db
    .prepare(
      `SELECT p.projection_json, p.status,
              (SELECT COUNT(*) FROM projection_events e
               WHERE e.projection_id = p.id) AS event_count,
              (SELECT COUNT(*) FROM projection_access_requests r
               WHERE r.projection_id = p.id) AS request_count
       FROM interactive_projections p
       WHERE p.occupant_id = ? ORDER BY p.created_at DESC`,
    )
    .all(occupantId)
    .map((row) => {
      const value = row as JsonObject;
      return {
        ...(JSON.parse(String(value.projection_json)) as InteractiveProjection),
        status: String(value.status),
        analytics: {
          events: Number(value.event_count),
          accessRequests: Number(value.request_count),
        },
      };
    });
}

export function readRelayStatus(db: DatabaseSync, occupantId: string): RelayStatus {
  const snapshot = composeWorkMapSnapshot(db, occupantId);
  const publication = db
    .prepare(
      `SELECT projection_id, published_at, expires_at FROM publications
       WHERE occupant_id = ? AND slug = ? AND revoked_at IS NULL
       ORDER BY published_at DESC LIMIT 1`,
    )
    .get(occupantId, snapshot.slug) as
    | { projection_id: string; published_at: string; expires_at: string | null }
    | undefined;
  const live = publication && !publicationExpired(publication.expires_at) ? publication : undefined;
  const commits = db
    .prepare(
      `SELECT operations_json FROM change_sets
       WHERE occupant_id = ? AND destination = ? AND status = 'committed'
       ORDER BY created_at DESC`,
    )
    .all(occupantId, `relay:${snapshot.slug}`) as Array<{ operations_json: string }>;
  let publishedFingerprint: string | null = null;
  for (const row of commits) {
    const operation = (JSON.parse(row.operations_json) as ChangeSet["operations"])[0];
    if (operation?.action !== "publish") continue;
    const value = operation.values?.sourceFingerprint;
    publishedFingerprint = typeof value === "string" ? value : null;
    break;
  }
  const published = publishedFingerprint
    ? (db
        .prepare(
          `SELECT snapshot_json FROM work_map_snapshots
           WHERE occupant_id = ? AND source_fingerprint = ?
           ORDER BY created_at DESC LIMIT 1`,
        )
        .get(occupantId, publishedFingerprint) as { snapshot_json: string } | undefined)
    : undefined;
  const status = presentRelayStatus({
    current: snapshot,
    live: live
      ? {
          publishedAt: live.published_at,
          snapshot: published
            ? (JSON.parse(published.snapshot_json) as WorkMapSnapshot)
            : null,
        }
      : null,
  });
  if (status.state === "private" && status.publishedAt && live) {
    return { ...status, projectionId: live.projection_id };
  }
  return status;
}

export function previewWorkMapProjection(db: DatabaseSync, occupantId: string) {
  const snapshot = composeWorkMapSnapshot(db, occupantId, {
    previewLocations: true,
  });
  const built = buildInteractiveProjection({ snapshot });
  if (!built.ok) return built;
  const { occupantId: _occupantId, ...publicSnapshot } = built.value;
  return {
    ok: true as const,
    snapshot: publicSnapshot,
    publishable: mayPublishProjection(built.value).ok,
    exactLocations: readWorkMapSettings(db, occupantId).showExactLocations,
  };
}

export function createProjection(
  db: DatabaseSync,
  occupantId: string,
  _input: JsonObject,
): InteractiveProjection {
  const snapshot = createWorkMapSnapshot(db, occupantId);
  const result = buildInteractiveProjection({
    snapshot,
  });
  if (!result.ok) throw new ProjectionStoreError(result.error);
  const existing = db
    .prepare(
      `SELECT id FROM interactive_projections
       WHERE occupant_id = ? AND slug = ?`,
    )
    .get(occupantId, result.value.slug) as { id: string } | undefined;
  const projection = {
    ...result.value,
    id: existing?.id ?? result.value.id,
  };
  if (existing) {
    db.prepare(
      `UPDATE interactive_projections
       SET snapshot_id = ?, visibility = ?, projection_json = ?, status = 'draft'
       WHERE id = ? AND occupant_id = ?`,
    ).run(
      snapshot.id,
      projection.visibility,
      JSON.stringify(projection),
      existing.id,
      occupantId,
    );
  } else {
    db.prepare(
      `INSERT INTO interactive_projections
        (id, occupant_id, revision_id, snapshot_id, slug, visibility,
         projection_json, status, created_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?, 'draft', ?)`,
    ).run(
      projection.id,
      occupantId,
      snapshot.id,
      projection.slug,
      projection.visibility,
      JSON.stringify(projection),
      projection.createdAt,
    );
  }
  return projection;
}

async function publishProjectionNow(
  db: DatabaseSync,
  occupantId: string,
  projectionId: string,
  relay?: ProjectionRelay,
) {
  const projection = readProjection(db, occupantId, projectionId);
  if (!projection) throw new ProjectionStoreError("projection-missing");
  const publishable = mayPublishProjection(projection);
  if (!publishable.ok) throw new ProjectionStoreError(publishable.error);
  const now = new Date().toISOString();
  const changeSet: ChangeSet = {
    id: randomUUID(),
    occupantId,
    purpose: "Publish approved interactive projection",
    destination: `relay:${projection.slug}`,
    operations: [
      {
        action: "publish",
        entityType: "interactive-projection",
        entityId: projection.id,
        values: {
          slug: projection.slug,
          visibility: projection.visibility,
          sourceFingerprint: projection.sourceFingerprint,
        },
      },
    ],
    createdAt: now,
  };
  const changeHash = await hashChangeSet(changeSet);
  db.prepare(
    `INSERT INTO change_sets
      (id, occupant_id, purpose, destination, operations_json, change_hash,
       status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?)`,
  ).run(
    changeSet.id,
    occupantId,
    changeSet.purpose,
    changeSet.destination,
    JSON.stringify(changeSet.operations),
    changeHash,
    now,
  );
  const approval = await createApproval(changeSet, {
    id: randomUUID(),
    approvedBy: occupantId,
    approvedAt: now,
  });
  const authorization = await authorizeChangeSet(changeSet, approval, now);
  if (!authorization.ok) throw new ProjectionStoreError(authorization.error);
  if (relay) await relay.publish(toRelayProjection(projection));

  const publicationId = randomUUID();
  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO approvals
        (id, change_set_id, change_hash, destination, approved_by, approved_at,
         expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      approval.id,
      approval.changeSetId,
      approval.changeHash,
      approval.destination,
      approval.approvedBy,
      approval.approvedAt,
      approval.expiresAt,
    );
    db.prepare(
      `INSERT INTO publications
        (id, occupant_id, projection_id, slug, audience, published_at,
         expires_at, revoked_at, relayed)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    ).run(
      publicationId,
      occupantId,
      projection.id,
      projection.slug,
      projection.visibility,
      now,
      projection.expiresAt,
      relay ? 1 : 0,
    );
    db.prepare(
      "UPDATE interactive_projections SET status = 'published' WHERE id = ?",
    ).run(projection.id);
    db.prepare(
      "UPDATE change_sets SET status = 'committed' WHERE id = ?",
    ).run(changeSet.id);
    db.prepare(
      `INSERT INTO audit_events
        (id, occupant_id, event_type, entity_type, entity_id, change_set_id,
         approval_id, detail_json, occurred_at)
       VALUES (?, ?, 'projection-published', 'interactive-projection', ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      occupantId,
      projection.id,
      changeSet.id,
      approval.id,
      JSON.stringify({ slug: projection.slug }),
      now,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { id: publicationId, slug: projection.slug, publishedAt: now };
}

async function revokeProjectionNow(
  db: DatabaseSync,
  occupantId: string,
  projectionId: string,
  relay?: ProjectionRelay,
) {
  const projection = readProjection(db, occupantId, projectionId);
  if (!projection) throw new ProjectionStoreError("projection-missing");
  const now = new Date().toISOString();
  const minted = await mintOccupantApproval(occupantId, {
    purpose: "Revoke interactive projection",
    destination: `relay:${projection.slug}`,
    operations: [
      planProjectionRevoke({
        projectionId,
        slug: projection.slug,
      }),
    ],
    now,
  });
  if (relay) await relay.revoke(projection.slug);
  db.exec("BEGIN");
  try {
    persistApprovedChange(db, minted.changeSet, minted.hash, minted.approval);
    db.prepare(
      `UPDATE publications SET revoked_at = ?
       WHERE projection_id = ? AND occupant_id = ? AND revoked_at IS NULL`,
    ).run(now, projectionId, occupantId);
    db.prepare(
      "UPDATE interactive_projections SET status = 'revoked' WHERE id = ?",
    ).run(projectionId);
    persistAuditEvent(db, {
      id: randomUUID(),
      occupantId,
      eventType: "projection-revoked",
      entityType: "interactive-projection",
      entityId: projectionId,
      changeSetId: minted.changeSet.id,
      approvalId: minted.approval.id,
      detail: { slug: projection.slug },
      occurredAt: now,
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

async function createProjectionGrantNow(
  db: DatabaseSync,
  occupantId: string,
  projectionId: string,
  expiresAt: string,
  relay?: ProjectionRelay,
  requestId: string | null = null,
) {
  const projection = readProjection(db, occupantId, projectionId);
  if (!projection) throw new ProjectionStoreError("projection-missing");
  const token = randomBytes(24).toString("base64url");
  const now = new Date().toISOString();
  const hashedToken = tokenHash(token);
  const minted = await mintOccupantApproval(occupantId, {
    purpose: "Grant projection access",
    destination: `relay:${projection.slug}`,
    operations: [
      planProjectionGrant({
        projectionId,
        slug: projection.slug,
        expiresAt,
        tokenHash: hashedToken,
      }),
    ],
    now,
  });
  db.exec("BEGIN");
  try {
    persistApprovedChange(db, minted.changeSet, minted.hash, minted.approval);
    db.prepare(
      `INSERT INTO projection_access_grants
        (id, projection_id, token_hash, expires_at, revoked_at, created_at, request_id, relayed)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
    ).run(randomUUID(), projectionId, hashedToken, expiresAt, now, requestId, relay?.grant ? 1 : 0);
    persistAuditEvent(db, {
      id: randomUUID(),
      occupantId,
      eventType: "projection-grant-created",
      entityType: "projection-access-grant",
      entityId: projectionId,
      changeSetId: minted.changeSet.id,
      approvalId: minted.approval.id,
      detail: { slug: projection.slug, expiresAt },
      occurredAt: now,
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  if (relay?.grant) {
    await relay.grant(projection.slug, { token, expiresAt });
  }
  return { token, expiresAt };
}

export type ProjectionGrantSummary = {
  id: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  /** Who asked, when the link answered an access request. */
  requester: { name: string; email: string } | null;
};

/** The access links handed out for a page. Tokens are never stored, so none are returned. */
export function listProjectionGrants(
  db: DatabaseSync,
  occupantId: string,
  projectionId: string,
): ProjectionGrantSummary[] {
  if (!readProjection(db, occupantId, projectionId)) {
    throw new ProjectionStoreError("projection-missing");
  }
  const rows = db
    .prepare(
      `SELECT g.id, g.expires_at, g.revoked_at, g.created_at,
              r.requester_name, r.requester_email
         FROM projection_access_grants g
         LEFT JOIN projection_access_requests r ON r.id = g.request_id
        WHERE g.projection_id = ?
        ORDER BY g.created_at DESC`,
    )
    .all(projectionId) as Array<{
    id: string;
    expires_at: string;
    revoked_at: string | null;
    created_at: string;
    requester_name: string | null;
    requester_email: string | null;
  }>;
  return rows.map((row) => ({
    id: row.id,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    requester:
      row.requester_name != null
        ? { name: row.requester_name, email: row.requester_email ?? "" }
        : null,
  }));
}

/** Takes back one access link; everyone else keeps theirs. */
async function revokeProjectionGrantNow(
  db: DatabaseSync,
  occupantId: string,
  projectionId: string,
  grantId: string,
  relay?: ProjectionRelay,
) {
  const projection = readProjection(db, occupantId, projectionId);
  if (!projection) throw new ProjectionStoreError("projection-missing");
  const grant = db
    .prepare(
      `SELECT token_hash, revoked_at, relayed FROM projection_access_grants
        WHERE id = ? AND projection_id = ?`,
    )
    .get(grantId, projectionId) as
    | { token_hash: string; revoked_at: string | null; relayed: number | null }
    | undefined;
  if (!grant) throw new ProjectionStoreError("grant-missing");
  if (grant.revoked_at) return;
  // A link that lives on the Relay is only revoked there; without a Relay to
  // reach, nothing changes here either, rather than showing it revoked.
  if (grant.relayed === 1 && !relay?.revokeGrant) throw new ProjectionStoreError("relay-not-configured");
  const now = new Date().toISOString();
  const minted = await mintOccupantApproval(occupantId, {
    purpose: "Revoke projection access link",
    destination: `relay:${projection.slug}`,
    operations: [
      planProjectionGrantRevoke({
        projectionId,
        grantId,
        slug: projection.slug,
        tokenHash: grant.token_hash,
      }),
    ],
    now,
  });
  if (relay?.revokeGrant) await relay.revokeGrant(projection.slug, grant.token_hash);
  db.exec("BEGIN");
  try {
    persistApprovedChange(db, minted.changeSet, minted.hash, minted.approval);
    db.prepare("UPDATE projection_access_grants SET revoked_at = ? WHERE id = ?").run(
      now,
      grantId,
    );
    persistAuditEvent(db, {
      id: randomUUID(),
      occupantId,
      eventType: "projection-grant-revoked",
      entityType: "projection-access-grant",
      entityId: grantId,
      changeSetId: minted.changeSet.id,
      approvalId: minted.approval.id,
      detail: { slug: projection.slug },
      occurredAt: now,
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Takes a page offline and erases it: its snapshot, publications, access
 * requests, links and views, here and on the relay. The approval and audit
 * trail stay, as the record that it existed and was removed. Opportunities that
 * came from its access requests stay in Opportunities.
 */
async function removeProjectionNow(
  db: DatabaseSync,
  occupantId: string,
  projectionId: string,
  relay?: ProjectionRelay,
) {
  const projection = readProjection(db, occupantId, projectionId);
  if (!projection) throw new ProjectionStoreError("projection-missing");
  // A page with a copy on the Relay is erased there first. Without a Relay to
  // reach, nothing is deleted here, so the page never looks gone while it's live.
  if (!relay?.erase && hasRelayCopy(db, projectionId)) throw new ProjectionStoreError("relay-not-configured");
  const now = new Date().toISOString();
  const minted = await mintOccupantApproval(occupantId, {
    purpose: "Remove interactive projection",
    destination: `relay:${projection.slug}`,
    operations: [planProjectionRemove({ projectionId, slug: projection.slug })],
    now,
  });
  // Erase the public copy first: if the relay cannot be reached, nothing here
  // is deleted and the owner can try again.
  if (relay?.erase) await relay.erase(projection.slug);
  db.exec("BEGIN");
  try {
    persistApprovedChange(db, minted.changeSet, minted.hash, minted.approval);
    for (const table of [
      "projection_events",
      "projection_access_grants",
      "projection_access_requests",
      "publications",
    ]) {
      db.prepare(`DELETE FROM ${table} WHERE projection_id = ?`).run(projectionId);
    }
    db.prepare("DELETE FROM interactive_projections WHERE id = ? AND occupant_id = ?").run(
      projectionId,
      occupantId,
    );
    persistAuditEvent(db, {
      id: randomUUID(),
      occupantId,
      eventType: "projection-removed",
      entityType: "interactive-projection",
      entityId: projectionId,
      changeSetId: minted.changeSet.id,
      approvalId: minted.approval.id,
      detail: { slug: projection.slug },
      occurredAt: now,
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export async function resolveOpportunityAccess(
  db: DatabaseSync,
  occupantId: string,
  opportunityId: string,
  decision: string,
  expiresAt: string,
  relay?: ProjectionRelay,
) {
  const resolved = resolveInboundAccessRequest({ decision });
  if (!resolved.ok) throw new ProjectionStoreError(resolved.error);
  const request = db
    .prepare(
      `SELECT r.id AS id,
              r.projection_id AS projectionId,
              p.slug AS slug
         FROM projection_access_requests r
         JOIN interactive_projections p ON p.id = r.projection_id
        WHERE r.opportunity_id = ? AND p.occupant_id = ? AND r.status = 'new'`,
    )
    .get(opportunityId, occupantId) as
    | { id: string; projectionId: string; slug: string }
    | undefined;
  if (!request) throw new ProjectionStoreError("request-missing");
  if (resolved.value.requestStatus === "granted") {
    const grant = await createProjectionGrant(
      db,
      occupantId,
      request.projectionId,
      expiresAt,
      relay,
      request.id,
    );
    closeInboundAccess(
      db,
      request.id,
      opportunityId,
      resolved.value.requestStatus,
      resolved.value.opportunityStatus,
    );
    return { decision: "grant" as const, grant };
  }
  const now = new Date().toISOString();
  const minted = await mintOccupantApproval(occupantId, {
    purpose: "Decline projection access",
    destination: `relay:${request.slug}`,
    operations: [
      planProjectionAccessDecision({
        requestId: request.id,
        projectionId: request.projectionId,
        slug: request.slug,
        decision: resolved.value.requestStatus,
      }),
    ],
    now,
  });
  db.exec("BEGIN");
  try {
    persistApprovedChange(db, minted.changeSet, minted.hash, minted.approval);
    closeInboundAccess(
      db,
      request.id,
      opportunityId,
      resolved.value.requestStatus,
      resolved.value.opportunityStatus,
    );
    persistAuditEvent(db, {
      id: randomUUID(),
      occupantId,
      eventType: "projection-access-declined",
      entityType: "projection-access-request",
      entityId: request.id,
      changeSetId: minted.changeSet.id,
      approvalId: minted.approval.id,
      detail: { slug: request.slug },
      occurredAt: now,
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { decision: "decline" as const };
}

function closeInboundAccess(
  db: DatabaseSync,
  requestId: string,
  opportunityId: string,
  requestStatus: "granted" | "declined",
  opportunityStatus: "closed",
) {
  db.prepare(
    "UPDATE projection_access_requests SET status = ? WHERE id = ?",
  ).run(requestStatus, requestId);
  db.prepare("UPDATE opportunities SET status = ? WHERE id = ?").run(
    opportunityStatus,
    opportunityId,
  );
}

export function resolvePublishedProjection(
  db: DatabaseSync,
  slug: string,
  token: string | null,
): InteractiveProjection | null {
  const row = db
    .prepare(
      `SELECT p.projection_json
       FROM interactive_projections p
       JOIN publications pub ON pub.projection_id = p.id
       WHERE p.slug = ? AND p.status = 'published' AND pub.revoked_at IS NULL
       ORDER BY pub.published_at DESC LIMIT 1`,
    )
    .get(slug) as JsonObject | undefined;
  if (!row) return null;
  const projection = JSON.parse(
    String(row.projection_json),
  ) as InteractiveProjection;
  const hasAccessGrant =
    Boolean(token) &&
    Boolean(
      db
        .prepare(
          `SELECT g.id FROM projection_access_grants g
           WHERE g.projection_id = ? AND g.token_hash = ?
             AND g.revoked_at IS NULL AND g.expires_at > ?`,
        )
        .get(
          projection.id,
          tokenHash(token ?? ""),
          new Date().toISOString(),
        ),
    );
  return canViewProjection(projection, {
    now: new Date().toISOString(),
    hasAccessGrant,
  })
    ? projection
    : null;
}

export function captureAccessRequest(
  db: DatabaseSync,
  slug: string,
  input: JsonObject,
) {
  const projection = db
    .prepare(
      "SELECT id, occupant_id AS occupantId FROM interactive_projections WHERE slug = ?",
    )
    .get(slug) as { id: string; occupantId: string } | undefined;
  if (!projection) throw new ProjectionStoreError("projection-missing");
  const name = text(input.name);
  const email = text(input.email);
  if (!name || !email.includes("@")) {
    throw new ProjectionStoreError("contact-invalid");
  }
  const inbound = presentInboundAccessRequest({
    requesterName: name,
    requesterEmail: email,
    message: text(input.message),
    publicationSlug: slug,
  });
  const request = {
    id: randomUUID(),
    projectionId: projection.id,
    name,
    email,
    message: text(input.message),
    createdAt: new Date().toISOString(),
  };
  db.exec("BEGIN");
  try {
    const contact = createContact(db, projection.occupantId, inbound.contact);
    const opportunity = createOpportunity(
      db,
      projection.occupantId,
      { ...inbound.opportunity, contactId: contact.id },
    );
    db.prepare(
      `INSERT INTO projection_access_requests
        (id, projection_id, requester_name, requester_email, message, status,
         opportunity_id, created_at)
       VALUES (?, ?, ?, ?, ?, 'new', ?, ?)`,
    ).run(
      request.id,
      request.projectionId,
      request.name,
      request.email,
      request.message,
      opportunity.id,
      request.createdAt,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return request;
}

export function recordProjectionEvent(
  db: DatabaseSync,
  projectionId: string,
  eventType: string,
  section?: string,
) {
  if (!["view", "section", "contact"].includes(eventType)) {
    throw new ProjectionStoreError("event-invalid");
  }
  db.prepare(
    `INSERT INTO projection_events
      (id, projection_id, event_type, section, occurred_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    projectionId,
    eventType,
    section ?? null,
    new Date().toISOString(),
  );
}

function publicationExpired(expiresAt: string | null, now = new Date().toISOString()): boolean {
  return Boolean(expiresAt && expiresAt <= now);
}

function readProjection(
  db: DatabaseSync,
  occupantId: string,
  projectionId: string,
): InteractiveProjection | null {
  const row = db
    .prepare(
      `SELECT projection_json FROM interactive_projections
       WHERE id = ? AND occupant_id = ?`,
    )
    .get(projectionId, occupantId) as JsonObject | undefined;
  return row
    ? (JSON.parse(String(row.projection_json)) as InteractiveProjection)
    : null;
}

function toRelayProjection(
  projection: InteractiveProjection,
): RelayProjection {
  const { occupantId: _occupantId, ...relayProjection } = projection;
  return relayProjection;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export class ProjectionStoreError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function hasRelayCopy(db: DatabaseSync, projectionId: string): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM publications WHERE projection_id = ? AND relayed = 1 LIMIT 1").get(projectionId) ??
      db.prepare("SELECT 1 FROM projection_access_grants WHERE projection_id = ? AND relayed = 1 LIMIT 1").get(projectionId),
  );
}

/**
 * Changes to one page run one at a time: publish, take offline, remove, and
 * hand out or revoke a link. Each waits for the Relay before the next starts,
 * so a late publish can't bring back a removed page and a late link can't
 * outlive its revocation.
 */
const pageQueues = new Map<string, Promise<unknown>>();

function oneAtATime<T>(projectionId: string, run: () => Promise<T>): Promise<T> {
  const previous = pageQueues.get(projectionId) ?? Promise.resolve();
  const next = previous.then(run, run);
  const settled = next.then(
    () => undefined,
    () => undefined,
  );
  pageQueues.set(projectionId, settled);
  void settled.then(() => {
    if (pageQueues.get(projectionId) === settled) pageQueues.delete(projectionId);
  });
  return next;
}

export const publishProjection = (...args: Parameters<typeof publishProjectionNow>) =>
  oneAtATime(args[2], () => publishProjectionNow(...args));
export const revokeProjection = (...args: Parameters<typeof revokeProjectionNow>) =>
  oneAtATime(args[2], () => revokeProjectionNow(...args));
export const createProjectionGrant = (...args: Parameters<typeof createProjectionGrantNow>) =>
  oneAtATime(args[2], () => createProjectionGrantNow(...args));
export const revokeProjectionGrant = (...args: Parameters<typeof revokeProjectionGrantNow>) =>
  oneAtATime(args[2], () => revokeProjectionGrantNow(...args));
export const removeProjection = (...args: Parameters<typeof removeProjectionNow>) =>
  oneAtATime(args[2], () => removeProjectionNow(...args));
