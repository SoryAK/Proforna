/**
 * RED tests for POST /api/work-logs/import-md — Phase 4b of grill-me sprint.
 *
 * Re-import endpoint for the "Grill Me" round-trip flow. Accepts a raw
 * markdown payload (the file the user round-tripped through an external AI)
 * and:
 *   - parses frontmatter
 *   - looks up the worklog by frontmatter.id (owner-scoped)
 *   - calls decideImport() to choose one of four outcomes
 *
 * Branches:
 *   1. match           — write contentJson + plaintext + linkedWorkLogIds,
 *                        fire auto-snapshot, return { status: "imported" }
 *   2. conflict        — return { status: "conflict", file*, server* } so
 *                        client can show the 3-way diff modal
 *   3. needs-picker    — return { status: "needs-picker", reason, file* } so
 *                        client can show a picker
 *   4. not-found       — same shape as needs-picker but reason = id-not-found
 *
 * Phase 2.5 — TDD Iron Law. Tests written BEFORE implementation. RED first.
 */

import { vi } from "vitest";
import { POST } from "@/app/api/work-logs/import-md/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workLog: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    workLogVersion: {
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

const mockGetUserId = vi.mocked(getUserId);
const mockWorkLogFindFirst = vi.mocked(prisma.workLog.findFirst);
const mockWorkLogUpdate = vi.mocked(prisma.workLog.update);
const mockVersionCount = vi.mocked(prisma.workLogVersion.count);
const mockVersionFindFirst = vi.mocked(prisma.workLogVersion.findFirst);
const mockVersionCreate = vi.mocked(prisma.workLogVersion.create);
const mockVersionFindMany = vi.mocked(prisma.workLogVersion.findMany);
const mockVersionDeleteMany = vi.mocked(prisma.workLogVersion.deleteMany);

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/work-logs/import-md", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function frontmatterFor(opts: {
  id: string;
  version: number;
  exportedAt?: string;
  title?: string;
}): string {
  const lines = [
    "---",
    `id: ${opts.id}`,
    `version: ${opts.version}`,
    `exportedAt: '${opts.exportedAt ?? "2026-06-09T10:00:00.000Z"}'`,
  ];
  if (opts.title) lines.push(`title: ${opts.title}`);
  lines.push("---", "");
  return lines.join("\n");
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─────────────────────────────────────────────────────────
// Auth + validation
// ─────────────────────────────────────────────────────────

describe("POST /api/work-logs/import-md — auth + validation", () => {
  it("401 unauthenticated", async () => {
    mockGetUserId.mockResolvedValue(null);
    const res = await POST(makeRequest({ source: "# hi" }));
    expect(res.status).toBe(401);
  });

  it("400 when source is missing", async () => {
    mockGetUserId.mockResolvedValue("u1");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("400 when source is not a string", async () => {
    mockGetUserId.mockResolvedValue("u1");
    const res = await POST(makeRequest({ source: 42 }));
    expect(res.status).toBe(400);
  });

  it("400 when source is empty", async () => {
    mockGetUserId.mockResolvedValue("u1");
    const res = await POST(makeRequest({ source: "" }));
    expect(res.status).toBe(400);
  });

  it("413 when source exceeds 5 MB", async () => {
    mockGetUserId.mockResolvedValue("u1");
    const big = "a".repeat(5 * 1024 * 1024 + 1);
    const res = await POST(makeRequest({ source: big }));
    expect(res.status).toBe(413);
  });
});

// ─────────────────────────────────────────────────────────
// Branch: match (happy path — writes worklog)
// ─────────────────────────────────────────────────────────

describe("POST /api/work-logs/import-md — match", () => {
  function setupOwned(versionCount = 4) {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({
      id: "wl_abc",
      userId: "u1",
      title: "Old Title",
      content: "old body",
      contentJson: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "old body" }] }],
      },
      linkedWorkLogIds: [],
      assetIds: [],
    } as unknown as ReturnType<typeof mockWorkLogFindFirst>["mock"]["results"][number]["value"]);
    mockVersionCount.mockResolvedValue(versionCount);
    mockWorkLogUpdate.mockResolvedValue({ id: "wl_abc" } as unknown as ReturnType<typeof mockWorkLogUpdate>["mock"]["results"][number]["value"]);
    mockVersionFindFirst.mockResolvedValue(null);
    mockVersionFindMany.mockResolvedValue([]);
  }

  it("returns 200 with status 'imported' when frontmatter matches current version", async () => {
    setupOwned(4);
    const fm = frontmatterFor({ id: "wl_abc", version: 4, title: "Updated Title" });
    const res = await POST(makeRequest({ source: fm + "\n# Updated Title\n\nNew rewritten body\n" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("imported");
    expect(json.workLogId).toBe("wl_abc");
  });

  it("calls workLog.update with new contentJson (writes the body)", async () => {
    setupOwned(4);
    const fm = frontmatterFor({ id: "wl_abc", version: 4 });
    await POST(makeRequest({ source: fm + "\nNew body\n" }));
    expect(mockWorkLogUpdate).toHaveBeenCalled();
    const updateArg = mockWorkLogUpdate.mock.calls[0]?.[0];
    expect(updateArg?.where).toEqual({ id: "wl_abc" });
    expect(updateArg?.data).toBeDefined();
    expect(updateArg?.data).toMatchObject({
      contentJson: expect.any(Object),
      content: expect.any(String),
    });
  });

  it("ownership query is scoped to the authenticated user (never crosses user boundary)", async () => {
    setupOwned(4);
    const fm = frontmatterFor({ id: "wl_abc", version: 4 });
    await POST(makeRequest({ source: fm + "\nNew body\n" }));
    const lookupArg = mockWorkLogFindFirst.mock.calls[0]?.[0];
    expect(lookupArg?.where).toEqual({ id: "wl_abc", userId: "u1" });
  });
});

// ─────────────────────────────────────────────────────────
// Branch: conflict
// ─────────────────────────────────────────────────────────

describe("POST /api/work-logs/import-md — conflict", () => {
  it("returns 200 with status 'conflict' when current version > file version", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({
      id: "wl_abc",
      userId: "u1",
      title: "Server Title",
      content: "server body",
      contentJson: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "server body" }] },
        ],
      },
      linkedWorkLogIds: [],
      assetIds: [],
    } as unknown as ReturnType<typeof mockWorkLogFindFirst>["mock"]["results"][number]["value"]);
    mockVersionCount.mockResolvedValue(7);

    const fm = frontmatterFor({ id: "wl_abc", version: 4 });
    const res = await POST(makeRequest({ source: fm + "\nFile body from AI\n" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("conflict");
    expect(json.workLogId).toBe("wl_abc");
    expect(json.fileVersion).toBe(4);
    expect(json.currentVersion).toBe(7);
    expect(json.fileBody).toBeDefined();
    expect(json.fileBody.plaintext).toContain("File body from AI");
    expect(json.serverBody).toBeDefined();
    expect(json.serverBody.title).toBe("Server Title");
    expect(json.serverBody.plainText).toBe("server body");
  });

  it("does NOT call workLog.update on conflict (no write yet)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue({
      id: "wl_abc",
      userId: "u1",
      title: "Server",
      content: "body",
      contentJson: { type: "doc", content: [] },
      linkedWorkLogIds: [],
      assetIds: [],
    } as unknown as ReturnType<typeof mockWorkLogFindFirst>["mock"]["results"][number]["value"]);
    mockVersionCount.mockResolvedValue(7);

    const fm = frontmatterFor({ id: "wl_abc", version: 4 });
    await POST(makeRequest({ source: fm + "\nFile body\n" }));
    expect(mockWorkLogUpdate).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────
