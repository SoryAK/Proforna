import { describe, expect, it } from "vitest";
import {
  assertClaimsTraceable,
  buildResumeRevision,
  type ResumeVariant,
} from "./resume-studio";
import type { CareerFactVersion } from "./career-memory";

describe("resume studio", () => {
  it("pins every generated claim to an approved fact version and evidence", () => {
    const variant: ResumeVariant = {
      id: "variant-1",
      occupantId: "local",
      name: "Principal systems",
      targetRole: "Principal Systems Engineer",
      audience: "Infrastructure leaders",
      intent: "Lead with reliability",
      selectedFactIds: ["identity-1", "role-1", "achievement-1", "skill-1"],
      createdAt: "2026-09-19T20:00:00.000Z",
    };
    const fact = (
      id: string,
      factType: CareerFactVersion["factType"],
      value: Record<string, unknown>,
    ): CareerFactVersion => ({
      id,
      occupantId: "local",
      factType,
      subjectId: factType === "achievement" ? "role-1" : id,
      value,
      evidenceIds: [`evidence-${id}`],
      sensitivity: "private",
      version: 1,
      status: "canonical",
      supersedesId: null,
      createdAt: "2026-09-19T20:00:00.000Z",
    });
    const result = buildResumeRevision({
      id: "revision-1",
      variant,
      revisionNumber: 1,
      facts: [
        fact("identity-1", "identity", { full_name: "Sory Kaba" }),
        fact("role-1", "role", {
          title: "Lead Systems Engineer",
          company: "Acme",
          start_date: "2024",
          is_current: 1,
        }),
        fact("achievement-1", "achievement", {
          statement: "Cut recovery from 42 to 11 minutes.",
        }),
        fact("skill-1", "skill", { name: "Incident leadership" }),
      ],
      createdAt: "2026-09-19T20:10:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pinnedFacts).toHaveLength(4);
    expect(assertClaimsTraceable(result.value)).toEqual({ ok: true });
  });
});
