import type { OccupantNotice } from "./notices";
import type { ChangeSet } from "./governance";

export type MessageDirection = "inbound" | "outbound";

export type ContactMessage = {
  id: string;
  occupantId: string;
  contactId: string;
  direction: MessageDirection;
  body: string;
  evidenceId: string;
  createdAt: string;
};

export type ConversationError = "contact-required" | "body-required";

export function prepareContactMessage(
  message: ContactMessage,
):
  | { ok: true; value: ContactMessage }
  | { ok: false; error: ConversationError } {
  if (!message.contactId.trim()) return { ok: false, error: "contact-required" };
  if (!message.body.trim()) return { ok: false, error: "body-required" };
  return {
    ok: true,
    value: {
      ...message,
      contactId: message.contactId.trim(),
      body: message.body.trim(),
    },
  };
}

export function inboundRaisesNotice(unreadInboundBefore: number): boolean {
  return unreadInboundBefore === 0;
}

export function presentInboundMessageNotice(input: {
  contactId: string;
  contactName: string;
  preview: string;
  createdAt: string;
}): OccupantNotice {
  return {
    id: `contact:${input.contactId}`,
    kind: "inbound-message",
    title: `${input.contactName.trim()} sent a message`,
    detail: input.preview.trim(),
    href: "network",
    createdAt: input.createdAt,
  };
}

export function planSuggestedReplyChangeSet(input: {
  id: string;
  occupantId: string;
  contactId: string;
  contactName: string;
  destination: string;
  body: string;
  createdAt: string;
}): ChangeSet | null {
  const body = input.body.trim();
  if (!body) return null;
  return {
    id: input.id,
    occupantId: input.occupantId,
    purpose: `Reply to ${input.contactName.trim()}`,
    destination: input.destination,
    createdAt: input.createdAt,
    operations: [
      {
        action: "send",
        entityType: "external-message",
        entityId: input.contactId,
        values: { body, contactId: input.contactId },
      },
    ],
  };
}
