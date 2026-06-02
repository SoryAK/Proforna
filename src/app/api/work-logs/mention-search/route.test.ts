/**
 * Tests for GET /api/work-logs/mention-search
 *
 * Auth: getUserId mock
 * DB:   prisma.jobAsset, skillNode, workHistory, contact mocked
 *
 * Coverage: 401, 400 (missing/invalid type), asset search, asset existence
 *           check (found + not found), skill/company/contact search, meta
 *           formatting edge cases.
 */

import { vi } from "vitest";
import { GET } from "@/app/api/work-logs/mention-search/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    jobAsset:    { findFirst: vi.fn(), findMany: vi.fn() },
    skillNode:   { findFirst: vi.fn(), findMany: vi.fn() },
    workHistory: { findFirst: vi.fn(), findMany: vi.fn() },
    contact:     { findFirst: vi.fn(), findMany: vi.fn() },
  },
}));

const mockGetUserId = vi.mocked(getUserId);

function makeRequest(params: Record<string, string>): Request {
  const url = new URL("http://localhost/api/work-logs/mention-search");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString(), { method: "GET" });
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─────────────────────────────────────────────────────────
describe("GET /api/work-logs/mention-search", () => {

  // ── auth ──────────────────────────────────────────────

  it("401 — unauthenticated request returns Unauthorized", async () => {
    mockGetUserId.mockResolvedValue(null);

    const res = await GET(makeRequest({ type: "asset", q: "pump" }));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
  });

  // ── type validation ───────────────────────────────────

  it("400 — missing type parameter", async () => {
    mockGetUserId.mockResolvedValue("u1");

    const res = await GET(makeRequest({ q: "pump" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid type");
  });

  it("400 — invalid type value returns Invalid type", async () => {
    mockGetUserId.mockResolvedValue("u1");

    const res = await GET(makeRequest({ type: "equipment", q: "pump" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid type");
  });

  // ── asset search ──────────────────────────────────────

  it("returns asset results with id, label, and meta (identifier preferred over customerName)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.jobAsset.findMany).mockResolvedValue([
      { id: "a1", name: "Pump A", identifier: "P-001", customerName: null } as any,
      { id: "a2", name: "Pump B", identifier: null, customerName: "Acme"  } as any,
    ]);

    const res = await GET(makeRequest({ type: "asset", q: "pump" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
    expect(json[0]).toMatchObject({ id: "a1", label: "Pump A", meta: "P-001" });
    expect(json[1]).toMatchObject({ id: "a2", label: "Pump B", meta: "Acme" });
  });

  it("returns asset results without meta when both identifier and customerName are null", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.jobAsset.findMany).mockResolvedValue([
      { id: "a3", name: "Motor C", identifier: null, customerName: null } as any,
    ]);

    const res = await GET(makeRequest({ type: "asset", q: "motor" }));
    const json = await res.json();

    expect(json[0].meta).toBeUndefined();
  });

  // ── asset existence check ─────────────────────────────

  it("returns [{ id, label }] for an asset existence check when found", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.jobAsset.findFirst).mockResolvedValue(
      { id: "a1", name: "Pump A" } as any,
    );

    const res = await GET(makeRequest({ type: "asset", id: "a1" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0]).toMatchObject({ id: "a1", label: "Pump A" });
  });

  it("returns [] for an asset existence check when not found", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.jobAsset.findFirst).mockResolvedValue(null);

    const res = await GET(makeRequest({ type: "asset", id: "missing-id" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  // ── skill search ──────────────────────────────────────

  it("returns skill results with skill type as meta", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.skillNode.findMany).mockResolvedValue([
      { id: "s1", name: "React", type: "technical" } as any,
    ]);

    const res = await GET(makeRequest({ type: "skill", q: "react" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json[0]).toMatchObject({ id: "s1", label: "React", meta: "technical" });
  });

  it("returns [] for skill existence check when not found", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.skillNode.findFirst).mockResolvedValue(null);

    const res = await GET(makeRequest({ type: "skill", id: "no-such-skill" }));

    expect(await res.json()).toEqual([]);
  });

  // ── company search ────────────────────────────────────

  it("returns company results derived from workHistory rows", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.workHistory.findMany).mockResolvedValue([
      { id: "wh1", company: "Acme Corp", title: "Engineer" } as any,
    ]);

    const res = await GET(makeRequest({ type: "company", q: "acme" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json[0]).toMatchObject({ id: "wh1", label: "Acme Corp", meta: "Engineer" });
  });

  it("omits meta when workHistory title is null", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.workHistory.findMany).mockResolvedValue([
      { id: "wh2", company: "Beta Inc", title: null } as any,
    ]);

    const res = await GET(makeRequest({ type: "company", q: "beta" }));
    const json = await res.json();

    expect(json[0].meta).toBeUndefined();
  });

  // ── contact search ────────────────────────────────────

  it("returns contact results with 'role · company' as meta", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.contact.findMany).mockResolvedValue([
      { id: "co1", name: "Jane Doe", role: "Manager", company: "Acme Corp" } as any,
    ]);

    const res = await GET(makeRequest({ type: "contact", q: "jane" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json[0]).toMatchObject({ id: "co1", label: "Jane Doe", meta: "Manager · Acme Corp" });
  });

  it("uses only non-null parts for contact meta", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.contact.findMany).mockResolvedValue([
      { id: "co2", name: "John", role: null, company: "Beta Inc" } as any,
    ]);

    const res = await GET(makeRequest({ type: "contact", q: "john" }));
    const json = await res.json();

    expect(json[0].meta).toBe("Beta Inc");
  });

  it("omits meta entirely when contact has no role or company", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.contact.findMany).mockResolvedValue([
      { id: "co3", name: "Ghost", role: null, company: null } as any,
    ]);

    const res = await GET(makeRequest({ type: "contact", q: "ghost" }));
    const json = await res.json();

    expect(json[0].meta).toBeUndefined();
  });
});
