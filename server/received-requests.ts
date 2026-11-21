import type { DatabaseSync } from "node:sqlite";
import {
  accessExpiry,
  prepareAccessChange,
  prepareRequestAnswer,
  receivedReplyDraft,
  receivedStatus,
  type AccessActivity,
  type ReceivedRequestStatus,
  type WorkMapPublishSection,
} from "../core/index";
import { readActivity, recordActivity } from "./access";
import { contactPhotos } from "./contact-photos";
import { readProfile } from "./occupant";
import { captureAccessRequest, resolveOpportunityAccess, type ProjectionRelay } from "./projections";
import { RequestStoreError, type RequestRelay } from "./requests";

/** A request someone sent the occupant. Today: access requests from the public page. */
export type ReceivedRequest = {
  id: string;
  kind: "access";
  requesterName: string;
  requesterEmail: string;
  message: string;
  status: ReceivedRequestStatus;
  note: string;
  pageSlug: string;
  /** What the page publishes, offered when approving. */
  pageSections: WorkMapPublishSection[];
  createdAt: string;
  answeredAt: string | null;
  /** The access record approving created; it's managed in Access from then on. */
  grantId: string | null;
  /** Newest first: the ask, the answer, and what followed. */
  activity: AccessActivity[];
  /** Their photo, when they're in My Network with one. */
  photoUrl?: string | null;
};

type Row = {
  id: string;
  requester_name: string;
  requester_email: string;
  message: string;
  status: string;
  owner_note: string;
  opportunity_id: string | null;
  created_at: string;
  answered_at: string | null;
  slug: string;
  projection_json: string;
  grant_id: string | null;
};

const SELECT = `SELECT r.id, r.requester_name, r.requester_email, r.message, r.status, r.owner_note,
                       r.opportunity_id, r.created_at, r.answered_at, p.slug, p.projection_json,
                       (SELECT g.id FROM projection_access_grants g WHERE g.request_id = r.id
                         ORDER BY g.created_at DESC LIMIT 1) AS grant_id
                  FROM projection_access_requests r
                  JOIN interactive_projections p ON p.id = r.projection_id`;

function present(db: DatabaseSync, occupantId: string, row: Row): ReceivedRequest {
  const activity = readActivity(db, occupantId, { grantId: row.grant_id, requestId: row.id });
  // Requests from before Activity existed still show the ask.
  if (!activity.some((entry) => entry.kind === "asked")) {
    activity.push({
      id: `asked-${row.id}`,
      kind: "asked",
      sections: null,
      expiresAt: null,
      message: row.message,
      occurredAt: row.created_at,
    });
  }
  return {
    id: row.id,
    kind: "access",
    requesterName: row.requester_name,
    requesterEmail: row.requester_email,
    message: row.message,
    status: receivedStatus(row.status),
    note: row.owner_note,
    pageSlug: row.slug,
    pageSections: (JSON.parse(row.projection_json) as { sections: WorkMapPublishSection[] }).sections,
    createdAt: row.created_at,
    answeredAt: row.answered_at,
    grantId: row.grant_id,
    activity,
  };
}

/**
 * Brings in access requests visitors left on the Relay since the last one taken,
 * each only once. Returns whether the Relay could be reached.
 */
export async function pullReceived(
  db: DatabaseSync,
  occupantId: string,
  relay: RequestRelay | undefined,
): Promise<boolean> {
  if (!relay) return true;
  const last = db
    .prepare(
      `${SELECT} WHERE p.occupant_id = ? AND r.relay_request_id IS NOT NULL ORDER BY r.created_at DESC LIMIT 1`,
    )
    .get(occupantId) as Row | undefined;
  let incoming;
  try {
    incoming = await relay.inbound(last?.created_at ?? "");
  } catch {
    return false;
  }
  const seen = db.prepare("SELECT 1 FROM projection_access_requests WHERE relay_request_id = ?");
  for (const request of incoming) {
    if (seen.get(request.id)) continue;
    try {
      const captured = captureAccessRequest(
        db,
        request.slug,
        { name: request.name, email: request.email, message: request.message },
        { id: request.id, createdAt: request.createdAt },
      );
      recordActivity(db, occupantId, {
        requestId: captured.id,
        kind: "asked",
        message: request.message,
        occurredAt: request.createdAt,
      });
    } catch {
      // A page removed here, or a malformed request: skip it rather than stop the rest.
    }
  }
  return true;
}

export function listReceived(db: DatabaseSync, occupantId: string): ReceivedRequest[] {
  const photos = contactPhotos(db, occupantId);
  return (
    db.prepare(`${SELECT} WHERE p.occupant_id = ? AND r.cleared_at IS NULL ORDER BY r.created_at DESC`).all(occupantId) as Row[]
  ).map(
    (row) => ({ ...present(db, occupantId, row), photoUrl: photos.find(null, row.requester_email) }),
  );
}

