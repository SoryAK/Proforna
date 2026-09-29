import { describe, expect, it } from "vitest";
import { stagesToward } from "./career-management";
import {
  parseMailFrom,
  planJobMail,
  prepareMailboxConnection,
  pursuitsMatch,
  scheduledAtFromMail,
  type InboundMail,
} from "./mailbox";

const receivedAt = "2026-03-01T15:00:00.000Z";

function mail(overrides: Partial<InboundMail>): InboundMail {
  return {
    providerMessageId: "m1",
    fromName: "Alex Rivera",
    fromEmail: "alex@northstar.example",
    subject: "Hello",
    body: "",
    receivedAt,
    ...overrides,
  };
}

describe("job mail", () => {
  it("accepts a Gmail connection label and rejects an unknown provider", () => {
    expect(
      prepareMailboxConnection({ provider: "gmail", label: "  Work Gmail " }),
    ).toEqual({ ok: true, value: { provider: "gmail", label: "Work Gmail" } });
    expect(prepareMailboxConnection({ provider: "fastmail", label: "Work" })).toEqual({
      ok: false,
      error: "provider-unsupported",
    });
    expect(prepareMailboxConnection({ provider: "gmail", label: " " })).toEqual({
      ok: false,
      error: "label-required",
    });
  });

  it("reads a display name and address from a From header", () => {
    expect(parseMailFrom('"Riley Chen" <riley@northstar.example>')).toEqual({
      name: "Riley Chen",
      email: "riley@northstar.example",
    });
    expect(parseMailFrom("alex@northstar.example")).toEqual({
      name: "alex@northstar.example",
      email: "alex@northstar.example",
    });
  });

  it("plans an application without treating a later interview mention as the interview", () => {
    const plan = planJobMail(
      mail({
        subject: "Thank you for applying to Staff Engineer at Northstar",
        body: "We received your application. We will write if we want to interview.",
      }),
    );
    expect(plan?.category).toBe("application");
    expect(plan?.opportunity).toMatchObject({
      kind: "role",
      title: "Staff Engineer",
      organization: "Northstar",
    });
    expect(plan?.application).toEqual({
      stage: "submitted",
      nextStep: "Confirm this application",
    });
    expect(plan?.interview).toBeNull();
    expect(stagesToward("preparing", "submitted")).toEqual(["submitted"]);
  });

  it("plans an interview with the date named in the message", () => {
    const plan = planJobMail(
      mail({
        providerMessageId: "m-int",
        subject: "Interview invitation: Staff Engineer at Northstar",
        body: "Your interview is on March 4, 2026.",
      }),
    );
    expect(plan?.category).toBe("interview");
    expect(plan?.interview).toMatchObject({
      kind: "interview",
      scheduledAt: "2026-03-04T15:00:00.000Z",
    });
    expect(plan?.application?.stage).toBe("interview");
    expect(stagesToward("preparing", "interview")).toEqual([
      "submitted",
      "interview",
    ]);
  });

  it("plans an offer ahead of interview language in the same message", () => {
    const plan = planJobMail(
      mail({
        subject: "We are pleased to offer you the Staff Engineer role at Northstar",
        body: "This follows your interview. Please respond by April 2, 2026.",
      }),
    );
    expect(plan?.category).toBe("offer");
    expect(plan?.opportunity.title).toBe("Staff Engineer");
    expect(plan?.offer?.summary).toContain("pleased to offer");
    expect(plan?.offer?.decisionDueAt).toBe("2026-04-02T15:00:00.000Z");
    expect(stagesToward("preparing", "offer")).toEqual([
      "submitted",
      "interview",
      "offer",
    ]);
  });

  it("plans recruiter outreach as a connection and a contact", () => {
    const plan = planJobMail(
      mail({
        fromName: "Riley Chen",
        fromEmail: "riley@northstar.example",
        subject: "Came across your profile — Staff Engineer at Northstar",
        body: "I am a recruiter and would like to talk.",
      }),
    );
    expect(plan?.category).toBe("recruiter-outreach");
    expect(plan?.opportunity).toMatchObject({
      kind: "connection",
      title: "Riley Chen reached out about Staff Engineer",
      organization: "Northstar",
    });
    expect(plan?.contact).toMatchObject({
      name: "Riley Chen",
      email: "riley@northstar.example",
      role: "Recruiter",
    });
    expect(plan?.application).toBeNull();
  });

  it("leaves unrelated mail out", () => {
    expect(
      planJobMail(mail({ subject: "Your weekly digest", body: "Three articles." })),
    ).toBeNull();
  });

  it("matches the same pursuit and reads a named date", () => {
    expect(
      pursuitsMatch(
        { kind: "role", title: "Staff Engineer", organization: "Northstar" },
        { kind: " Role ", title: "staff engineer", organization: "northstar" },
      ),
    ).toBe(true);
    expect(scheduledAtFromMail("See you 2026-05-01 09:30", receivedAt)).toBe(
      "2026-05-01T09:30:00.000Z",
    );
  });
});
