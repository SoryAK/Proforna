import { describe, expect, it } from "vitest";
import { presentOccupantNotices } from "./notices";

describe("presentOccupantNotices", () => {
  it("lists pending access requests and proposed change sets, newest first", () => {
    expect(
      presentOccupantNotices({
        accessRequests: [
          {
            id: "req-1",
            requesterName: "Alex Rivera",
            requesterEmail: "alex@example.com",
            message: "May I review the published map?",
            createdAt: "2026-09-19T12:00:00.000Z",
          },
          {
            id: "req-2",
            requesterName: "Jordan Lee",
            requesterEmail: "jordan@example.com",
            message: "   ",
            createdAt: "2026-09-19T14:00:00.000Z",
          },
        ],
        proposedChangeSets: [
          {
            id: "change-1",
            purpose: "Promote measured recovery result",
            createdAt: "2026-09-19T13:00:00.000Z",
          },
        ],
      }),
    ).toEqual([
      {
        id: "req-2",
        kind: "access-request",
        title: "Jordan Lee asked to view the Work Map",
        detail: "jordan@example.com",
        href: "opportunities",
        createdAt: "2026-09-19T14:00:00.000Z",
      },
      {
        id: "change-1",
        kind: "proposed-change",
        title: "Promote measured recovery result",
        detail: "Waiting for approval",
        href: "worklog",
        createdAt: "2026-09-19T13:00:00.000Z",
      },
      {
        id: "req-1",
        kind: "access-request",
        title: "Alex Rivera asked to view the Work Map",
        detail: "May I review the published map?",
        href: "opportunities",
        createdAt: "2026-09-19T12:00:00.000Z",
      },
    ]);
  });
});
