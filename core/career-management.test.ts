import { describe, expect, it } from "vitest";
import {
  transitionApplication,
  type Application,
} from "./career-management";

describe("career management", () => {
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
