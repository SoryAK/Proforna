/**
 * RED tests for POST /api/work-logs/export-bulk — Phase 3 of grill-me sprint.
 *
 * Bulk export endpoint:
 *   - 1 id   -> single .md attachment (same shape as Phase 2 single-note route)
 *   - N > 1  -> .zip containing N .md files, all with grill-me frontmatter
 *
 * Coverage:
 *   - 401 unauthenticated
 *   - 400 bad inputs (missing/empty/non-array ids; oversize)
 *   - 404 when NONE of the requested ids belong to the user (no existence leak)
 *   - silently drops ids that don't belong to the user (no leak; partial export)
 *   - filename collision suffixed with short id
 *   - response Content-Type/Disposition match the artifact (md vs zip)
 *
 * Phase 2.5 — TDD Iron Law. Tests written BEFORE implementation. RED first.
 */

import { vi } from "vitest";
import JSZip from "jszip";
import { POST } from "@/app/api/work-logs/export-bulk/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workLog: {
      findMany: vi.fn(),
    },
    workLogVersion: {
      groupBy: vi.fn(),
    },
  },
}));

const mockGetUserId = vi.mocked(getUserId);
const mockWorkLogFindMany = vi.mocked(prisma.workLog.findMany);
const mockVersionGroupBy = vi.mocked(prisma.workLogVersion.groupBy);

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/work-logs/export-bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─────────────────────────────────────────────────────────
// Auth + input validation
// ─────────────────────────────────────────────────────────

