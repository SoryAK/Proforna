import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  prepareContactMessage,
  type ContactMessage,
  type ExternalAction,
} from "../core/index";
import {
  mintOccupantApproval,
  persistApprovedChange,
  persistAuditEvent,
} from "./change-sets";
import {
  CareerManagementStoreError,
  createContact,
  type ExternalActionAdapter,
} from "./career-management";
import { saveEvidence } from "./career-memory";

type JsonObject = Record<string, unknown>;

export type InboundThread = {
  contactId: string;
  contactName: string;
  preview: string;
  createdAt: string;
};

export function listUnreadInboundThreads(
  db: DatabaseSync,
  occupantId: string,
): InboundThread[] {
  return db
    .prepare(
      `SELECT c.id AS contactId,
              c.name AS contactName,
              m.body AS preview,
              m.created_at AS createdAt
         FROM contacts c
         JOIN contact_messages m ON m.id = (
           SELECT id FROM contact_messages
            WHERE contact_id = c.id AND direction = 'inbound'
            ORDER BY created_at DESC, id DESC
            LIMIT 1
         )
        WHERE c.occupant_id = ? AND c.unread_inbound > 0
        ORDER BY m.created_at DESC`,
    )
    .all(occupantId) as InboundThread[];
}

export function receiveInboundMessage(
  db: DatabaseSync,
  occupantId: string,
  input: JsonObject,
): { contact: { id: string; name: string; email: string }; message: ContactMessage } {
  const email = text(input.email);
  if (!email) throw new ConversationStoreError("email-required");
  const body = text(input.body);
  const name = text(input.name) || email;
  let contact = findContactByEmail(db, occupantId, email);
  if (!contact) {
    contact = createContact(db, occupantId, {
      name,
      email,
      organization: text(input.organization),
    });
  }
  const message = persistMessage(db, occupantId, {
    contactId: contact.id,
    direction: "inbound",
    body,
    title: `Message from ${contact.name}`,
  });
  db.prepare(
    `UPDATE contacts SET unread_inbound = unread_inbound + 1
      WHERE id = ? AND occupant_id = ?`,
  ).run(contact.id, occupantId);
  return {
    contact: { id: contact.id, name: contact.name, email: contact.email },
    message,
  };
}

export async function sendOccupantMessage(
  db: DatabaseSync,
  occupantId: string,
  contactId: string,
  input: JsonObject,
  adapter?: ExternalActionAdapter,
): Promise<{
  message: ContactMessage;
  action: ExternalAction;
}> {
  const contact = readContact(db, occupantId, contactId);
  const body = text(input.body);
  if (!body) throw new ConversationStoreError("body-required");
  const now = new Date().toISOString();
  const destination = contact.email || `contact:${contact.id}`;
  const minted = await mintOccupantApproval(occupantId, {
    purpose: `Send message to ${contact.name}`,
    destination,
    operations: [
      {
        action: "send",
        entityType: "external-message",
        entityId: contact.id,
        values: { body, contactId: contact.id },
      },
    ],
    now,
  });
  const action: ExternalAction = {
    id: randomUUID(),
    occupantId,
    kind: "message",
    destination,
    payload: { body, contactId: contact.id },
    idempotencyKey: `contact-send:${minted.changeSet.id}`,
    status: "completed",
    createdAt: now,
  };
  persistApprovedChange(
    db,
    minted.changeSet,
    minted.hash,
    minted.approval,
    "committed",
  );
  const result = adapter
    ? await adapter.perform(action)
    : { queued: true, note: "No external adapter configured." };
  db.prepare(
    `INSERT INTO external_actions
      (id, occupant_id, kind, destination, payload_json, idempotency_key,
       status, change_set_id, result_json, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)`,
  ).run(
    action.id,
    occupantId,
    action.kind,
    action.destination,
    JSON.stringify(action.payload),
    action.idempotencyKey,
    minted.changeSet.id,
    JSON.stringify(result),
    now,
    now,
  );
  const message = persistMessage(db, occupantId, {
    contactId: contact.id,
    direction: "outbound",
    body,
    title: `Message to ${contact.name}`,
    changeSetId: minted.changeSet.id,
  });
  persistAuditEvent(db, {
    id: randomUUID(),
    occupantId,
    eventType: "external-action-completed",
    entityType: "external-message",
    entityId: action.id,
    changeSetId: minted.changeSet.id,
    approvalId: minted.approval.id,
    detail: { destination, contactId: contact.id },
    occurredAt: now,
  });
  return { message, action };
}

export function listContactMessages(
  db: DatabaseSync,
  occupantId: string,
  contactId: string,
): ContactMessage[] {
  readContact(db, occupantId, contactId);
  db.prepare(
    "UPDATE contacts SET unread_inbound = 0 WHERE id = ? AND occupant_id = ?",
  ).run(contactId, occupantId);
  return db
    .prepare(
      `SELECT id, occupant_id, contact_id, direction, body, evidence_id, created_at
         FROM contact_messages
        WHERE occupant_id = ? AND contact_id = ?
        ORDER BY created_at ASC, id ASC`,
    )
    .all(occupantId, contactId)
    .map(mapMessage);
}

function persistMessage(
  db: DatabaseSync,
  occupantId: string,
  input: {
    contactId: string;
    direction: "inbound" | "outbound";
    body: string;
    title: string;
    changeSetId?: string;
  },
): ContactMessage {
  const now = new Date().toISOString();
  const messageId = randomUUID();
  const evidence = saveEvidence(db, occupantId, {
    sourceType: "message",
    sourceRef: messageId,
    title: input.title,
    content: {
      contactId: input.contactId,
      direction: input.direction,
      body: input.body,
    },
  });
  const prepared = prepareContactMessage({
    id: messageId,
    occupantId,
    contactId: input.contactId,
    direction: input.direction,
    body: input.body,
    evidenceId: evidence.id,
    createdAt: now,
  });
  if (!prepared.ok) throw new ConversationStoreError(prepared.error);
  db.prepare(
    `INSERT INTO contact_messages
      (id, occupant_id, contact_id, direction, body, evidence_id, change_set_id,
       created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    prepared.value.id,
    occupantId,
    prepared.value.contactId,
    prepared.value.direction,
    prepared.value.body,
    prepared.value.evidenceId,
    input.changeSetId ?? null,
    prepared.value.createdAt,
  );
  return prepared.value;
}

function findContactByEmail(
  db: DatabaseSync,
  occupantId: string,
  email: string,
) {
  const row = db
    .prepare(
      `SELECT id, name, email FROM contacts
        WHERE occupant_id = ? AND email != '' AND lower(email) = lower(?)`,
    )
    .get(occupantId, email) as
    | { id: string; name: string; email: string }
    | undefined;
  return row ?? null;
}

function readContact(
  db: DatabaseSync,
  occupantId: string,
  contactId: string,
): { id: string; name: string; email: string } {
  const row = db
    .prepare(
      "SELECT id, name, email FROM contacts WHERE id = ? AND occupant_id = ?",
    )
    .get(contactId, occupantId) as
    | { id: string; name: string; email: string }
    | undefined;
  if (!row) throw new ConversationStoreError("contact-missing");
  return row;
}

function mapMessage(row: unknown): ContactMessage {
  const value = row as JsonObject;
  return {
    id: String(value.id),
    occupantId: String(value.occupant_id),
    contactId: String(value.contact_id),
    direction: value.direction === "outbound" ? "outbound" : "inbound",
    body: String(value.body),
    evidenceId: String(value.evidence_id),
    createdAt: String(value.created_at),
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export class ConversationStoreError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
