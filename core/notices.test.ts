import { describe, expect, it } from "vitest";
import {
  noticeHrefForDestination,
  presentOccupantNotices,
} from "./notices";

describe("noticeHrefForDestination", () => {
  it("opens the page that can review that Change Set", () => {
    expect(noticeHrefForDestination("career-memory")).toBe("worklog");
    expect(noticeHrefForDestination("worklog")).toBe("worklog");
    expect(noticeHrefForDestination("work-map:publication-settings")).toBe(
      "history",
    );
    expect(noticeHrefForDestination("relay:sory-systems")).toBe("history");
    expect(noticeHrefForDestination("application:app-1")).toBe("opportunities");
    expect(noticeHrefForDestination("recruiter@example.com")).toBe("network");
    expect(noticeHrefForDestination("contact:alex")).toBe("network");
    expect(noticeHrefForDestination("resume-studio")).toBe("resumes");
  });
});

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
            destination: "career-memory",
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

  it("points a publication Change Set at Career History", () => {
    expect(
      presentOccupantNotices({
        accessRequests: [],
        proposedChangeSets: [
          {
            id: "change-2",
            purpose: "Update Work Map publication settings",
            destination: "work-map:publication-settings",
            createdAt: "2026-09-21T12:00:00.000Z",
          },
        ],
      }),
    ).toEqual([
      {
        id: "change-2",
        kind: "proposed-change",
        title: "Update Work Map publication settings",
        detail: "Waiting for approval",
        href: "history",
        createdAt: "2026-09-21T12:00:00.000Z",
      },
    ]);
  });
});
