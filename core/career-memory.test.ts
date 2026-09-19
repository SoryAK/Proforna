import { describe, expect, it } from "vitest";
import { commitCareerFactChanges, type CareerMemoryState } from "./career-memory";
import { createApproval, type ChangeSet } from "./governance";

describe("career memory", () => {
  it("requires approved, evidence-backed fact changes", async () => {
    const state: CareerMemoryState = {
      evidence: [
        {
          id: "evidence-1",
          occupantId: "local",
          sourceType: "worklog",
          sourceRef: "worklog-1",
          title: "Migration retrospective",
          capturedAt: "2026-09-19T20:00:00.000Z",
          checksum: "abc",
          sensitivity: "private",
          content: { text: "Moved 18 systems without service loss." },
        },
      ],
      facts: [],
      audit: [],
    };
    const changeSet: ChangeSet = {
      id: "change-1",
      occupantId: "local",
      purpose: "Promote verified migration result",
      destination: "career-memory",
      operations: [
        {
          action: "create",
          entityType: "career-fact",
          values: {
            id: "fact-1",
            factType: "achievement",
            subjectId: "role-1",
            value: { statement: "Migrated 18 systems without service loss." },
            evidenceIds: ["evidence-1"],
          },
        },
      ],
      createdAt: "2026-09-19T20:01:00.000Z",
    };

    await expect(
      commitCareerFactChanges(
        state,
        changeSet,
        null,
        "2026-09-19T20:02:00.000Z",
      ),
    ).resolves.toEqual({ ok: false, error: "approval-required" });

    const approval = await createApproval(changeSet, {
      id: "approval-1",
      approvedBy: "local",
      approvedAt: "2026-09-19T20:01:30.000Z",
    });
    const committed = await commitCareerFactChanges(
      state,
      changeSet,
      approval,
      "2026-09-19T20:02:00.000Z",
    );
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    expect(committed.committed[0]).toMatchObject({
      id: "fact-1",
      status: "canonical",
      version: 1,
    });
    expect(committed.value.audit[0]).toMatchObject({
      eventType: "fact-created",
      approvalId: "approval-1",
    });
  });
});
