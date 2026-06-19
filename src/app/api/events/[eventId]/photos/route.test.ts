/**
 * Tests for /api/events/[eventId]/photos (ADR-0034 follow-up: editor-canonical photos)
 *
 * Mirrors the Q2=B split established for /api/events/[eventId]:
 *   - This route serves FREE-FLOATING events only (workHistoryId === null).
 *   - Anchored events get 404 here — clients must use
 *     /api/work-history/[id]/events/[eventId]/photos instead.
 *
 * Ownership check shape (asserted explicitly to lock the contract):
 *   prisma.careerEvent.findFirst({
 *     where: { id: eventId, userId, workHistoryId: null }
 *   })
 *
 * Filesystem is mocked — tests must not touch /public/uploads.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST, DELETE } from "./route";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    careerEvent: {
      findFirst: vi.fn(),
    },
    careerEventPhoto: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock("fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { mkdir, writeFile, unlink } from "fs/promises";

const USER_ID = "user-aaa";
const EVENT_ID = "evt-floating-1";

function ctx() {
  return { params: Promise.resolve({ eventId: EVENT_ID }) };
}
function getReq() {
  return new Request(`http://localhost/api/events/${EVENT_ID}/photos`);
}
function deleteReq(photoId?: string) {
  const url = photoId
    ? `http://localhost/api/events/${EVENT_ID}/photos?photoId=${encodeURIComponent(photoId)}`
    : `http://localhost/api/events/${EVENT_ID}/photos`;
  return new Request(url, { method: "DELETE" });
}
function postReq(form: FormData) {
  return new Request(`http://localhost/api/events/${EVENT_ID}/photos`, {
    method: "POST",
    body: form,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── GET ────────────────────────────────────────────────────────────

describe("GET /api/events/[eventId]/photos", () => {
  it("401 when no session", async () => {
    vi.mocked(getUserId).mockResolvedValue(null);
    const res = await GET(getReq() as never, ctx());
    expect(res.status).toBe(401);
  });

  it("404 when event belongs to another user (IDOR)", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    vi.mocked(prisma.careerEvent.findFirst).mockResolvedValue(null);
    const res = await GET(getReq() as never, ctx());
    expect(res.status).toBe(404);
    // WHERE clause scopes to workHistoryId: null (Q2=B strict scope)
    expect(prisma.careerEvent.findFirst).toHaveBeenCalledWith({
      where: { id: EVENT_ID, userId: USER_ID, workHistoryId: null },
    });
  });

  it("404 when event is anchored (Q2=B — findFirst filters workHistoryId: null)", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    vi.mocked(prisma.careerEvent.findFirst).mockResolvedValue(null);
    const res = await GET(getReq() as never, ctx());
    expect(res.status).toBe(404);
  });

  it("200 returns photos sorted by sortOrder then createdAt", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    vi.mocked(prisma.careerEvent.findFirst).mockResolvedValue({
      id: EVENT_ID,
      userId: USER_ID,
      workHistoryId: null,
    } as never);
    const photos = [
      { id: "p1", careerEventId: EVENT_ID, filePath: "/uploads/career-events/a.jpg", sortOrder: 0 },
      { id: "p2", careerEventId: EVENT_ID, filePath: "/uploads/career-events/b.jpg", sortOrder: 1 },
    ];
    vi.mocked(prisma.careerEventPhoto.findMany).mockResolvedValue(photos as never);
    const res = await GET(getReq() as never, ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(photos);
    expect(prisma.careerEventPhoto.findMany).toHaveBeenCalledWith({
      where: { careerEventId: EVENT_ID },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  });
});

// ── POST ───────────────────────────────────────────────────────────

describe("POST /api/events/[eventId]/photos", () => {
  function makeForm(file?: File, caption?: string) {
    const fd = new FormData();
    if (file) fd.append("file", file);
    if (caption) fd.append("caption", caption);
    return fd;
  }
  function fakeFile(name = "x.jpg", type = "image/jpeg", size = 1024) {
    const blob = new Blob([new Uint8Array(size)], { type });
    return new File([blob], name, { type });
  }

  it("401 when no session", async () => {
    vi.mocked(getUserId).mockResolvedValue(null);
    const res = await POST(postReq(makeForm(fakeFile())) as never, ctx());
    expect(res.status).toBe(401);
  });

  it("404 when event anchored or not owned", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    vi.mocked(prisma.careerEvent.findFirst).mockResolvedValue(null);
    const res = await POST(postReq(makeForm(fakeFile())) as never, ctx());
    expect(res.status).toBe(404);
  });

  it("400 when no file field", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    vi.mocked(prisma.careerEvent.findFirst).mockResolvedValue({
      id: EVENT_ID,
      userId: USER_ID,
      workHistoryId: null,
    } as never);
    const res = await POST(postReq(makeForm()) as never, ctx());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/file/i);
  });

  it("400 when invalid mime type", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    vi.mocked(prisma.careerEvent.findFirst).mockResolvedValue({
      id: EVENT_ID,
      userId: USER_ID,
      workHistoryId: null,
    } as never);
    const res = await POST(
      postReq(makeForm(fakeFile("doc.pdf", "application/pdf", 1024))) as never,
      ctx()
    );
    expect(res.status).toBe(400);
    expect(prisma.careerEventPhoto.create).not.toHaveBeenCalled();
  });

  it("400 when file exceeds 8MB", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    vi.mocked(prisma.careerEvent.findFirst).mockResolvedValue({
      id: EVENT_ID,
      userId: USER_ID,
      workHistoryId: null,
    } as never);
    const big = fakeFile("big.jpg", "image/jpeg", 9 * 1024 * 1024);
    const res = await POST(postReq(makeForm(big)) as never, ctx());
    expect(res.status).toBe(400);
    expect(prisma.careerEventPhoto.create).not.toHaveBeenCalled();
  });

  it("400 when already at MAX_PER_EVENT (12)", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    vi.mocked(prisma.careerEvent.findFirst).mockResolvedValue({
      id: EVENT_ID,
      userId: USER_ID,
      workHistoryId: null,
    } as never);
    vi.mocked(prisma.careerEventPhoto.count).mockResolvedValue(12);
    const res = await POST(postReq(makeForm(fakeFile())) as never, ctx());
    expect(res.status).toBe(400);
    expect(prisma.careerEventPhoto.create).not.toHaveBeenCalled();
  });

  it("201 writes file and creates DB row", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    vi.mocked(prisma.careerEvent.findFirst).mockResolvedValue({
      id: EVENT_ID,
      userId: USER_ID,
      workHistoryId: null,
    } as never);
    vi.mocked(prisma.careerEventPhoto.count).mockResolvedValue(0);
    vi.mocked(prisma.careerEventPhoto.create).mockImplementation(async (args) => {
      return { id: "new-photo", ...args.data, createdAt: new Date() } as never;
    });
    const res = await POST(
      postReq(makeForm(fakeFile("party.jpg", "image/jpeg", 4096), "fun caption")) as never,
      ctx()
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("new-photo");
    expect(body.careerEventId).toBe(EVENT_ID);
    expect(body.fileMime).toBe("image/jpeg");
    expect(body.fileSize).toBe(4096);
    expect(body.caption).toBe("fun caption");
    expect(body.filePath).toMatch(/^\/uploads\/career-events\/evt-[a-f0-9]+\.jpg$/);
    expect(body.sortOrder).toBe(0);
    // Filesystem touched
    expect(mkdir).toHaveBeenCalledOnce();
    expect(writeFile).toHaveBeenCalledOnce();
  });
});

// ── DELETE ─────────────────────────────────────────────────────────

describe("DELETE /api/events/[eventId]/photos", () => {
  it("401 when no session", async () => {
    vi.mocked(getUserId).mockResolvedValue(null);
    const res = await DELETE(deleteReq("p1") as never, ctx());
    expect(res.status).toBe(401);
  });

  it("404 when event anchored or not owned", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    vi.mocked(prisma.careerEvent.findFirst).mockResolvedValue(null);
    const res = await DELETE(deleteReq("p1") as never, ctx());
    expect(res.status).toBe(404);
  });

  it("400 when photoId query param missing", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    vi.mocked(prisma.careerEvent.findFirst).mockResolvedValue({
      id: EVENT_ID,
      userId: USER_ID,
      workHistoryId: null,
    } as never);
    const res = await DELETE(deleteReq() as never, ctx());
    expect(res.status).toBe(400);
    expect(prisma.careerEventPhoto.delete).not.toHaveBeenCalled();
  });

  it("404 when photoId not found for this event", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    vi.mocked(prisma.careerEvent.findFirst).mockResolvedValue({
      id: EVENT_ID,
      userId: USER_ID,
      workHistoryId: null,
    } as never);
    vi.mocked(prisma.careerEventPhoto.findFirst).mockResolvedValue(null);
    const res = await DELETE(deleteReq("missing") as never, ctx());
    expect(res.status).toBe(404);
    expect(prisma.careerEventPhoto.delete).not.toHaveBeenCalled();
  });

  it("200 deletes file (best-effort) and DB row", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    vi.mocked(prisma.careerEvent.findFirst).mockResolvedValue({
      id: EVENT_ID,
      userId: USER_ID,
      workHistoryId: null,
    } as never);
    vi.mocked(prisma.careerEventPhoto.findFirst).mockResolvedValue({
      id: "p1",
      careerEventId: EVENT_ID,
      filePath: "/uploads/career-events/evt-abc.jpg",
    } as never);
    vi.mocked(prisma.careerEventPhoto.delete).mockResolvedValue({} as never);
    const res = await DELETE(deleteReq("p1") as never, ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
    expect(unlink).toHaveBeenCalledOnce();
    expect(prisma.careerEventPhoto.delete).toHaveBeenCalledWith({ where: { id: "p1" } });
  });

  it("200 still succeeds when file unlink fails (best-effort)", async () => {
    vi.mocked(getUserId).mockResolvedValue(USER_ID);
    vi.mocked(prisma.careerEvent.findFirst).mockResolvedValue({
      id: EVENT_ID,
      userId: USER_ID,
      workHistoryId: null,
    } as never);
    vi.mocked(prisma.careerEventPhoto.findFirst).mockResolvedValue({
      id: "p1",
      careerEventId: EVENT_ID,
      filePath: "/uploads/career-events/evt-abc.jpg",
    } as never);
    vi.mocked(unlink).mockRejectedValueOnce(new Error("ENOENT"));
    vi.mocked(prisma.careerEventPhoto.delete).mockResolvedValue({} as never);
    const res = await DELETE(deleteReq("p1") as never, ctx());
    expect(res.status).toBe(200);
    expect(prisma.careerEventPhoto.delete).toHaveBeenCalledOnce();
  });
});
