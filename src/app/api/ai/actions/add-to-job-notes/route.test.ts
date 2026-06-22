/**
 * Hermetic coverage for the `add-to-job-notes` action route introduced by
 * ADR-0046 Phase D.2.
 *
 * Contract:
 *  - POST `{ content: string, jobId: string }`
 *  - 401 when unauthenticated.
 *  - 400 on missing/blank `content` OR `jobId`.
 *  - 404 when the job does not exist OR exists but belongs to a different
 *    user (cross-user 404 per ADR-0028 owner-scoped pattern).
 *  - 200 happy path returns `{ id, notes }`. Existing `notes` is preserved
 *    and the new content is APPENDED with a separating blank line; null
 *    notes start fresh.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  workHistory: {
    findUnique: vi.fn(),
    update: vi.fn(),
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
    expect(prismaMock.workHistory.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the job belongs to a different user", async () => {
    prismaMock.workHistory.findUnique.mockResolvedValueOnce({
      id: "j",
      userId: "u-other",
      notes: null,
    });
    const res = await POST(req({ content: "hello", jobId: "j" }));
    expect(res.status).toBe(404);
    expect(prismaMock.workHistory.update).not.toHaveBeenCalled();
  });

  it("appends to existing notes with a blank-line separator", async () => {
    prismaMock.workHistory.findUnique.mockResolvedValueOnce({
      id: "j",
      userId: "u-test",
      notes: "Existing note.",
    });
    prismaMock.workHistory.update.mockImplementationOnce(({ data }: { data: { notes: string } }) =>
      Promise.resolve({ id: "j", notes: data.notes }),
    );
    const res = await POST(req({ content: "New AI block.", jobId: "j" }));
    expect(res.status).toBe(200);
    const updateCall = prismaMock.workHistory.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { notes: string };
    };
    expect(updateCall.where).toEqual({ id: "j" });
    expect(updateCall.data.notes).toBe("Existing note.\n\nNew AI block.");
  });

  it("creates fresh notes when previous was null", async () => {
    prismaMock.workHistory.findUnique.mockResolvedValueOnce({
      id: "j",
      userId: "u-test",
      notes: null,
    });
    prismaMock.workHistory.update.mockResolvedValueOnce({
      id: "j",
      notes: "New AI block.",
    });
    const res = await POST(req({ content: "New AI block.", jobId: "j" }));
    expect(res.status).toBe(200);
    const updateCall = prismaMock.workHistory.update.mock.calls[0]?.[0] as {
      data: { notes: string };
    };
    expect(updateCall.data.notes).toBe("New AI block.");
  });
});
