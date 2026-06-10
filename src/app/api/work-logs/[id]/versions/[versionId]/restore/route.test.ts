/**
 * Tests for POST /api/work-logs/[id]/versions/[versionId]/restore — ADR-0017 Phase 6.
 *
 * Coverage:
 *  - 401 unauthenticated
 *  - 404 when work log not found (ownership)
 *  - 404 when version not found OR belongs to a different work log
 *  - Restore writes contentJson + content from the snapshot onto the WorkLog
 *  - Pre-restore snapshot of current state is created with isManual + auto-label
 *  - Pre-restore + workLog.update happen atomically via $transaction
 *  - Skips pre-restore snapshot when current contentJson is null (legacy/empty notes)
 *  - Manual-cap retention runs after the restore (best-effort)
 *  - Returns 200 with the updated WorkLog
 */

import { vi } from "vitest";
import { POST } from "@/app/api/work-logs/[id]/versions/[versionId]/restore/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workLog: {
      findFirst: vi.fn(),
      update:    vi.fn(),
    },
    workLogVersion: {
      findFirst:  vi.fn(),
      findMany:   vi.fn(),
      create:     vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const mockGetUserId         = vi.mocked(getUserId);
const mockWorkLogFindFirst  = vi.mocked(prisma.workLog.findFirst);
const mockWorkLogUpdate     = vi.mocked(prisma.workLog.update);
const mockVersionFindFirst  = vi.mocked(prisma.workLogVersion.findFirst);
const mockVersionFindMany   = vi.mocked(prisma.workLogVersion.findMany);
const mockVersionCreate     = vi.mocked(prisma.workLogVersion.create);
const mockVersionDeleteMany = vi.mocked(prisma.workLogVersion.deleteMany);
const mockTransaction       = vi.mocked(prisma.$transaction);

function makeRequest(
  id: string,
  versionId: string,
): [Request, { params: Promise<{ id: string; versionId: string }> }] {
  const req = new Request(
    `http://localhost/api/work-logs/${id}/versions/${versionId}/restore`,
    { method: "POST" },
  );
  return [req, { params: Promise.resolve({ id, versionId }) }];
}

const snapshotDoc = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "snapshot body" }] }],
};
const currentDoc = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "current body" }] }],
};

beforeEach(() => {
  vi.resetAllMocks();
  // Default: $transaction runs each call sequentially against our mocks.
  // Tests can override to assert atomicity.
  mockTransaction.mockImplementation(async (ops: any) => {
    if (Array.isArray(ops)) return Promise.all(ops);
    if (typeof ops === "function") return ops(prisma);
    return ops;
  });
});

