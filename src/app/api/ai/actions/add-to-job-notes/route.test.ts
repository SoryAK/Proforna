/**
 * Hermetic coverage for the `add-to-job-notes` action route introduced by
 * ADR-0046 Phase D.2.
 *
 * Schema-truth correction (2026-06-22 — surfaced by live smoke):
 *  - `WorkHistory.notes` is NOT a scalar column. It is the relation
 *    `notes: WorkHistoryNote[]`. The original v1 route tried
 *    `prisma.workHistory.update({ data: { notes } })` and threw
 *    `PrismaClientValidationError: Unknown field 'notes'` at runtime.
 *  - The route now writes to the `WorkHistoryNote` child table —
 *    `prisma.workHistoryNote.create({ data: { workHistoryId, content } })`.
 *  - Each click = one new row. Journal semantics (additive). Bullets
 *    dedupe; notes don't, because timestamped log entries with the same
 *    content are legitimate.
 *
 * Contract:
 *  - POST `{ content: string, jobId: string }`
 *  - 401 when unauthenticated.
 *  - 400 on missing/blank `content` OR `jobId`.
 *  - 404 when the job does not exist OR exists but belongs to a different
 *    user (cross-user 404 per ADR-0028 owner-scoped pattern).
 *  - 200 happy path returns `{ id, workHistoryId, content }` where `id`
 *    is the new `WorkHistoryNote` row id.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  workHistory: {
    findUnique: vi.fn(),
  },
  workHistoryNote: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { getUserId } from "@/lib/auth-utils";
import { POST } from "./route";

function req(body: unknown): Request {
  return new Request("http://localhost/api/ai/actions/add-to-job-notes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (getUserId as ReturnType<typeof vi.fn>).mockResolvedValue("u-test");
});

describe("POST /api/ai/actions/add-to-job-notes — ADR-0046 Phase D.2", () => {
  it("returns 401 when unauthenticated", async () => {
    (getUserId as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const res = await POST(req({ content: "x", jobId: "j" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when content is missing", async () => {
    const res = await POST(req({ jobId: "j" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is blank", async () => {
    const res = await POST(req({ content: "   \n  ", jobId: "j" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when jobId is missing", async () => {
    const res = await POST(req({ content: "hello" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the job does not exist", async () => {
    prismaMock.workHistory.findUnique.mockResolvedValueOnce(null);
    const res = await POST(req({ content: "hello", jobId: "missing" }));
    expect(res.status).toBe(404);
    expect(prismaMock.workHistoryNote.create).not.toHaveBeenCalled();
  });

  it("returns 404 when the job belongs to a different user", async () => {
    prismaMock.workHistory.findUnique.mockResolvedValueOnce({
      id: "j",
      userId: "u-other",
    });
    const res = await POST(req({ content: "hello", jobId: "j" }));
    expect(res.status).toBe(404);
    expect(prismaMock.workHistoryNote.create).not.toHaveBeenCalled();
  });

  it("creates a WorkHistoryNote child row on the owned job", async () => {
    prismaMock.workHistory.findUnique.mockResolvedValueOnce({
      id: "j",
      userId: "u-test",
    });
    prismaMock.workHistoryNote.create.mockResolvedValueOnce({
      id: "note-1",
      workHistoryId: "j",
      content: "New AI block.",
    });
    const res = await POST(req({ content: "  New AI block.  ", jobId: "j" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      id: "note-1",
      workHistoryId: "j",
      content: "New AI block.",
    });
    const createCall = prismaMock.workHistoryNote.create.mock.calls[0]?.[0] as {
      data: { workHistoryId: string; content: string };
    };
    expect(createCall.data).toEqual({
      workHistoryId: "j",
      content: "New AI block.",
    });
    // Must NOT touch the parent row.
    expect(prismaMock.workHistory.findUnique).toHaveBeenCalledOnce();
  });

  it("creates a SECOND child row on a follow-up click (additive, no merge)", async () => {
    // First click.
    prismaMock.workHistory.findUnique.mockResolvedValueOnce({
      id: "j",
      userId: "u-test",
    });
    prismaMock.workHistoryNote.create.mockResolvedValueOnce({
      id: "note-1",
      workHistoryId: "j",
      content: "First entry.",
    });
    await POST(req({ content: "First entry.", jobId: "j" }));

    // Second click — identical content, must still create a new row
    // (no dedupe — journal entries with same text are legitimate).
    prismaMock.workHistory.findUnique.mockResolvedValueOnce({
      id: "j",
      userId: "u-test",
    });
    prismaMock.workHistoryNote.create.mockResolvedValueOnce({
      id: "note-2",
      workHistoryId: "j",
      content: "First entry.",
    });
    const res = await POST(req({ content: "First entry.", jobId: "j" }));
    expect(res.status).toBe(200);
    expect(prismaMock.workHistoryNote.create).toHaveBeenCalledTimes(2);
    const second = (await res.json()) as { id: string };
    expect(second.id).toBe("note-2");
  });
});
