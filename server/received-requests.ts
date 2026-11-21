import type { DatabaseSync } from "node:sqlite";
import {
  REQUEST_DEFAULT_DAYS,
  prepareRequestAnswer,
  receivedReplyDraft,
  receivedStatus,
  type ReceivedRequestStatus,
} from "../core/index";
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
  createdAt: string;
  answeredAt: string | null;
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
};

const SELECT = `SELECT r.id, r.requester_name, r.requester_email, r.message, r.status, r.owner_note,
                       r.opportunity_id, r.created_at, r.answered_at, p.slug
                  FROM projection_access_requests r
                  JOIN interactive_projections p ON p.id = r.projection_id`;

function present(row: Row): ReceivedRequest {
  return {
    id: row.id,
    kind: "access",
    requesterName: row.requester_name,
    requesterEmail: row.requester_email,
    message: row.message,
    status: receivedStatus(row.status),
    note: row.owner_note,
    pageSlug: row.slug,
    createdAt: row.created_at,
    answeredAt: row.answered_at,
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
      captureAccessRequest(
        db,
        request.slug,
        { name: request.name, email: request.email, message: request.message },
        { id: request.id, createdAt: request.createdAt },
      );
    } catch {
      // A page removed here, or a malformed request: skip it rather than stop the rest.
    }
  }
  return true;
}

export function listReceived(db: DatabaseSync, occupantId: string): ReceivedRequest[] {
  return (db.prepare(`${SELECT} WHERE p.occupant_id = ? ORDER BY r.created_at DESC`).all(occupantId) as Row[]).map(
    present,
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
  const record = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const days = record.expiresInDays === undefined ? REQUEST_DEFAULT_DAYS : Number(record.expiresInDays);
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new RequestStoreError("expiry-invalid");
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
  const result = await resolveOpportunityAccess(
    db,
    occupantId,
    row.opportunity_id,
    prepared.value.decision === "approved" ? "grant" : "decline",
    expiresAt,
    projectionRelay,
  );
  db.prepare("UPDATE projection_access_requests SET owner_note = ?, answered_at = ? WHERE id = ?").run(
    prepared.value.note,
    new Date().toISOString(),
    id,
  );
  const token = "grant" in result && result.grant ? result.grant.token : null;
  const accessLink =
    token && origin ? `${origin.replace(/\/+$/, "")}/r/${encodeURIComponent(row.slug)}?token=${token}` : null;
  return { request: present(readRow(db, occupantId, id)), accessLink };
}

/** The reply email for a received request, for a Gmail draft the occupant sends. */
export function receivedEmail(
  db: DatabaseSync,
  occupantId: string,
  id: string,
  accessLink: string | null,
): { to: string; subject: string; body: string } {
  const row = readRow(db, occupantId, id);
  const status = receivedStatus(row.status);
  if (status === "waiting") throw new RequestStoreError("request-open");
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
