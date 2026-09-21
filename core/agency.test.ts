import { describe, expect, it } from "vitest";
import { parseExtractedWorklogFacts, parseSuggestedReply, planAgentRun } from "./agency";

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

  it("plans a local extract-facts run", () => {
    expect(
      planAgentRun({
        id: "run-7",
        occupantId: "local",
        purpose: "extract-facts",
        scope: { type: "worklog", id: "entry-1" },
        grant: { remoteModel: false },
        hosting: "local",
        now,
      }),
    ).toMatchObject({
      ok: true,
      value: {
        purpose: "extract-facts",
        status: "started",
      },
    });
  });

  it("parses achievements and skills from model JSON", () => {
    expect(
      parseExtractedWorklogFacts(
        '```json\n{"achievements":[{"statement":"Led the migration of 18 systems without service loss.","confidence":"supported"}],"skills":[{"name":"Incident leadership","confidence":"candidate"}]}\n```',
        { id: "entry-1", roleId: "role-1" },
      ),
    ).toEqual([
      {
        factType: "achievement",
        subjectId: "role-1",
        statement: "Led the migration of 18 systems without service loss.",
        evidenceRef: "entry-1",
        confidence: "supported",
      },
      {
        factType: "skill",
        subjectId: "role-1",
        statement: "Incident leadership",
        evidenceRef: "entry-1",
        confidence: "candidate",
      },
    ]);
    expect(
      parseExtractedWorklogFacts("not json", {
        id: "entry-1",
        roleId: null,
      }),
    ).toEqual([]);
  });

  it("plans a local suggest-reply run", () => {
    expect(
      planAgentRun({
        id: "run-8",
        occupantId: "local",
        purpose: "suggest-reply",
        scope: { type: "contact", id: "contact-1" },
        grant: { remoteModel: false },
        hosting: "local",
        now,
      }),
    ).toMatchObject({
      ok: true,
      value: {
        purpose: "suggest-reply",
        scope: { type: "contact", id: "contact-1" },
        status: "started",
      },
    });
  });

  it("parses a suggested reply body from model JSON", () => {
    expect(
      parseSuggestedReply('```json\n{"body":"Thursday works."}\n```'),
    ).toBe("Thursday works.");
    expect(parseSuggestedReply("not json")).toBe("");
  });

  it("plans a local Home command run", () => {
    expect(
      planAgentRun({
        id: "run-9",
        occupantId: "local",
        purpose: "command",
        scope: { type: "home" },
        grant: { remoteModel: false },
        hosting: "local",
        now,
      }),
    ).toMatchObject({
      ok: true,
      value: {
        purpose: "command",
        scope: { type: "home" },
        status: "started",
      },
    });
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