describe("POST /api/work-logs/export-bulk — auth + validation", () => {
  it("401 unauthenticated request", async () => {
    mockGetUserId.mockResolvedValue(null);
    const res = await POST(makeRequest({ ids: ["a"] }));
    expect(res.status).toBe(401);
    expect(mockWorkLogFindMany).not.toHaveBeenCalled();
  });

  it("400 when ids is missing", async () => {
    mockGetUserId.mockResolvedValue("u1");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("400 when ids is not an array", async () => {
    mockGetUserId.mockResolvedValue("u1");
    const res = await POST(makeRequest({ ids: "abc" }));
    expect(res.status).toBe(400);
  });

  it("400 when ids is empty", async () => {
    mockGetUserId.mockResolvedValue("u1");
    const res = await POST(makeRequest({ ids: [] }));
    expect(res.status).toBe(400);
  });

  it("400 when ids exceeds the 100-item bulk cap", async () => {
    mockGetUserId.mockResolvedValue("u1");
    const ids = Array.from({ length: 101 }, (_, i) => `wl_${i}`);
    const res = await POST(makeRequest({ ids }));
    expect(res.status).toBe(400);
  });

  it("404 when none of the requested ids belong to the user", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindMany.mockResolvedValue([]);
    const res = await POST(makeRequest({ ids: ["a", "b", "c"] }));
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────
// Single-id branch (delegates to same export shape)
// ─────────────────────────────────────────────────────────

describe("POST /api/work-logs/export-bulk — single id", () => {
  it("returns text/markdown attachment when ids.length === 1", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindMany.mockResolvedValue([
      {
        id: "wl_1",
        title: "Solo Note",
        contentJson: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "alone" }] }],
        },
      },
    ] as unknown as ReturnType<typeof mockWorkLogFindMany>["mock"]["results"][number]["value"]);
    mockVersionGroupBy.mockResolvedValue([
      { workLogId: "wl_1", _count: { _all: 2 } },
    ] as unknown as ReturnType<typeof mockVersionGroupBy>["mock"]["results"][number]["value"]);

    const res = await POST(makeRequest({ ids: ["wl_1"] }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toMatch(/text\/markdown/);
    expect(res.headers.get("content-disposition") ?? "").toMatch(/filename="solo-note\.md"/);
    const body = await res.text();
    expect(body).toContain("id: wl_1");
    expect(body).toContain("version: 2");
    expect(body).toContain("alone");
  });
});

// ─────────────────────────────────────────────────────────
// Multi-id branch (zip)
// ─────────────────────────────────────────────────────────

describe("POST /api/work-logs/export-bulk — zip", () => {
  function setupTwoOwned() {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindMany.mockResolvedValue([
      {
        id: "wl_1",
        title: "First Note",
        contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] },
      },
      {
        id: "wl_2",
        title: "Second Note",
        contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "two" }] }] },
      },
    ] as unknown as ReturnType<typeof mockWorkLogFindMany>["mock"]["results"][number]["value"]);
    mockVersionGroupBy.mockResolvedValue([
      { workLogId: "wl_1", _count: { _all: 1 } },
      { workLogId: "wl_2", _count: { _all: 5 } },
    ] as unknown as ReturnType<typeof mockVersionGroupBy>["mock"]["results"][number]["value"]);
  }

  it("returns application/zip when N > 1", async () => {
    setupTwoOwned();
    const res = await POST(makeRequest({ ids: ["wl_1", "wl_2"] }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toMatch(/application\/zip/);
    expect(res.headers.get("content-disposition") ?? "").toMatch(/filename="worklogs-\d{4}-\d{2}-\d{2}\.zip"/);
  });

  it("zip contains one .md per worklog with correct filenames", async () => {
    setupTwoOwned();
    const res = await POST(makeRequest({ ids: ["wl_1", "wl_2"] }));
    const buf = Buffer.from(await res.arrayBuffer());
    const zip = await JSZip.loadAsync(buf);
    const filenames = Object.keys(zip.files).sort();
    expect(filenames).toEqual(["first-note.md", "second-note.md"]);
  });

  it("each zip entry contains its own grill-me frontmatter and body", async () => {
    setupTwoOwned();
    const res = await POST(makeRequest({ ids: ["wl_1", "wl_2"] }));
    const buf = Buffer.from(await res.arrayBuffer());
    const zip = await JSZip.loadAsync(buf);
    const first = await zip.file("first-note.md")!.async("string");
    const second = await zip.file("second-note.md")!.async("string");
    expect(first).toContain("id: wl_1");
    expect(first).toContain("version: 1");
    expect(first).toContain("one");
    expect(second).toContain("id: wl_2");
    expect(second).toContain("version: 5");
    expect(second).toContain("two");
  });

  it("disambiguates filename collisions with a short id suffix", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindMany.mockResolvedValue([
      {
        id: "wl_aaa",
        title: "Same Title",
        contentJson: { type: "doc", content: [] },
      },
      {
        id: "wl_bbb",
        title: "Same Title",
        contentJson: { type: "doc", content: [] },
      },
    ] as unknown as ReturnType<typeof mockWorkLogFindMany>["mock"]["results"][number]["value"]);
    mockVersionGroupBy.mockResolvedValue([] as unknown as ReturnType<typeof mockVersionGroupBy>["mock"]["results"][number]["value"]);

    const res = await POST(makeRequest({ ids: ["wl_aaa", "wl_bbb"] }));
    const buf = Buffer.from(await res.arrayBuffer());
    const zip = await JSZip.loadAsync(buf);
    const filenames = Object.keys(zip.files).sort();
    // First one keeps the clean slug, subsequent collisions get suffixed
    expect(filenames).toContain("same-title.md");
    expect(filenames.some((f) => f.startsWith("same-title-") && f.endsWith(".md"))).toBe(true);
  });

  it("silently drops ids that do not belong to the user (no existence leak)", async () => {
    // Caller asks for 3 ids; only 2 belong to them. We export those 2 and
    // never reveal that wl_other exists / belongs to someone else.
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindMany.mockResolvedValue([
      {
        id: "wl_1",
        title: "Mine A",
        contentJson: { type: "doc", content: [] },
      },
      {
        id: "wl_2",
        title: "Mine B",
        contentJson: { type: "doc", content: [] },
      },
    ] as unknown as ReturnType<typeof mockWorkLogFindMany>["mock"]["results"][number]["value"]);
    mockVersionGroupBy.mockResolvedValue([] as unknown as ReturnType<typeof mockVersionGroupBy>["mock"]["results"][number]["value"]);

    const res = await POST(makeRequest({ ids: ["wl_1", "wl_2", "wl_other"] }));
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    const zip = await JSZip.loadAsync(buf);
    expect(Object.keys(zip.files).sort()).toEqual(["mine-a.md", "mine-b.md"]);
  });

  it("scopes the prisma query to the authenticated user (no cross-user lookups)", async () => {
    setupTwoOwned();
    await POST(makeRequest({ ids: ["wl_1", "wl_2"] }));
    const callArg = mockWorkLogFindMany.mock.calls[0]?.[0];
    expect(callArg?.where).toMatchObject({
      userId: "u1",
      id: { in: ["wl_1", "wl_2"] },
    });
  });
});
