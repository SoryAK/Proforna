import { describe, expect, it } from "vitest";
import {
  presentInboundAccessRequest,
  resolveInboundAccessRequest,
  transitionApplication,
  type Application,
} from "./career-management";

describe("career management", () => {
  it("files a Work Map access request as a connection opportunity", () => {
    expect(
      presentInboundAccessRequest({
        requesterName: "Alex Rivera",
        requesterEmail: "alex@northstar.example",
        message: "May I review the published map?",
        publicationSlug: "sory-systems",
      }),
    ).toEqual({
      opportunity: {
        kind: "connection",
        title: "Alex Rivera asked to view the Work Map",
        organization: "northstar.example",
        sourceUrl: "sory-systems",
        location: "",
        fitSummary: "May I review the published map?",
      },
      contact: {
        name: "Alex Rivera",
        organization: "northstar.example",
        role: "",
        email: "alex@northstar.example",
        notes: "May I review the published map?",
      },
    });
  });

  it("closes an inbound request when the occupant grants or declines it", () => {
    expect(resolveInboundAccessRequest({ decision: "grant" })).toEqual({
      ok: true,
      value: { requestStatus: "granted", opportunityStatus: "closed" },
    });
    expect(resolveInboundAccessRequest({ decision: "decline" })).toEqual({
      ok: true,
      value: { requestStatus: "declined", opportunityStatus: "closed" },
    });
    expect(resolveInboundAccessRequest({ decision: "ignore" })).toEqual({
      ok: false,
      error: "decision-invalid",
    });
  });

  it("enforces the application state machine", () => {
    const application: Application = {
      id: "application-1",
      occupantId: "local",
      opportunityId: "opportunity-1",
      resumeRevisionId: "revision-1",
      stage: "preparing",
      nextStep: "",
      deadline: null,
      createdAt: "2026-09-19T20:00:00.000Z",
      updatedAt: "2026-09-19T20:00:00.000Z",
    };
    expect(
      transitionApplication(
        application,
        "accepted",
        "2026-09-19T20:01:00.000Z",
      ),
    ).toEqual({ ok: false, error: "transition-invalid" });
    expect(
      transitionApplication(
        application,
        "submitted",
        "2026-09-19T20:01:00.000Z",
      ),
    ).toMatchObject({ ok: true, value: { stage: "submitted" } });
  });
});
