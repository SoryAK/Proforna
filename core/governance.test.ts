import { describe, expect, it } from "vitest";
import {
  authorizeChangeSet,
  createApproval,
  hashChangeSet,
  type ChangeSet,
} from "./governance";

const changeSet: ChangeSet = {
  id: "change-1",
  occupantId: "local",
  purpose: "Record an achievement",
  destination: "career-memory",
  operations: [
    {
      action: "create",
      entityType: "achievement",
      values: { statement: "Reduced recovery time", metric: 11 },
    },
  ],
  createdAt: "2026-09-19T20:00:00.000Z",
};

describe("governance", () => {
  it("hashes equivalent objects deterministically", async () => {
    const reordered: ChangeSet = {
      ...changeSet,
      operations: [
        {
          values: { metric: 11, statement: "Reduced recovery time" },
          entityType: "achievement",
          action: "create",
        },
      ],
    };
    expect(await hashChangeSet(reordered)).toBe(await hashChangeSet(changeSet));
  });

  it("binds approval to exact content and destination", async () => {
    const approval = await createApproval(changeSet, {
      id: "approval-1",
      approvedBy: "local",
      approvedAt: "2026-09-19T20:01:00.000Z",
    });
    await expect(
      authorizeChangeSet(changeSet, approval, "2026-09-19T20:02:00.000Z"),
    ).resolves.toEqual({ ok: true });

    await expect(
      authorizeChangeSet(
        {
          ...changeSet,
          operations: [
            {
              ...changeSet.operations[0],
              values: { statement: "Invented replacement" },
            },
          ],
        },
        approval,
        "2026-09-19T20:02:00.000Z",
      ),
    ).resolves.toEqual({ ok: false, error: "approval-content" });
  });
});
