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
  workLog: { findFirst: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { GET } from "./route";

/**
 * The route now expects a `Request` (so it can read URL-aware ambient
 * query params introduced in ADR-0046 follow-up D). All existing tests
 * funnel through this helper; per-test query strings opt into the
 * URL-override branches.
 */
function makeRequest(qs = ""): Request {
  const url = qs
    ? `http://localhost/api/ai/context?${qs}`
    : "http://localhost/api/ai/context";
  return new Request(url);
}

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
  prismaMock.workLog.findFirst.mockResolvedValue(null);
}

describe("GET /api/ai/context — slice shape (ADR-0046 Phase A)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAllToEmpty();
  });

  it("returns `{ slices, systemPrompt }` for a user with no career data", async () => {
    const res = await GET(makeRequest());
    const body = (await res.json()) as ContextResponse;
    expect(Array.isArray(body.slices)).toBe(true);
    expect(typeof body.systemPrompt).toBe("string");
  });

  it("always emits the base slice and marks it non-removable", async () => {
    const res = await GET(makeRequest());
    const body = (await res.json()) as ContextResponse;
    const base = body.slices.find((s) => s.id === "base");
    expect(base).toBeDefined();
    expect(base?.removable).toBe(false);
    expect(base?.prompt).toMatch(/Resumsify AI/);
  });

  it("adds the profile slice only when a profile exists", async () => {
    // Baseline: empty → no profile slice
    const empty = (await (await GET(makeRequest())).json()) as ContextResponse;
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
    const withProfile = (await (await GET(makeRequest())).json()) as ContextResponse;
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

    const body = (await (await GET(makeRequest())).json()) as ContextResponse;
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
    const body = (await (await GET(makeRequest())).json()) as ContextResponse;
    const expected = body.slices.map((s) => s.prompt).join("\n\n");
    expect(body.systemPrompt).toBe(expected);
  });

  it("returns 401 when the user is unauthenticated", async () => {
    const auth = await import("@/lib/auth-utils");
    (auth.getUserId as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("scopes the recency heuristic WorkHistory query by authenticated userId", async () => {
    await GET(makeRequest());

    expect(prismaMock.workHistory.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "test-user-id",
          isActive: true,
        }),
      }),
    );
  });

  it("scopes the recency heuristic WorkLog query by authenticated userId", async () => {
    await GET(makeRequest());

    expect(prismaMock.workLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "test-user-id",
          archivedAt: null,
        }),
      }),
    );
  });
});

interface AmbientShape {
  ambient: {
    activeJob: { type: "job"; id: string; label: string } | null;
    activeWorklog: { type: "worklog"; id: string; label: string } | null;
    activeSkill: { type: "skill"; id: string; label: string } | null;
  };
}

describe("GET /api/ai/context — ambient field (ADR-0046 Phase D.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAllToEmpty();
  });

  it("returns `ambient` with all-null entries when nothing is active", async () => {
    const body = (await (await GET(makeRequest())).json()) as AmbientShape;
    expect(body.ambient).toBeDefined();
    expect(body.ambient.activeJob).toBeNull();
    expect(body.ambient.activeWorklog).toBeNull();
    expect(body.ambient.activeSkill).toBeNull();
  });

  it("returns `ambient.activeJob` from the active WorkHistory row", async () => {
    prismaMock.workHistory.findFirst.mockResolvedValue({
      id: "job-1",
      title: "Senior Dev",
      company: "Acme",
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
    const body = (await (await GET(makeRequest())).json()) as AmbientShape;
    expect(body.ambient.activeJob).toEqual({
      type: "job",
      id: "job-1",
      label: "Senior Dev @ Acme",
    });
  });

  it("falls back to just `company` when WorkHistory has no title", async () => {
    prismaMock.workHistory.findFirst.mockResolvedValue({
      id: "job-2",
      title: null,
      company: "Acme",
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
    const body = (await (await GET(makeRequest())).json()) as AmbientShape;
    expect(body.ambient.activeJob?.label).toBe("Acme");
  });

  it("returns `ambient.activeWorklog` for a recently-updated WorkLog", async () => {
    prismaMock.workLog.findFirst.mockResolvedValue({
      id: "wl-1",
      title: "Sprint planning",
    });
    const body = (await (await GET(makeRequest())).json()) as AmbientShape;
    expect(body.ambient.activeWorklog).toEqual({
      type: "worklog",
      id: "wl-1",
      label: "Sprint planning",
    });
  });
});

/**
 * URL-aware ambient (ADR-0046 follow-up D). The route accepts
 * `?activeWorklogId=...&activeJobId=...` query params and uses them to
 * override the recency heuristic with a userId-scoped lookup of the exact
 * entity the user is viewing. Foreign IDs silently fall back to the
 * heuristic so the URL surface never leaks data.
 */
describe("GET /api/ai/context \u2014 URL-aware ambient (ADR-0046 follow-up D)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAllToEmpty();
  });

  it("overrides activeJob with the URL-specified WorkHistory when found", async () => {
    // Heuristic returns the active row.
    prismaMock.workHistory.findFirst
      .mockResolvedValueOnce({
        id: "job-heuristic",
        title: "Old Role",
        company: "Old Co",
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
      })
      // URL-override call returns the requested row.
      .mockResolvedValueOnce({
        id: "job-url",
        title: "Current Role",
        company: "Current Co",
        department: null,
        location: null,
        workMode: "remote",
        startDate: "2024-06-01",
        salaryAmount: null,
        salaryCurrency: "USD",
        payType: null,
        payRate: null,
        payFrequency: null,
        techStack: null,
      });

    const body = (await (
      await GET(makeRequest("activeJobId=job-url"))
    ).json()) as AmbientShape;

    expect(body.ambient.activeJob).toEqual({
      type: "job",
      id: "job-url",
      label: "Current Role @ Current Co",
    });
  });

  it("overrides activeWorklog with the URL-specified WorkLog when found", async () => {
    prismaMock.workLog.findFirst
      .mockResolvedValueOnce({ id: "wl-heuristic", title: "Yesterday note" })
      .mockResolvedValueOnce({ id: "wl-url", title: "Open right now" });

    const body = (await (
      await GET(makeRequest("activeWorklogId=wl-url"))
    ).json()) as AmbientShape;

    expect(body.ambient.activeWorklog).toEqual({
      type: "worklog",
      id: "wl-url",
      label: "Open right now",
    });
  });

  it("falls back to the heuristic when the URL id belongs to another user", async () => {
    // Heuristic call returns the user's recent worklog. URL-override call
    // returns null (userId-scoped lookup didn't match).
    prismaMock.workLog.findFirst
      .mockResolvedValueOnce({ id: "wl-mine", title: "My recent" })
      .mockResolvedValueOnce(null);

    const body = (await (
      await GET(makeRequest("activeWorklogId=wl-foreign"))
    ).json()) as AmbientShape;

    expect(body.ambient.activeWorklog).toEqual({
      type: "worklog",
      id: "wl-mine",
      label: "My recent",
    });
  });
});