// Branch: needs-picker / not-found
// ─────────────────────────────────────────────────────────

describe("POST /api/work-logs/import-md — needs-picker / not-found", () => {
  it("returns 'needs-picker' when source has no frontmatter", async () => {
    mockGetUserId.mockResolvedValue("u1");
    const res = await POST(
      makeRequest({ source: "# Just a body\n\nNo frontmatter here." }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("needs-picker");
    expect(json.reason).toBe("no-frontmatter");
    expect(json.fileBody).toBeDefined();
    expect(json.fileBody.title).toBe("Just a body");
    // No DB writes
    expect(mockWorkLogUpdate).not.toHaveBeenCalled();
  });

  it("returns 'not-found' when frontmatter id doesn't belong to this user", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockWorkLogFindFirst.mockResolvedValue(null);
    const fm = frontmatterFor({ id: "wl_other", version: 1 });
    const res = await POST(makeRequest({ source: fm + "\nbody\n" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("not-found");
    expect(json.attemptedId).toBe("wl_other");
    expect(json.fileBody).toBeDefined();
    expect(mockWorkLogUpdate).not.toHaveBeenCalled();
  });

  it("does NOT query versions when frontmatter is missing (cheap path)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    await POST(makeRequest({ source: "no fm\n\nplain body" }));
    expect(mockVersionCount).not.toHaveBeenCalled();
    expect(mockWorkLogFindFirst).not.toHaveBeenCalled();
  });
});