function readRow(db: DatabaseSync, occupantId: string, id: string): Row {
  const row = db.prepare(`${SELECT} WHERE p.occupant_id = ? AND r.id = ?`).get(occupantId, id) as Row | undefined;
  if (!row) throw new RequestStoreError("not-found");
  return row;
}

/**
 * Answers a received request with a note. Approving grants a private access
 * link to the page, which is returned once so the occupant can share it.
 */
export async function answerReceived(
  db: DatabaseSync,
  occupantId: string,
  id: string,
  input: unknown,
  projectionRelay: ProjectionRelay | undefined,
  origin: string | null,
): Promise<{ request: ReceivedRequest; accessLink: string | null }> {
  const row = readRow(db, occupantId, id);
  if (receivedStatus(row.status) !== "waiting" || !row.opportunity_id) throw new RequestStoreError("request-closed");
  const prepared = prepareRequestAnswer(input);
  if (!prepared.ok) throw new RequestStoreError(prepared.error);
  // Approving also chooses what they see and for how long.
  const access = prepareAccessChange(input, (JSON.parse(row.projection_json) as { sections: WorkMapPublishSection[] }).sections);
  if (!access.ok) throw new RequestStoreError(access.error);
  const expiresAt = accessExpiry(access.value.days, new Date());
  const approving = prepared.value.decision === "approved";
  const result = await resolveOpportunityAccess(
    db,
    occupantId,
    row.opportunity_id,
    approving ? "grant" : "decline",
    expiresAt,
    projectionRelay,
    access.value.sections,
  );
  const now = new Date().toISOString();
  db.prepare("UPDATE projection_access_requests SET owner_note = ?, answered_at = ? WHERE id = ?").run(
    prepared.value.note,
    now,
    id,
  );
  const grantId = "grant" in result && result.grant ? result.grant.id : null;
  recordActivity(db, occupantId, {
    requestId: id,
    grantId,
    kind: approving ? "approved" : "declined",
    sections: approving ? access.value.sections : null,
    expiresAt: approving ? expiresAt : null,
    message: prepared.value.note,
    occurredAt: now,
  });
  const token = "grant" in result && result.grant ? result.grant.token : null;
  const accessLink =
    token && origin ? `${origin.replace(/\/+$/, "")}/r/${encodeURIComponent(row.slug)}?token=${token}` : null;
  return { request: present(db, occupantId, readRow(db, occupantId, id)), accessLink };
}

/** The reply email for a received request, for a Gmail draft the occupant sends. */
export function receivedEmail(
  db: DatabaseSync,
  occupantId: string,
  id: string,
  accessLink: string | null,
  origin: string | null = null,
): { to: string; subject: string; body: string } {
  const row = readRow(db, occupantId, id);
  const status = receivedStatus(row.status);
  if (status === "waiting") throw new RequestStoreError("request-open");
  // Without a link from the screen, use the one Docier keeps for them, while it still works.
  if (!accessLink && origin && row.grant_id) {
    const grant = db
      .prepare(
        "SELECT link_token FROM projection_access_grants WHERE id = ? AND revoked_at IS NULL AND expires_at > ?",
      )
      .get(row.grant_id, new Date().toISOString()) as { link_token: string | null } | undefined;
    if (grant?.link_token) {
      accessLink = `${origin.replace(/\/+$/, "")}/r/${encodeURIComponent(row.slug)}?token=${grant.link_token}`;
    }
  }
  const profile = readProfile(db, occupantId);
  const fromName = profile.fullName.trim() || `${profile.firstName} ${profile.lastName}`.trim() || "Me";
  const draft = receivedReplyDraft({
    fromName,
    requesterName: row.requester_name,
    decision: status === "approved" ? "approved" : "declined",
    note: row.owner_note,
    accessLink,
  });
  return { to: row.requester_email, ...draft };
}

/** Clears an answered request from Requests. One still waiting must be answered first. */
export function clearReceived(db: DatabaseSync, occupantId: string, id: string) {
  const row = readRow(db, occupantId, id);
  if (receivedStatus(row.status) === "waiting") throw new RequestStoreError("request-open");
  db.prepare("UPDATE projection_access_requests SET cleared_at = ? WHERE id = ?").run(new Date().toISOString(), id);
}

/** Clears every answered request; ones still waiting stay. Returns how many were cleared. */
export function clearFinishedReceived(db: DatabaseSync, occupantId: string): number {
  return Number(
    db
      .prepare(
        `UPDATE projection_access_requests SET cleared_at = ?
          WHERE cleared_at IS NULL AND status IN ('granted', 'declined')
            AND projection_id IN (SELECT id FROM interactive_projections WHERE occupant_id = ?)`,
      )
      .run(new Date().toISOString(), occupantId).changes,
  );
}
