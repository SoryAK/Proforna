/**
 * Tests for GET /api/work-logs/[id]/versions/[versionId] — ADR-0017 Phase 8a.
 *
 * Per-version read endpoint. Unlike the list endpoint (which strips
 * contentJson and truncates plainText to 200 chars), this returns the
 * FULL snapshot so the UI's diff modal can render a meaningful
 * side-by-side against current content.
 *
 * Owner-scoped via the parent WorkLog (same 404 for missing-or-foreign).
 */

import { vi } from "vitest";
import { GET } from "@/app/api/work-logs/[id]/versions/[versionId]/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({ getUserId: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workLog: { findFirst: vi.fn() },
    workLogVersion: { findFirst: vi.fn() },
  },
}));

const mockGetUserId        = vi.mocked(getUserId);
const mockWorkLogFindFirst = vi.mocked(prisma.workLog.findFirst);
const mockVersionFindFirst = vi.mocked(prisma.workLogVersion.findFirst);

function makeRequest(
  id: string,
  versionId: string,
): [Request, { params: Promise<{ id: string; versionId: string }> }] {
  const req = new Request(
    `http://localhost/api/work-logs/${id}/versions/${versionId}`,
  );
  return [req, { params: Promise.resolve({ id, versionId }) }];
}

beforeEach(() => vi.resetAllMocks());

describe("GET /api/work-logs/[id]/versions/[versionId]", () => {
  it("401 — unauthenticated", async () => {
    mockGetUserId.mockResolvedValue(null);
    const [req, ctx] = makeRequest("log1", "v1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
  });

  it("404 — work log does not exist for this user", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue(null);
    const [req, ctx] = makeRequest("nope", "v1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
    expect(mockVersionFindFirst).not.toHaveBeenCalled();
  });

  it("404 — version not found or belongs to a different work log", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({ id: "log1" } as any);
    mockVersionFindFirst.mockResolvedValue(null);
    const [req, ctx] = makeRequest("log1", "v-missing");
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });

  it("returns full snapshot (contentJson + plainText + metadata)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({ id: "log1" } as any);
    const created = new Date("2026-06-05T10:00:00Z");
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
    };
    mockVersionFindFirst.mockResolvedValue({
      id: "v1",
      createdAt: created,
      label: "milestone",
      isManual: true,
      contentJson: doc,
      plainText: "hi everyone",
    } as any);

    const [req, ctx] = makeRequest("log1", "v1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("v1");
    expect(body.label).toBe("milestone");
    expect(body.isManual).toBe(true);
    expect(body.contentJson).toEqual(doc);
    expect(body.plainText).toBe("hi everyone");
    expect(body.createdAt).toBe(created.toISOString());
  });

  it("scopes version lookup to (id, workLogId) — no cross-note read", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({ id: "log1" } as any);
    mockVersionFindFirst.mockResolvedValue(null);
    const [req, ctx] = makeRequest("log1", "v-other");
    await GET(req, ctx);
    const where = (mockVersionFindFirst.mock.calls[0][0] as { where: Record<string, string> }).where;
    expect(where.id).toBe("v-other");
    expect(where.workLogId).toBe("log1");
  });
});
