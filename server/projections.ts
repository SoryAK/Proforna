import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  authorizeChangeSet,
  buildInteractiveProjection,
  canViewProjection,
  createApproval,
  hashChangeSet,
  mayPublishProjection,
  type ChangeSet,
  type InteractiveProjection,
} from "../core/index";
import { createWorkMapSnapshot } from "./work-map";

type JsonObject = Record<string, unknown>;
export type RelayProjection = Omit<InteractiveProjection, "occupantId">;

export type ProjectionRelay = {
  publish(projection: RelayProjection): Promise<void>;
  revoke(slug: string): Promise<void>;
  grant?(
    slug: string,
    grant: { token: string; expiresAt: string },
  ): Promise<void>;
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

export async function publishProjection(
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
         expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    ).run(
      publicationId,
      occupantId,
      projection.id,
      projection.slug,
      projection.visibility,
      now,
      projection.expiresAt,
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

export async function revokeProjection(
  db: DatabaseSync,
  occupantId: string,
  projectionId: string,
  relay?: ProjectionRelay,
) {
  const projection = readProjection(db, occupantId, projectionId);
  if (!projection) throw new ProjectionStoreError("projection-missing");
  if (relay) await relay.revoke(projection.slug);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE publications SET revoked_at = ?
     WHERE projection_id = ? AND occupant_id = ? AND revoked_at IS NULL`,
  ).run(now, projectionId, occupantId);
  db.prepare(
    "UPDATE interactive_projections SET status = 'revoked' WHERE id = ?",
  ).run(projectionId);
  db.prepare(
    `INSERT INTO audit_events
      (id, occupant_id, event_type, entity_type, entity_id, change_set_id,
       approval_id, detail_json, occurred_at)
     VALUES (?, ?, 'projection-revoked', 'interactive-projection', ?, NULL,
             NULL, ?, ?)`,
  ).run(
    randomUUID(),
    occupantId,
    projectionId,
    JSON.stringify({ slug: projection.slug }),
    now,
  );
}

export async function createProjectionGrant(
  db: DatabaseSync,
  occupantId: string,
  projectionId: string,
  expiresAt: string,
  relay?: ProjectionRelay,
) {
  const projection = readProjection(db, occupantId, projectionId);
  if (!projection) throw new ProjectionStoreError("projection-missing");
  const token = randomBytes(24).toString("base64url");
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projection_access_grants
      (id, projection_id, token_hash, expires_at, revoked_at, created_at)
     VALUES (?, ?, ?, ?, NULL, ?)`,
  ).run(
    randomUUID(),
    projectionId,
    tokenHash(token),
    expiresAt,
    now,
  );
  if (relay?.grant) {
    await relay.grant(projection.slug, { token, expiresAt });
  }
  return { token, expiresAt };
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
    .prepare("SELECT id FROM interactive_projections WHERE slug = ?")
    .get(slug) as { id: string } | undefined;
  if (!projection) throw new ProjectionStoreError("projection-missing");
  const name = text(input.name);
  const email = text(input.email);
  if (!name || !email.includes("@")) {
    throw new ProjectionStoreError("contact-invalid");
  }
  const request = {
    id: randomUUID(),
    projectionId: projection.id,
    name,
    email,
    message: text(input.message),
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO projection_access_requests
      (id, projection_id, requester_name, requester_email, message, status,
       created_at)
     VALUES (?, ?, ?, ?, ?, 'new', ?)`,
  ).run(
    request.id,
    request.projectionId,
    request.name,
    request.email,
    request.message,
    request.createdAt,
  );
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
