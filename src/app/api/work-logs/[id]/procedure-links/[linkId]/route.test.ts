/**
 * Tests for DELETE /api/work-logs/[id]/procedure-links/[linkId] — ADR-0030 Unit 8.
 *
 * Coverage: 401, 404 when link doesn't exist, 404 when link's
 * fromProcedureId !== [id] (URL/body mismatch), cross-user isolation
 * (link's source procedure must be owned), happy-path delete.
 */

import { vi } from "vitest";
import { DELETE } from "@/app/api/work-logs/[id]/procedure-links/[linkId]/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({ getUserId: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    procedureLink: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

const mockGetUserId = vi.mocked(getUserId);

function ctx(id: string, linkId: string) {
  return { params: Promise.resolve({ id, linkId }) };
}

function makeReq(id: string, linkId: string): Request {
  return new Request(
    `http://localhost/api/work-logs/${id}/procedure-links/${linkId}`,
    { method: "DELETE" },
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("DELETE /api/work-logs/[id]/procedure-links/[linkId]", () => {
  it("401 when unauthenticated", async () => {
    mockGetUserId.mockResolvedValue(null);
    const res = await DELETE(makeReq("p-1", "link-1"), ctx("p-1", "link-1"));
    expect(res.status).toBe(401);
  });

  it("404 when link does not exist", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.procedureLink.findUnique).mockResolvedValue(null);
    const res = await DELETE(makeReq("p-1", "link-1"), ctx("p-1", "link-1"));
    expect(res.status).toBe(404);
    expect(vi.mocked(prisma.procedureLink.delete)).not.toHaveBeenCalled();
  });

  it("404 when link's fromProcedureId does not match URL [id]", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.procedureLink.findUnique).mockResolvedValue({
      id: "link-1",
      fromProcedureId: "p-OTHER",
      toProcedureId: "p-2",
      fromProcedure: { userId: "u1" },
    } as any);
    const res = await DELETE(makeReq("p-1", "link-1"), ctx("p-1", "link-1"));
    expect(res.status).toBe(404);
    expect(vi.mocked(prisma.procedureLink.delete)).not.toHaveBeenCalled();
  });

  it("404 when source procedure belongs to a different user", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.procedureLink.findUnique).mockResolvedValue({
      id: "link-1",
      fromProcedureId: "p-1",
      toProcedureId: "p-2",
      fromProcedure: { userId: "u2" },
    } as any);
    const res = await DELETE(makeReq("p-1", "link-1"), ctx("p-1", "link-1"));
    expect(res.status).toBe(404);
    expect(vi.mocked(prisma.procedureLink.delete)).not.toHaveBeenCalled();
  });

  it("204 — deletes the link when authorized", async () => {
    mockGetUserId.mockResolvedValue("u1");
    vi.mocked(prisma.procedureLink.findUnique).mockResolvedValue({
      id: "link-1",
      fromProcedureId: "p-1",
      toProcedureId: "p-2",
      fromProcedure: { userId: "u1" },
    } as any);
    vi.mocked(prisma.procedureLink.delete).mockResolvedValue({ id: "link-1" } as any);

    const res = await DELETE(makeReq("p-1", "link-1"), ctx("p-1", "link-1"));
    expect(res.status).toBe(204);

    const call = vi.mocked(prisma.procedureLink.delete).mock.calls[0]?.[0] as {
      where: { id: string };
    };
    expect(call.where.id).toBe("link-1");
  });
});
