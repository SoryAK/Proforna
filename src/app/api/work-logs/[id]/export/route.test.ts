/**
 * RED tests for GET /api/work-logs/[id]/export — Phase 2 of grill-me sprint.
 *
 * Returns the worklog as a markdown file with grill-me frontmatter.
 *
 * Coverage:
 *  - 401 unauthenticated
 *  - 404 when worklog absent OR belongs to another user (existence not leaked)
 *  - 200 returns text/markdown with attachment Content-Disposition
 *  - filename is the slugified title with .md extension
 *  - body has frontmatter (id, version, exportedAt, title) + serialized markdown
 *  - version count = number of WorkLogVersion rows
 *
 * Phase 2.5 — TDD Iron Law. Tests written BEFORE implementation. RED first.
 */

import { vi } from "vitest";
import { GET } from "@/app/api/work-logs/[id]/export/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workLog: {
      findFirst: vi.fn(),
    },
    workLogVersion: {
      count: vi.fn(),
    },
  },
}));

const mockGetUserId = vi.mocked(getUserId);
const mockWorkLogFindFirst = vi.mocked(prisma.workLog.findFirst);
const mockVersionCount = vi.mocked(prisma.workLogVersion.count);

function makeRequest(id: string): [Request, { params: Promise<{ id: string }> }] {
  const req = new Request(`http://localhost/api/work-logs/${id}/export`);
  return [req, { params: Promise.resolve({ id }) }];
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─────────────────────────────────────────────────────────
// Auth + ownership
// ─────────────────────────────────────────────────────────

describe("GET /api/work-logs/[id]/export — auth + ownership", () => {
  it("401 unauthenticated request", async () => {
    mockGetUserId.mockResolvedValue(null);
    const [req, ctx] = makeRequest("wl_1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
    expect(mockWorkLogFindFirst).not.toHaveBeenCalled();
  });

  it("404 when worklog does not exist for this user", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue(null);
    const [req, ctx] = makeRequest("missing");
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
    expect(mockVersionCount).not.toHaveBeenCalled();
  });

  it("404 when worklog belongs to another user (existence not leaked)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue(null); // findFirst is scoped by userId
    const [req, ctx] = makeRequest("wl_belongs_to_u2");
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────
// Happy path
// ─────────────────────────────────────────────────────────

describe("GET /api/work-logs/[id]/export — happy path", () => {
  function setupOwnedWorklog() {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({
      id: "wl_abc",
      title: "My Worklog",
      contentJson: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Body text" }] },
        ],
      },
    } as never);
    mockVersionCount.mockResolvedValue(3);
  }

  it("returns 200 with text/markdown content-type", async () => {
    setupOwnedWorklog();
    const [req, ctx] = makeRequest("wl_abc");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toMatch(/text\/markdown/);
  });

  it("returns Content-Disposition: attachment with slugified filename", async () => {
    setupOwnedWorklog();
    const [req, ctx] = makeRequest("wl_abc");
    const res = await GET(req, ctx);
    const cd = res.headers.get("content-disposition") ?? "";
    expect(cd).toMatch(/attachment/);
    expect(cd).toMatch(/filename="my-worklog\.md"/);
  });

  it("body contains frontmatter with id, version, exportedAt, title", async () => {
    setupOwnedWorklog();
    const [req, ctx] = makeRequest("wl_abc");
    const res = await GET(req, ctx);
    const body = await res.text();
    expect(body).toMatch(/^---\n/);
    expect(body).toContain("id: wl_abc");
    expect(body).toContain("version: 3");
    expect(body).toMatch(/exportedAt: ['"]?\d{4}-\d{2}-\d{2}T/);
    expect(body).toContain("title: ");
  });

  it("body contains serialized markdown content after frontmatter", async () => {
    setupOwnedWorklog();
    const [req, ctx] = makeRequest("wl_abc");
    const res = await GET(req, ctx);
    const body = await res.text();
    expect(body).toMatch(/---\n\nBody text/);
  });

  it("uses 'untitled' filename when title is empty", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({
      id: "wl_x",
      title: "",
      contentJson: { type: "doc", content: [] },
    } as never);
    mockVersionCount.mockResolvedValue(0);
    const [req, ctx] = makeRequest("wl_x");
    const res = await GET(req, ctx);
    expect(res.headers.get("content-disposition") ?? "").toMatch(/filename="untitled\.md"/);
  });

  it("queries version count scoped to the worklog id", async () => {
    setupOwnedWorklog();
    const [req, ctx] = makeRequest("wl_abc");
    await GET(req, ctx);
    expect(mockVersionCount).toHaveBeenCalledWith({
      where: { workLogId: "wl_abc" },
    });
  });

  it("looks up worklog scoped to the authenticated user (no cross-user leak)", async () => {
    setupOwnedWorklog();
    const [req, ctx] = makeRequest("wl_abc");
    await GET(req, ctx);
    const callArg = mockWorkLogFindFirst.mock.calls[0]?.[0];
    expect(callArg?.where).toEqual({ id: "wl_abc", userId: "u1" });
  });
});

// ─────────────────────────────────────────────────────────
// Edge cases
// ─────────────────────────────────────────────────────────

describe("GET /api/work-logs/[id]/export — edge cases", () => {
  it("handles null contentJson by exporting an empty body", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({
      id: "wl_null",
      title: "No Body",
      contentJson: null,
    } as never);
    mockVersionCount.mockResolvedValue(0);
    const [req, ctx] = makeRequest("wl_null");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.text();
    // Frontmatter still present
    expect(body).toContain("id: wl_null");
  });
});
