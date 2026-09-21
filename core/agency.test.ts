import { describe, expect, it } from "vitest";
import { planAgentRun } from "./agency";

describe("Agency.run", () => {
  const now = "2026-09-21T14:00:00.000Z";

  it("plans a local inspect run without a remote-model grant", () => {
    expect(
      planAgentRun({
        id: "run-1",
        occupantId: "local",
        purpose: "inspect",
        scope: { type: "worklog", id: "entry-1" },
        grant: { remoteModel: false },
        hosting: "local",
        now,
      }),
    ).toEqual({
      ok: true,
      value: {
        id: "run-1",
        occupantId: "local",
        purpose: "inspect",
        scope: { type: "worklog", id: "entry-1" },
        grant: { remoteModel: false, expiresAt: null },
        status: "started",
        createdAt: now,
        completedAt: null,
      },
    });
  });

  it("blocks a cloud model unless the occupant grants remote use", () => {
    expect(
      planAgentRun({
        id: "run-2",
        occupantId: "local",
        purpose: "inspect",
        scope: { type: "worklog", id: "entry-1" },
        grant: { remoteModel: false },
        hosting: "cloud",
        now,
      }),
    ).toEqual({ ok: false, error: "remote-model-grant-required" });
  });

  it("rejects a missing model, unknown purpose, or incomplete scope", () => {
    expect(
      planAgentRun({
        id: "run-3",
        occupantId: "local",
        purpose: "inspect",
        scope: { type: "worklog", id: "entry-1" },
        grant: { remoteModel: true },
        hosting: null,
        now,
      }),
    ).toEqual({ ok: false, error: "model-missing" });
    expect(
      planAgentRun({
        id: "run-4",
        occupantId: "local",
        purpose: "scout",
        scope: { type: "worklog", id: "entry-1" },
        grant: { remoteModel: false },
        hosting: "local",
        now,
      }),
    ).toEqual({ ok: false, error: "purpose-invalid" });
    expect(
      planAgentRun({
        id: "run-5",
        occupantId: "local",
        purpose: "inspect",
        scope: { type: "worklog" },
        grant: { remoteModel: false },
        hosting: "local",
        now,
      }),
    ).toEqual({ ok: false, error: "scope-required" });
  });

  it("rejects an expired remote-model grant", () => {
    expect(
      planAgentRun({
        id: "run-6",
        occupantId: "local",
        purpose: "inspect",
        scope: { type: "worklog", id: "entry-1" },
        grant: { remoteModel: true, expiresAt: "2026-09-21T13:00:00.000Z" },
        hosting: "cloud",
        now,
      }),
    ).toEqual({ ok: false, error: "grant-expired" });
  });
});