describe("POST /api/work-logs/[id]/versions/[versionId]/restore", () => {
  it("401 — unauthenticated", async () => {
    mockGetUserId.mockResolvedValue(null);
    const [req, ctx] = makeRequest("log1", "v1");
    const res = await POST(req, ctx);
    expect(res.status).toBe(401);
  });

  it("404 — work log does not exist for this user", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue(null);
    const [req, ctx] = makeRequest("nope", "v1");
    const res = await POST(req, ctx);
    expect(res.status).toBe(404);
    expect(mockVersionFindFirst).not.toHaveBeenCalled();
  });

  it("404 — target version does not exist", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({
      id: "log1",
      contentJson: currentDoc,
      content: "current body",
    } as any);
    mockVersionFindFirst.mockResolvedValue(null);
    const [req, ctx] = makeRequest("log1", "v-missing");
    const res = await POST(req, ctx);
    expect(res.status).toBe(404);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("404 — target version belongs to a different work log (no cross-note restore)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({
      id: "log1",
      contentJson: currentDoc,
      content: "current body",
    } as any);
    // findFirst is scoped { id, workLogId } in the route — wrong workLogId → null.
    mockVersionFindFirst.mockResolvedValue(null);
    const [req, ctx] = makeRequest("log1", "v-of-other-note");
    const res = await POST(req, ctx);
    expect(res.status).toBe(404);
  });

  it("writes the snapshot's contentJson + plainText onto WorkLog", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({
      id: "log1",
      contentJson: currentDoc,
      content: "current body",
    } as any);
    mockVersionFindFirst.mockResolvedValue({
      id: "v1",
      workLogId: "log1",
      contentJson: snapshotDoc,
      plainText: "snapshot body",
      createdAt: new Date("2026-06-01T10:00:00Z"),
    } as any);
    mockWorkLogUpdate.mockResolvedValue({
      id: "log1",
      contentJson: snapshotDoc,
      content: "snapshot body",
    } as any);
    mockVersionFindMany.mockResolvedValue([] as any);

    const [req, ctx] = makeRequest("log1", "v1");
    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
    expect(mockWorkLogUpdate).toHaveBeenCalledTimes(1);
    const upd = mockWorkLogUpdate.mock.calls[0][0] as {
      data: { contentJson?: unknown; content?: string };
    };
    expect(upd.data.contentJson).toEqual(snapshotDoc);
    expect(upd.data.content).toBe("snapshot body");
  });

  it("creates a pre-restore snapshot of current state (isManual + auto label)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({
      id: "log1",
      contentJson: currentDoc,
      content: "current body",
    } as any);
    mockVersionFindFirst.mockResolvedValue({
      id: "v1",
      workLogId: "log1",
      contentJson: snapshotDoc,
      plainText: "snapshot body",
      createdAt: new Date("2026-06-01T10:00:00Z"),
    } as any);
    mockWorkLogUpdate.mockResolvedValue({ id: "log1" } as any);
    mockVersionFindMany.mockResolvedValue([] as any);

    const [req, ctx] = makeRequest("log1", "v1");
    await POST(req, ctx);

    expect(mockVersionCreate).toHaveBeenCalledTimes(1);
    const arg = mockVersionCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(arg.data.workLogId).toBe("log1");
    expect(arg.data.userId).toBe("u1");
    expect(arg.data.isManual).toBe(true);
    expect(arg.data.contentJson).toEqual(currentDoc); // current state, not the snapshot
    expect(arg.data.plainText).toBe("current body");
    expect(String(arg.data.label)).toMatch(/^Before restore from /);
    // Label should embed the target snapshot's ISO timestamp for traceability.
    expect(String(arg.data.label)).toContain("2026-06-01");
  });

  it("runs the pre-restore snapshot + workLog.update inside a single $transaction", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({
      id: "log1",
      contentJson: currentDoc,
      content: "current body",
    } as any);
    mockVersionFindFirst.mockResolvedValue({
      id: "v1",
      workLogId: "log1",
      contentJson: snapshotDoc,
      plainText: "snapshot body",
      createdAt: new Date("2026-06-01T10:00:00Z"),
    } as any);
    mockWorkLogUpdate.mockResolvedValue({ id: "log1" } as any);
    mockVersionFindMany.mockResolvedValue([] as any);

    const [req, ctx] = makeRequest("log1", "v1");
    await POST(req, ctx);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("skips pre-restore snapshot when current contentJson is null (legacy empty note)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({
      id: "log1",
      contentJson: null,
      content: "",
    } as any);
    mockVersionFindFirst.mockResolvedValue({
      id: "v1",
      workLogId: "log1",
      contentJson: snapshotDoc,
      plainText: "snapshot body",
      createdAt: new Date("2026-06-01T10:00:00Z"),
    } as any);
    mockWorkLogUpdate.mockResolvedValue({ id: "log1" } as any);
    mockVersionFindMany.mockResolvedValue([] as any);

    const [req, ctx] = makeRequest("log1", "v1");
    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
    expect(mockVersionCreate).not.toHaveBeenCalled();
    expect(mockWorkLogUpdate).toHaveBeenCalledTimes(1); // restore still happens
  });

  it("runs manual-cap retention after restore (best-effort, outside transaction)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({
      id: "log1",
      contentJson: currentDoc,
      content: "current body",
    } as any);
    mockVersionFindFirst.mockResolvedValue({
      id: "v1",
      workLogId: "log1",
      contentJson: snapshotDoc,
      plainText: "snapshot body",
      createdAt: new Date("2026-06-01T10:00:00Z"),
    } as any);
    mockWorkLogUpdate.mockResolvedValue({ id: "log1" } as any);

    const NOW = Date.now();
    // 52 manual snapshots after the pre-restore lands → 2 must be evicted.
    mockVersionFindMany.mockResolvedValue(
      Array.from({ length: 52 }, (_, i) => ({
        id: `m${String(i).padStart(3, "0")}`,
        createdAt: new Date(NOW - i * 60_000),
        isManual: true,
      })) as any,
    );
    mockVersionDeleteMany.mockResolvedValue({ count: 2 } as any);

    const [req, ctx] = makeRequest("log1", "v1");
    await POST(req, ctx);

    expect(mockVersionDeleteMany).toHaveBeenCalledTimes(1);
    const arg = mockVersionDeleteMany.mock.calls[0][0] as {
      where: { id: { in: string[] } };
    };
    expect(arg.where.id.in).toHaveLength(2);
  });

  it("retention failure does NOT undo the restore (best-effort)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({
      id: "log1",
      contentJson: currentDoc,
      content: "current body",
    } as any);
    mockVersionFindFirst.mockResolvedValue({
      id: "v1",
      workLogId: "log1",
      contentJson: snapshotDoc,
      plainText: "snapshot body",
      createdAt: new Date("2026-06-01T10:00:00Z"),
    } as any);
    mockWorkLogUpdate.mockResolvedValue({ id: "log1" } as any);
    mockVersionFindMany.mockRejectedValue(new Error("db unavailable"));

    const [req, ctx] = makeRequest("log1", "v1");
    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
    expect(mockWorkLogUpdate).toHaveBeenCalledTimes(1); // restore landed
  });
});
