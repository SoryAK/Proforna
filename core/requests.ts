import type { ChangeOperation } from "./governance";

/**
 * Requests the occupant sends to anyone, inside or outside My Network. Each
 * request is answered on a private Relay link; Docier follows its status.
 */

export const REQUEST_KINDS = ["reference", "introduction", "recommendation", "general"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export const REQUEST_KIND_LABEL: Record<RequestKind, string> = {
  reference: "Reference",
  introduction: "Introduction",
  recommendation: "Recommendation",
  general: "General",
};

/** What the recipient is asked, in the page heading: "Sory asks you to …". */
export const REQUEST_KIND_ASK: Record<RequestKind, string> = {
  reference: "be a reference",
  introduction: "make an introduction",
  recommendation: "write a recommendation",
  general: "help with something",
};

export type SentRequestStatus = "sent" | "opened" | "approved" | "declined" | "expired" | "withdrawn";

export const SENT_STATUS_LABEL: Record<SentRequestStatus, string> = {
  sent: "Sent",
  opened: "Opened",
  approved: "Approved",
  declined: "Declined",
  expired: "Expired",
  withdrawn: "Withdrawn",
};

export const REQUEST_BODY_MAX = 4000;
export const REQUEST_NOTE_MAX = 2000;
export const REQUEST_DEFAULT_DAYS = 30;

export type RequestRecipient = { contactId: string } | { name: string; email: string };

export type PreparedRequest = {
  kind: RequestKind;
  body: string;
  recipient: RequestRecipient;
  expiresInDays: number;
};

export type RequestError =
  | "kind-invalid"
  | "body-required"
  | "body-too-long"
  | "recipient-required"
  | "email-invalid"
  | "expiry-invalid";

function field(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isRequestKind(value: unknown): value is RequestKind {
  return typeof value === "string" && (REQUEST_KINDS as readonly string[]).includes(value);
}

/**
 * The one reading of a request, shared by creating it and changing it.
 * The recipient is either someone in My Network (`contactId`) or anyone by
 * name and email.
 */
export function prepareOutgoingRequest(
  input: unknown,
): { ok: true; value: PreparedRequest } | { ok: false; error: RequestError } {
  const record =
    input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  if (!isRequestKind(record.kind)) return { ok: false, error: "kind-invalid" };
  const body = field(record.body);
  if (!body) return { ok: false, error: "body-required" };
  if (body.length > REQUEST_BODY_MAX) return { ok: false, error: "body-too-long" };

  let recipient: RequestRecipient;
  const contactId = field(record.contactId);
  if (contactId) {
    recipient = { contactId };
  } else {
    const name = field(record.recipientName);
    const email = field(record.recipientEmail);
    if (!name || !email) return { ok: false, error: "recipient-required" };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "email-invalid" };
    recipient = { name, email };
  }

  const days = record.expiresInDays === undefined ? REQUEST_DEFAULT_DAYS : Number(record.expiresInDays);
  if (!Number.isInteger(days) || days < 1 || days > 365) return { ok: false, error: "expiry-invalid" };
  return { ok: true, value: { kind: record.kind, body, recipient, expiresInDays: days } };
}

/** Waiting on the recipient: the request can still be edited or withdrawn. */
export function isPendingRequest(status: SentRequestStatus): boolean {
  return status === "sent" || status === "opened";
}

/** A pending request past its expiry reads as expired; answered ones keep their answer. */
export function effectiveRequestStatus(
  status: SentRequestStatus,
  expiresAt: string,
  now: string,
): SentRequestStatus {
  return isPendingRequest(status) && expiresAt <= now ? "expired" : status;
}

export type RelayRequestState = {
  status: "sent" | "opened" | "approved" | "declined" | "withdrawn";
  note: string;
  openedAt: string | null;
  answeredAt: string | null;
};

/**
 * Moves a request forward with what the Relay reports. Statuses never move
 * back, and a request withdrawn here stays withdrawn.
 */
export function applyRelayRequestState(
  current: SentRequestStatus,
  relay: RelayRequestState,
): SentRequestStatus {
  if (!isPendingRequest(current)) return current;
  if (relay.status === "approved" || relay.status === "declined") return relay.status;
  if (relay.status === "opened" && current === "sent") return "opened";
  return current;
}

export type RequestDecision = "approved" | "declined";

/** A recipient's answer on the Relay page. */
export function prepareRequestAnswer(
  input: unknown,
): { ok: true; value: { decision: RequestDecision; note: string } } | { ok: false; error: "decision-invalid" | "note-too-long" } {
  const record =
    input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const decision = record.decision;
  if (decision !== "approved" && decision !== "declined") return { ok: false, error: "decision-invalid" };
  const note = field(record.note);
  if (note.length > REQUEST_NOTE_MAX) return { ok: false, error: "note-too-long" };
  return { ok: true, value: { decision, note } };
}

/** The email the occupant can draft to share a request link. */
export function requestEmailDraft(input: {
  kind: RequestKind;
  fromName: string;
  recipientName: string;
  body: string;
  link: string;
}): { subject: string; body: string } {
  const first = input.recipientName.split(/\s+/)[0] || input.recipientName;
  return {
    subject: `${input.fromName}: ${REQUEST_KIND_LABEL[input.kind].toLowerCase()} request`,
    body: `Hi ${first},\n\n${input.body}\n\nYou can answer here: ${input.link}\n\n${input.fromName}`,
  };
}

/** Sharing a request puts it on the Relay, so it goes through approval like publishing. */
export function planRequestShare(input: {
  requestId: string;
  kind: RequestKind;
  recipientName: string;
  expiresAt: string;
}): ChangeOperation {
  return {
    action: "publish",
    entityType: "outgoing-request",
    entityId: input.requestId,
    values: { kind: input.kind, recipientName: input.recipientName, expiresAt: input.expiresAt },
  };
}

export function planRequestWithdraw(input: { requestId: string }): ChangeOperation {
  return { action: "revoke", entityType: "outgoing-request", entityId: input.requestId, values: {} };
}
