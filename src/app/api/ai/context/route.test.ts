/**
 * Hermetic coverage for the context route's slice contract introduced by
 * ADR-0046 Phase A.
 *
 * Scope:
 *  - The response is shaped as `{ slices, systemPrompt }`.
 *  - The base slice is always emitted and is `removable: false`.
 *  - Conditional slices appear when their data source has rows.
 *  - `systemPrompt` is the concatenation of every slice's `prompt`
 *    (back-compat with the pre-Phase-A consumer shape).
 *
 * Intentionally NOT covered here:
 *  - The exact markdown body of each slice — that is a render-time concern.
 *  - Prisma query options — those are owned by the data layer.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn().mockResolvedValue("test-user-id"),
}));

// `vi.mock` factories are hoisted to the top of the file, so the mock object
// must live in a `vi.hoisted()` block to be reachable at hoist time. See
// https://vitest.dev/api/vi.html#vi-hoisted
const prismaMock = vi.hoisted(() => ({
  userProfile: { findFirst: vi.fn() },
  workHistory: { findFirst: vi.fn() },
  jobApplication: { findMany: vi.fn() },
  skill: { findMany: vi.fn() },
  careerGoal: { findMany: vi.fn() },
  certification: { findMany: vi.fn() },
  interview: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { GET } from "./route";

interface ContextResponse {
  slices: Array<{ id: string; label: string; prompt: string; removable: boolean }>;
  systemPrompt: string;
}

function resetAllToEmpty() {
  prismaMock.userProfile.findFirst.mockResolvedValue(null);
  prismaMock.workHistory.findFirst.mockResolvedValue(null);
  prismaMock.jobApplication.findMany.mockResolvedValue([]);
  prismaMock.skill.findMany.mockResolvedValue([]);
  prismaMock.careerGoal.findMany.mockResolvedValue([]);
  prismaMock.certification.findMany.mockResolvedValue([]);
  prismaMock.interview.findMany.mockResolvedValue([]);
}

describe("GET /api/ai/context — slice shape (ADR-0046 Phase A)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAllToEmpty();
  });

  it("returns `{ slices, systemPrompt }` for a user with no career data", async () => {
    const res = await GET();
    const body = (await res.json()) as ContextResponse;
    expect(Array.isArray(body.slices)).toBe(true);
    expect(typeof body.systemPrompt).toBe("string");
  });

  it("always emits the base slice and marks it non-removable", async () => {
    const res = await GET();
    const body = (await res.json()) as ContextResponse;
    const base = body.slices.find((s) => s.id === "base");
    expect(base).toBeDefined();
    expect(base?.removable).toBe(false);
    expect(base?.prompt).toMatch(/Resumsify AI/);
  });

  it("adds the profile slice only when a profile exists", async () => {
    // Baseline: empty → no profile slice
    const empty = (await (await GET()).json()) as ContextResponse;
    expect(empty.slices.some((s) => s.id === "profile")).toBe(false);

    // With profile → profile slice appears, removable
    prismaMock.userProfile.findFirst.mockResolvedValue({
      fullName: "Test User",
      headline: "Engineer",
      city: null,
      state: null,
      availability: null,
      preferredRoles: null,
      targetSalaryMin: null,
      targetSalaryMax: null,
      currency: "USD",
      bio: null,
    });
    const withProfile = (await (await GET()).json()) as ContextResponse;
    const profile = withProfile.slices.find((s) => s.id === "profile");
    expect(profile).toBeDefined();
    expect(profile?.removable).toBe(true);
    expect(profile?.prompt).toMatch(/Test User/);
  });

  it("emits every slice marked removable when its underlying data is present", async () => {
    prismaMock.userProfile.findFirst.mockResolvedValue({
      fullName: "U",
      headline: null,
      city: null,
      state: null,
      availability: null,
      preferredRoles: null,
      targetSalaryMin: null,
      targetSalaryMax: null,
      currency: "USD",
      bio: null,
    });
    prismaMock.workHistory.findFirst.mockResolvedValue({
      title: "Dev",
      company: "Co",
      department: null,
      location: null,
      workMode: "remote",
      startDate: "2024-01-01",
      salaryAmount: null,
      salaryCurrency: "USD",
      payType: null,
      payRate: null,
      payFrequency: null,
      techStack: null,
    });
    prismaMock.skill.findMany.mockResolvedValue([
      { name: "TypeScript", category: "language", proficiency: 5 },
    ]);
    prismaMock.jobApplication.findMany.mockResolvedValue([
      { company: "X", role: "Dev", status: "applied", appliedDate: new Date() },
    ]);
    prismaMock.careerGoal.findMany.mockResolvedValue([
      { title: "Goal", priority: "high", status: "active", targetDate: null },
    ]);
    prismaMock.certification.findMany.mockResolvedValue([
      { name: "Cert", issuer: "Issuer", expiryDate: null },
    ]);
    prismaMock.interview.findMany.mockResolvedValue([
      {
        type: "technical",
        scheduledAt: new Date("2099-01-01"),
        jobApplication: { company: "X", role: "Dev" },
      },
    ]);

    const body = (await (await GET()).json()) as ContextResponse;
    const ids = body.slices.map((s) => s.id);
    expect(ids).toEqual([
      "base",
      "profile",
      "position",
      "skills",
      "applications",
      "goals",
      "certifications",
      "interviews",
    ]);
    for (const s of body.slices) {
      expect(s.removable).toBe(s.id !== "base");
    }
  });

  it("`systemPrompt` is the concatenation of every slice's prompt (back-compat)", async () => {
    prismaMock.userProfile.findFirst.mockResolvedValue({
      fullName: "U",
      headline: null,
      city: null,
      state: null,
      availability: null,
      preferredRoles: null,
      targetSalaryMin: null,
      targetSalaryMax: null,
      currency: "USD",
      bio: null,
    });
    const body = (await (await GET()).json()) as ContextResponse;
    const expected = body.slices.map((s) => s.prompt).join("\n\n");
    expect(body.systemPrompt).toBe(expected);
  });

  it("returns 401 when the user is unauthenticated", async () => {
    const auth = await import("@/lib/auth-utils");
    (auth.getUserId as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
