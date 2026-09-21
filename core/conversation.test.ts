import { describe, expect, it } from "vitest";
import {
  inboundRaisesNotice,
  presentInboundMessageNotice,
  prepareContactMessage,
} from "./conversation";

describe("contact conversation", () => {
  it("requires a contact and a message body", () => {
    expect(
      prepareContactMessage({
        id: "msg-1",
        occupantId: "local",
        contactId: "",
        direction: "inbound",
        body: "May we talk Thursday?",
        evidenceId: "ev-1",
        createdAt: "2026-09-21T13:00:00.000Z",
      }),
    ).toEqual({ ok: false, error: "contact-required" });
    expect(
      prepareContactMessage({
        id: "msg-1",
        occupantId: "local",
        contactId: "contact-1",
        direction: "outbound",
        body: "   ",
        evidenceId: "ev-1",
        createdAt: "2026-09-21T13:00:00.000Z",
      }),
    ).toEqual({ ok: false, error: "body-required" });
  });

  it("raises one Notice only for the first unread inbound", () => {
    expect(inboundRaisesNotice(0)).toBe(true);
    expect(inboundRaisesNotice(1)).toBe(false);
  });

  it("opens an inbound Notice on My Network", () => {
    expect(
      presentInboundMessageNotice({
        contactId: "contact-1",
        contactName: "Alex Rivera",
        preview: "May we talk Thursday?",
        createdAt: "2026-09-21T13:00:00.000Z",
      }),
    ).toEqual({
      id: "contact:contact-1",
      kind: "inbound-message",
      title: "Alex Rivera sent a message",
      detail: "May we talk Thursday?",
      href: "network",
      createdAt: "2026-09-21T13:00:00.000Z",
    });
  });
});
