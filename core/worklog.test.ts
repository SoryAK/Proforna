import { describe, expect, it } from "vitest";
import {
  prepareWorklogEntry,
  planWorklogFactChangeSet,
  proposeFactsFromWorklog,
} from "./worklog";

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

  it("plans one Change Set for every fact from an entry", () => {
    expect(
      planWorklogFactChangeSet({
        id: "change-1",
        occupantId: "local",
        entryTitle: "Atlas migration",
        evidenceId: "ev-1",
        createdAt: "2026-09-19T20:01:00.000Z",
        proposals: [
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
        ],
      }),
    ).toEqual({
      id: "change-1",
      occupantId: "local",
      purpose: "Promote facts from Atlas migration",
      destination: "worklog",
      createdAt: "2026-09-19T20:01:00.000Z",
      operations: [
        {
          action: "create",
          entityType: "career-fact",
          values: {
            id: "change-1:fact:0",
            factType: "achievement",
            subjectId: "role-1",
            value: {
              statement: "Led the migration of 18 systems without service loss.",
              confidence: "supported",
            },
            evidenceIds: ["ev-1"],
          },
        },
        {
          action: "create",
          entityType: "career-fact",
          values: {
            id: "change-1:fact:1",
            factType: "skill",
            subjectId: "role-1",
            value: {
              name: "Incident leadership",
              confidence: "candidate",
            },
            evidenceIds: ["ev-1"],
          },
        },
      ],
    });
  });
});
