import { describe, expect, it } from "vitest";
import { prepareWorklogEntry, proposeFactsFromWorklog } from "./worklog";

describe("worklog", () => {
  it("extracts evidence-linked achievement and skill proposals", () => {
    const prepared = prepareWorklogEntry({
      id: "entry-1",
      occupantId: "local",
      occurredOn: "2026-09-19",
      title: "Atlas migration",
      content:
        "Led the migration of 18 systems without service loss. Discussed next quarter priorities.",
      roleId: "role-1",
      project: "Atlas",
      tags: ["migration", "skill:Incident leadership"],
      createdAt: "2026-09-19T20:00:00.000Z",
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(proposeFactsFromWorklog(prepared.value)).toEqual([
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
  });
});
