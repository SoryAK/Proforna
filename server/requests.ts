import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { contactPhotos, takeJoinPhoto } from "./contact-photos";
import {
  applyRelayRequestState,
  mergeJoinIntoContact,
  effectiveRequestStatus,
  isPendingRequest,
  planRequestShare,
  planRequestWithdraw,
  prepareOutgoingRequest,
  requestEmailDraft,
  type RelayRequestState,
  type RequestKind,
  type SentRequestStatus,
} from "../core/index";
import { mintOccupantApproval, persistApprovedChange, persistAuditEvent } from "./change-sets";
import { createContact } from "./career-management";
import { readProfile } from "./occupant";

/** How Docier reaches the Relay for requests. */
export type RequestRelay = {
  putAsk(tokenHash: string, ask: RelayAsk): Promise<void>;
  withdrawAsk(tokenHash: string): Promise<void>;
  askStates(tokenHashes: string[]): Promise<Record<string, RelayRequestState>>;
  /** Tells the Relay to drop a joiner's details once Docier has them. */
  forgetJoin(tokenHash: string): Promise<void>;
  /** Access requests left on public pages after `after` (an ISO time). */
  inbound(after: string): Promise<InboundAccessRequest[]>;
};

export type InboundAccessRequest = {
  id: string;
  slug: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
};

export type RelayAsk = {
  kind: RequestKind;
  body: string;
  fromName: string;
  fromHeadline: string;
  recipientName: string;
  expiresAt: string;
};

export type SentRequest = {
  id: string;
  kind: RequestKind;
  body: string;
  contactId: string | null;
  recipientName: string;
  recipientEmail: string;
  status: SentRequestStatus;
  /** True when the status changed since the occupant last looked. */
  changed: boolean;
  note: string;
  link: string | null;
  createdAt: string;
  openedAt: string | null;
  answeredAt: string | null;
  expiresAt: string;
  /** Whether the recipient joined My Network; null while unknown or not asked yet. */
  joinStatus: "joined" | "declined" | "ignored" | null;
  /** When it was cleared from the lists; it stays in History. */
  clearedAt: string | null;
};

type Row = {
  id: string;
  contact_id: string | null;
  recipient_name: string;
  recipient_email: string;
  kind: RequestKind;
  body: string;
  link_token: string;
  status: SentRequestStatus;
  seen_status: SentRequestStatus | null;
  recipient_note: string;
  opened_at: string | null;
  answered_at: string | null;
  expires_at: string;
  created_at: string;
  join_status: "joined" | "declined" | "ignored" | null;
  joined_contact_id: string | null;
  cleared_at: string | null;
};

export class RequestStoreError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

function linkFor(origin: string | null, token: string): string | null {
  return origin ? `${origin.replace(/\/+$/, "")}/q/${token}` : null;
}

function present(row: Row, origin: string | null, now: string): SentRequest {
  const status = effectiveRequestStatus(row.status, row.expires_at, now);
  return {
    id: row.id,
    kind: row.kind,
    body: row.body,
    contactId: row.contact_id,
    recipientName: row.recipient_name,
    recipientEmail: row.recipient_email,
    status,
    // News worth a dot: an answer or an expiry the occupant hasn't seen.
    changed:
      row.seen_status !== null &&
      row.seen_status !== status &&
      (status === "approved" || status === "declined" || status === "expired"),
    note: row.recipient_note,
    link: isPendingRequest(status) ? linkFor(origin, row.link_token) : null,
    createdAt: row.created_at,
    openedAt: row.opened_at,
    answeredAt: row.answered_at,
    expiresAt: row.expires_at,
    joinStatus: row.join_status,
    clearedAt: row.cleared_at ?? null,
  };
}

function resolveRecipient(
  db: DatabaseSync,
  occupantId: string,
  recipient: { contactId: string } | { name: string; email: string },
): { contactId: string | null; name: string; email: string } {
  if ("contactId" in recipient) {
    const contact = db
      .prepare("SELECT id, name, email FROM contacts WHERE id = ? AND occupant_id = ?")
      .get(recipient.contactId, occupantId) as { id: string; name: string; email: string } | undefined;
    if (!contact) throw new RequestStoreError("contact-missing");
    return { contactId: contact.id, name: contact.name, email: contact.email };
  }
  return { contactId: null, name: recipient.name, email: recipient.email };
}

function sender(db: DatabaseSync, occupantId: string) {
  const profile = readProfile(db, occupantId);
  const fromName = profile.fullName.trim() || `${profile.firstName} ${profile.lastName}`.trim();
  if (!fromName) throw new RequestStoreError("profile-name-required");
  return { fromName, fromHeadline: profile.headline };
}

