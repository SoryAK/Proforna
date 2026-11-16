import { describe, expect, it } from "vitest";
import {
  planContactSubmission,
  presentInboundAccessRequest,
  planOpportunityNetworkPromotion,
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

  it("files a contact request in the opportunity inbox", () => {
    const planned = planContactSubmission({
      firstName: "Alex",
      lastName: "Rivera",
      email: "alex@northstar.example",
      company: "Northstar",
      jobTitle: "Recruiter",
      phone: "555-0100",
      jobs: true,
      networks: false,
      jobName: "Plant technician",
      jobRole: "Technician",
      jobCompany: "Giants Direct",
      jobLocation: "Allentown",
      jobSalary: "80-90k",
      jobLink: "https://example.test/role",
      jobPost: "Second shift.",
      meetWhen: "2026-11-18 10:00 AM",
    });
    expect(planned).toMatchObject({
      ok: true,
      value: {
        kind: "role",
        title: "Technician",
        organization: "Giants Direct",
        sourceUrl: "https://example.test/role",
        location: "Allentown",
      },
    });
    if (!planned.ok) return;
    expect(planned.value.fitSummary).toContain("Name: Alex Rivera");
    expect(planned.value.fitSummary).toContain("alex@northstar.example");
    expect(planned.value.fitSummary).toContain("Meet: 2026-11-18 10:00 AM");
  });

  it("leaves job details off a connection request", () => {
    const planned = planContactSubmission({
      firstName: "Alex",
      lastName: "Rivera",
      email: "alex@northstar.example",
      company: "Northstar",
      jobTitle: "Recruiter",
      phone: "",
      jobs: false,
      networks: true,
      jobName: "Plant technician",
      jobRole: "Technician",
      jobCompany: "Giants Direct",
      jobLocation: "Allentown",
      jobSalary: "80-90k",
      jobLink: "https://example.test/role",
      jobPost: "Second shift.",
      meetWhen: "2026-11-18 10:00 AM",
    });
    expect(planned).toMatchObject({
      ok: true,
      value: {
        kind: "connection",
        title: "Alex Rivera asked to connect",
        organization: "Northstar",
        sourceUrl: "",
        location: "",
      },
    });
    if (!planned.ok) return;
    expect(planned.value.fitSummary).toContain("Name: Alex Rivera");
    expect(planned.value.fitSummary).not.toContain("Second shift");
    expect(planned.value.fitSummary).not.toContain("Salary:");
    expect(planned.value.fitSummary).not.toContain("Meet:");
    expect(planned.value.fitSummary).not.toContain("example.test");
  });

  it("promotes only a connection Opportunity into My Network", () => {
    expect(planOpportunityNetworkPromotion({ kind: "connection" })).toEqual({
      ok: true,
      value: { status: "closed" },
    });
    expect(planOpportunityNetworkPromotion({ kind: "role" })).toEqual({
      ok: false,
      error: "kind-invalid",
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