function readRow(db: DatabaseSync, occupantId: string, id: string): Row {
  const row = db
    .prepare("SELECT * FROM outgoing_requests WHERE id = ? AND occupant_id = ?")
    .get(id, occupantId) as Row | undefined;
  if (!row) throw new RequestStoreError("not-found");
  return row;
}

/**
 * Creates a request and puts it on the Relay, where the recipient answers.
 * The Relay is written first, so a failure leaves nothing half-made here.
 */
export async function createRequest(
  db: DatabaseSync,
  occupantId: string,
  input: unknown,
  relay: RequestRelay | undefined,
  origin: string | null,
): Promise<SentRequest> {
  if (!relay || !origin) throw new RequestStoreError("relay-not-configured");
  const prepared = prepareOutgoingRequest(input);
  if (!prepared.ok) throw new RequestStoreError(prepared.error);
  const recipient = resolveRecipient(db, occupantId, prepared.value.recipient);
  const { fromName, fromHeadline } = sender(db, occupantId);
  const id = randomUUID();
  const token = randomBytes(24).toString("base64url");
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + prepared.value.expiresInDays * 86_400_000).toISOString();
  const minted = await mintOccupantApproval(occupantId, {
    purpose: "Share a request",
    destination: "relay:requests",
    operations: [
      planRequestShare({ requestId: id, kind: prepared.value.kind, recipientName: recipient.name, expiresAt }),
    ],
    now: createdAt,
  });
  await relay.putAsk(tokenHash(token), {
    kind: prepared.value.kind,
    body: prepared.value.body,
    fromName,
    fromHeadline,
    recipientName: recipient.name,
    expiresAt,
  });
  db.exec("BEGIN");
  try {
    persistApprovedChange(db, minted.changeSet, minted.hash, minted.approval);
    db.prepare(
      `INSERT INTO outgoing_requests
        (id, occupant_id, contact_id, recipient_name, recipient_email, kind, body, link_token,
         status, seen_status, recipient_note, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sent', 'sent', '', ?, ?, ?)`,
    ).run(
      id,
      occupantId,
      recipient.contactId,
      recipient.name,
      recipient.email,
      prepared.value.kind,
      prepared.value.body,
      token,
      expiresAt,
      createdAt,
      createdAt,
    );
    persistAuditEvent(db, {
      id: randomUUID(),
      occupantId,
      eventType: "request-shared",
      entityType: "outgoing-request",
      entityId: id,
      changeSetId: minted.changeSet.id,
      approvalId: minted.approval.id,
      detail: { kind: prepared.value.kind },
      occurredAt: createdAt,
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return present(readRow(db, occupantId, id), origin, createdAt);
}

/**
 * Lists sent requests, newest first, after reading fresh answers from the
 * Relay. When the Relay can't be reached, the last known statuses are shown.
 */
export async function listRequests(
  db: DatabaseSync,
  occupantId: string,
  relay: RequestRelay | undefined,
  origin: string | null,
  uploadsDir?: string,
): Promise<{ requests: SentRequest[]; stale: boolean }> {
  const rows = db
    .prepare("SELECT * FROM outgoing_requests WHERE occupant_id = ? ORDER BY created_at DESC")
    .all(occupantId) as Row[];
  let stale = false;
  // Waiting requests, plus answered ones whose join choice hasn't been taken in yet.
  const pending = rows.filter((row) => isPendingRequest(row.status) || (isAnswered(row.status) && row.join_status === null));
  if (relay && pending.length > 0) {
    try {
      const states = await relay.askStates(pending.map((row) => tokenHash(row.link_token)));
      const update = db.prepare(
        `UPDATE outgoing_requests
            SET status = ?, recipient_note = ?, opened_at = COALESCE(opened_at, ?), answered_at = ?, updated_at = ?
          WHERE id = ?`,
      );
      for (const row of pending) {
        const state = states[tokenHash(row.link_token)];
        if (!state) continue;
        if (isAnswered(state.status)) await takeJoin(db, occupantId, row, state, relay, uploadsDir);
        const next = applyRelayRequestState(row.status, state);
        if (next === row.status && !(state.openedAt && !row.opened_at)) continue;
        update.run(next, state.note, state.openedAt, state.answeredAt, new Date().toISOString(), row.id);
        row.status = next;
        row.recipient_note = state.note;
        row.opened_at = row.opened_at ?? state.openedAt;
        row.answered_at = state.answeredAt;
      }
    } catch {
      stale = true;
    }
  }
  const now = new Date().toISOString();
  const photos = contactPhotos(db, occupantId);
  return {
    requests: rows.map((row) => ({ ...present(row, origin, now), photoUrl: photos.find(row.contact_id, row.recipient_email) })),
    stale,
  };
}

function isAnswered(status: string): boolean {
  return status === "approved" || status === "declined";
}

/**
 * Takes in what the recipient chose about joining. Joining adds them to My
 * Network, or fills blanks on the contact with that email, and then the Relay
 * forgets their details. Answering without choosing counts as ignored.
 */
async function takeJoin(
  db: DatabaseSync,
  occupantId: string,
  row: Row,
  state: RelayRequestState,
  relay: RequestRelay,
  uploadsDir?: string,
): Promise<void> {
  if (row.join_status !== null) return;
  const join = state.join ?? null;
  if (!join) {
    db.prepare("UPDATE outgoing_requests SET join_status = 'ignored' WHERE id = ?").run(row.id);
    row.join_status = "ignored";
    return;
  }
  if (join.choice === "declined" || !join.details) {
    db.prepare("UPDATE outgoing_requests SET join_status = ? WHERE id = ?").run(join.choice, row.id);
    row.join_status = join.choice;
    return;
  }
  const details = join.details;
  const existing = db
    .prepare(
      "SELECT id, name, email, organization, role, notes FROM contacts WHERE occupant_id = ? AND lower(email) = lower(?) LIMIT 1",
    )
    .get(occupantId, details.email) as
    | { id: string; name: string; email: string; organization: string; role: string; notes: string }
    | undefined;
  let contactId: string;
  if (existing) {
    const merged = mergeJoinIntoContact(existing, details);
    db.prepare(
      "UPDATE contacts SET name = ?, email = ?, organization = ?, role = ?, notes = ? WHERE id = ? AND occupant_id = ?",
    ).run(merged.name, merged.email, merged.organization, merged.role, merged.notes, existing.id, occupantId);
    contactId = existing.id;
  } else {
    contactId = createContact(db, occupantId, {
      name: details.name,
      email: details.email,
      organization: details.organization,
      role: details.role,
      notes: details.phone ? `Phone: ${details.phone}` : "",
    }).id;
  }
  takeJoinPhoto(db, occupantId, uploadsDir, contactId, details.photo ?? "");
  db.prepare(
    "UPDATE outgoing_requests SET join_status = 'joined', joined_contact_id = ?, contact_id = COALESCE(contact_id, ?) WHERE id = ?",
  ).run(contactId, contactId, row.id);
  row.join_status = "joined";
  row.joined_contact_id = contactId;
  row.contact_id = row.contact_id ?? contactId;
  // Docier has the details now, so the Relay drops them. If that call fails the
  // contact is still right here; the details stay on the Relay until it expires.
  await relay.forgetJoin(tokenHash(row.link_token)).catch(() => undefined);
}

/** Changes a request nobody has answered yet, with the same fields that create it. */
export async function updateRequest(
  db: DatabaseSync,
  occupantId: string,
  id: string,
  input: unknown,
  relay: RequestRelay | undefined,
  origin: string | null,
): Promise<SentRequest> {
  if (!relay || !origin) throw new RequestStoreError("relay-not-configured");
  const row = readRow(db, occupantId, id);
  const now = new Date().toISOString();
  if (!isPendingRequest(effectiveRequestStatus(row.status, row.expires_at, now))) {
    throw new RequestStoreError("request-closed");
  }
  const prepared = prepareOutgoingRequest(input);
  if (!prepared.ok) throw new RequestStoreError(prepared.error);
  const recipient = resolveRecipient(db, occupantId, prepared.value.recipient);
  const { fromName, fromHeadline } = sender(db, occupantId);
  // An edit that doesn't mention expiry keeps the one the request has.
  const asksExpiry = Boolean(input && typeof input === "object" && "expiresInDays" in input);
  const expiresAt = asksExpiry
    ? new Date(new Date(row.created_at).getTime() + prepared.value.expiresInDays * 86_400_000).toISOString()
    : row.expires_at;
  await relay.putAsk(tokenHash(row.link_token), {
    kind: prepared.value.kind,
    body: prepared.value.body,
    fromName,
    fromHeadline,
    recipientName: recipient.name,
    expiresAt,
  });
  db.prepare(
    `UPDATE outgoing_requests
        SET contact_id = ?, recipient_name = ?, recipient_email = ?, kind = ?, body = ?, expires_at = ?, updated_at = ?
      WHERE id = ? AND occupant_id = ?`,
  ).run(recipient.contactId, recipient.name, recipient.email, prepared.value.kind, prepared.value.body, expiresAt, now, id, occupantId);
  return present(readRow(db, occupantId, id), origin, now);
}

/** Withdraws a request nobody has answered. Its link then says it was withdrawn. */
export async function withdrawRequest(
  db: DatabaseSync,
  occupantId: string,
  id: string,
  relay: RequestRelay | undefined,
): Promise<void> {
  const row = readRow(db, occupantId, id);
  if (!isPendingRequest(row.status)) throw new RequestStoreError("request-closed");
  const now = new Date().toISOString();
  const minted = await mintOccupantApproval(occupantId, {
    purpose: "Withdraw a request",
    destination: "relay:requests",
    operations: [planRequestWithdraw({ requestId: id })],
    now,
  });
  if (relay) await relay.withdrawAsk(tokenHash(row.link_token));
  db.exec("BEGIN");
  try {
    persistApprovedChange(db, minted.changeSet, minted.hash, minted.approval);
    db.prepare("UPDATE outgoing_requests SET status = 'withdrawn', updated_at = ? WHERE id = ?").run(now, id);
    persistAuditEvent(db, {
      id: randomUUID(),
      occupantId,
      eventType: "request-withdrawn",
      entityType: "outgoing-request",
      entityId: id,
      changeSetId: minted.changeSet.id,
      approvalId: minted.approval.id,
      detail: {},
      occurredAt: now,
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** Removes a request from the list. One still waiting is withdrawn first. */
export async function removeRequest(
  db: DatabaseSync,
  occupantId: string,
  id: string,
  relay: RequestRelay | undefined,
): Promise<void> {
  const row = readRow(db, occupantId, id);
  if (isPendingRequest(row.status)) await withdrawRequest(db, occupantId, id, relay);
  db.prepare("DELETE FROM outgoing_requests WHERE id = ? AND occupant_id = ?").run(id, occupantId);
}

/** Clears a finished request from the lists. It stays in History; one still open can't be cleared. */
export function clearSent(db: DatabaseSync, occupantId: string, id: string): void {
  const row = readRow(db, occupantId, id);
  if (isPendingRequest(effectiveRequestStatus(row.status, row.expires_at, new Date().toISOString()))) {
    throw new RequestStoreError("request-open");
  }
  db.prepare("UPDATE outgoing_requests SET cleared_at = COALESCE(cleared_at, ?) WHERE id = ?").run(new Date().toISOString(), id);
}

/**
 * Clears every finished request (answered, expired, or withdrawn) from the
 * lists; they stay in History. Ones still waiting on the other person stay.
 * Returns how many were cleared.
 */
export function clearFinishedSent(db: DatabaseSync, occupantId: string): number {
  const now = new Date().toISOString();
  const rows = db
    .prepare("SELECT * FROM outgoing_requests WHERE occupant_id = ? AND cleared_at IS NULL")
    .all(occupantId) as Row[];
  // An answer not seen yet stays until it has been: clearing never hides news.
  const finished = rows
    .map((row) => present(row, null, now))
    .filter((request) => !isPendingRequest(request.status) && !request.changed);
  const clear = db.prepare("UPDATE outgoing_requests SET cleared_at = ? WHERE id = ?");
  for (const request of finished) clear.run(now, request.id);
  return finished.length;
}

/** Records that the occupant has seen the current status, which clears the "changed" dot. */
export function markRequestsSeen(db: DatabaseSync, occupantId: string, ids: string[]): void {
  const now = new Date().toISOString();
  const rows = ids.length
    ? (db
        .prepare(`SELECT * FROM outgoing_requests WHERE occupant_id = ? AND id IN (${ids.map(() => "?").join(", ")})`)
        .all(occupantId, ...ids) as Row[])
    : [];
  const update = db.prepare("UPDATE outgoing_requests SET seen_status = ? WHERE id = ?");
  for (const row of rows) update.run(effectiveRequestStatus(row.status, row.expires_at, now), row.id);
}

/** The subject and body of an email sharing a request, for a Gmail draft. */
export function requestEmail(
  db: DatabaseSync,
  occupantId: string,
  id: string,
  origin: string | null,
): { to: string; subject: string; body: string } {
  const row = readRow(db, occupantId, id);
  const link = linkFor(origin, row.link_token);
  if (!link || !isPendingRequest(effectiveRequestStatus(row.status, row.expires_at, new Date().toISOString()))) {
    throw new RequestStoreError("request-closed");
  }
  if (!row.recipient_email) throw new RequestStoreError("email-missing");
  const { fromName } = sender(db, occupantId);
  const draft = requestEmailDraft({ kind: row.kind, fromName, recipientName: row.recipient_name, body: row.body, link });
  return { to: row.recipient_email, ...draft };
}
