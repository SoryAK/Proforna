/**
 * Tests for POST /api/work-logs/import — the note-import endpoint.
 *
 * Sprint 3 contract (locked):
 *   - Auth required (401 on missing session)
 *   - Body: { sourceType: "markdown" | "html"; source: string; sourceFilename?; folderId? }
 *   - 413 when source > 5 MB
 *   - 400 on validation / parse failure (still writes a `failed` WorkLogImport row)
 *   - 404 when folderId is provided but not owned by user
 *   - 201 on first import → creates WorkLog + succeeded WorkLogImport in a transaction
 *   - 200 with `deduped: true` when the (userId, sourceType, sourceFingerprint) row already exists
 *
 * Mocks: getUserId, prisma (workLogImport.findUnique / workLog.create /
 * workLogImport.create / workLogFolder.findFirst / $transaction), and the
 * pure parser helpers (importMarkdown / importHtml) so unit-of-test stays
 * route-shape, not parser internals.
 */

import { vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/work-logs/import/route";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { importMarkdown } from "@/lib/worklog/import/markdown-to-pm";
import { importHtml } from "@/lib/worklog/import/html-to-pm";
import type { ImportResult } from "@/lib/worklog/import/types";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workLogImport: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    workLog: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    workLogFolder: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/worklog/import/markdown-to-pm", () => ({
  importMarkdown: vi.fn(),
}));

vi.mock("@/lib/worklog/import/html-to-pm", () => ({
  importHtml: vi.fn(),
}));

const mockGetUserId = vi.mocked(getUserId);
const mockImportMarkdown = vi.mocked(importMarkdown);
const mockImportHtml = vi.mocked(importHtml);
const mockWorkLogImportFindUnique = vi.mocked(prisma.workLogImport.findUnique);
const mockWorkLogImportCreate = vi.mocked(prisma.workLogImport.create);
const mockWorkLogCreate = vi.mocked(prisma.workLog.create);
const mockWorkLogFindUnique = vi.mocked(prisma.workLog.findUnique);
const mockWorkLogFolderFindFirst = vi.mocked(prisma.workLogFolder.findFirst);
const mockTransaction = vi.mocked(prisma.$transaction);

// ── helpers ────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/work-logs/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function fakeImportResult(over: Partial<{ title: string; plaintext: string; droppedBlocks: Array<{ type: string; count: number }> }> = {}): ImportResult {
  return {
    title: over.title ?? "Imported Note",
    contentJson: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: over.plaintext ?? "hello world" }] },
      ],
    },
    plaintext: over.plaintext ?? "hello world",
    droppedBlocks: over.droppedBlocks ?? [],
  };
}

function fakeCreatedWorkLog(id = "wl1") {
  return {
    id,
    userId: "u1",
    title: "Imported Note",
    content: "hello world",
    date: new Date("2026-06-08T00:00:00.000Z"),
    folderId: null,
  };
}

function fakeCreatedImport(id = "imp1", workLogId: string | null = "wl1") {
  return {
    id,
    userId: "u1",
    sourceType: "markdown",
    sourceFingerprint: "fp",
    status: workLogId ? "succeeded" : "failed",
    droppedBlocks: [],
    sourceFilename: null,
    workLogId,
    errorMessage: workLogId ? null : "parse failed",
    createdAt: new Date(),
    completedAt: new Date(),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  // Default: no dedupe row exists.
  mockWorkLogImportFindUnique.mockResolvedValue(null);
  // Default $transaction passthrough: run each callback / return inputs.
  mockTransaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === "function") {
      // Interactive transaction: invoke with the same mocked prisma client.
      return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
    }
    // Array-form transaction: resolve all promises.
    return Promise.all(arg as Promise<unknown>[]);
  });
});

// ─────────────────────────────────────────────────────────
describe("POST /api/work-logs/import", () => {
  // ── auth ──────────────────────────────────────────────

  it("401 — unauthenticated request", async () => {
    mockGetUserId.mockResolvedValue(null);
    const res = await POST(
      makeRequest({ sourceType: "markdown", source: "# hi" }),
    );
    expect(res.status).toBe(401);
  });

  // ── input validation ──────────────────────────────────

  it("400 — missing sourceType", async () => {
    mockGetUserId.mockResolvedValue("u1");
    const res = await POST(makeRequest({ source: "# hi" }));
    expect(res.status).toBe(400);
  });

  it("400 — invalid sourceType", async () => {
    mockGetUserId.mockResolvedValue("u1");
    const res = await POST(
      makeRequest({ sourceType: "notion", source: "# hi" }),
    );
    expect(res.status).toBe(400);
  });

  it("400 — missing source", async () => {
    mockGetUserId.mockResolvedValue("u1");
    const res = await POST(makeRequest({ sourceType: "markdown" }));
    expect(res.status).toBe(400);
  });

  it("400 — source must be a string", async () => {
    mockGetUserId.mockResolvedValue("u1");
    const res = await POST(
      makeRequest({ sourceType: "markdown", source: 42 }),
    );
    expect(res.status).toBe(400);
  });

  // ── size cap ──────────────────────────────────────────

  it("413 — source exceeds 5 MB cap", async () => {
    mockGetUserId.mockResolvedValue("u1");
    // 5 MB + 1 byte: "a".repeat(5 * 1024 * 1024 + 1).
    const huge = "a".repeat(5 * 1024 * 1024 + 1);
    const res = await POST(makeRequest({ sourceType: "markdown", source: huge }));
    expect(res.status).toBe(413);
    // Should NOT have invoked the parser (size check runs first).
    expect(mockImportMarkdown).not.toHaveBeenCalled();
  });

  // ── folder ownership ──────────────────────────────────

  it("404 — folderId provided but not owned by user", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockImportMarkdown.mockReturnValue(fakeImportResult());
    mockWorkLogFolderFindFirst.mockResolvedValue(null);

    const res = await POST(
      makeRequest({
        sourceType: "markdown",
        source: "# hi",
        folderId: "not-mine",
      }),
    );
    expect(res.status).toBe(404);
    expect(mockWorkLogCreate).not.toHaveBeenCalled();
  });

  // ── happy path: markdown ──────────────────────────────

  it("201 — markdown import creates WorkLog and succeeded WorkLogImport", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockImportMarkdown.mockReturnValue(fakeImportResult({ title: "My Note" }));
    mockWorkLogCreate.mockResolvedValue(fakeCreatedWorkLog() as never);
    mockWorkLogImportCreate.mockResolvedValue(fakeCreatedImport() as never);

    const res = await POST(
      makeRequest({
        sourceType: "markdown",
        source: "# My Note",
        sourceFilename: "my-note.md",
      }),
    );

    expect(res.status).toBe(201);
    expect(mockImportMarkdown).toHaveBeenCalledTimes(1);
    expect(mockWorkLogCreate).toHaveBeenCalledTimes(1);
    expect(mockWorkLogImportCreate).toHaveBeenCalledTimes(1);

    const wlData = mockWorkLogCreate.mock.calls[0][0].data as Record<string, unknown>;
    expect(wlData.userId).toBe("u1");
    expect(wlData.title).toBe("My Note");
    expect(wlData.category).toBe("note");

    const impData = mockWorkLogImportCreate.mock.calls[0][0].data as Record<string, unknown>;
    expect(impData.userId).toBe("u1");
    expect(impData.sourceType).toBe("markdown");
    expect(impData.status).toBe("succeeded");
    expect(impData.workLogId).toBe("wl1");
    expect(impData.sourceFilename).toBe("my-note.md");
    // Fingerprint is sha256 hex (64 chars).
    expect(typeof impData.sourceFingerprint).toBe("string");
    expect((impData.sourceFingerprint as string).length).toBe(64);

    const body = await res.json();
    expect(body.workLog.id).toBe("wl1");
    expect(body.import.status).toBe("succeeded");
    expect(body.deduped).toBeFalsy();
  });

  // ── happy path: html ──────────────────────────────────

  it("201 — html import dispatches to importHtml (not importMarkdown)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockImportHtml.mockReturnValue(fakeImportResult());
    mockWorkLogCreate.mockResolvedValue(fakeCreatedWorkLog() as never);
    mockWorkLogImportCreate.mockResolvedValue(fakeCreatedImport() as never);

    const res = await POST(
      makeRequest({ sourceType: "html", source: "<h1>hi</h1>" }),
    );

    expect(res.status).toBe(201);
    expect(mockImportHtml).toHaveBeenCalledTimes(1);
    expect(mockImportMarkdown).not.toHaveBeenCalled();
  });

  // ── dedupe ────────────────────────────────────────────

  it("200 — dedupe hit returns existing WorkLog without creating new rows", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockImportMarkdown.mockReturnValue(fakeImportResult());
    // Existing import row with linked WorkLog.
    mockWorkLogImportFindUnique.mockResolvedValue({
      ...fakeCreatedImport("imp-existing", "wl-existing"),
      workLog: fakeCreatedWorkLog("wl-existing"),
    } as never);

    const res = await POST(
      makeRequest({ sourceType: "markdown", source: "# hi" }),
    );

    expect(res.status).toBe(200);
    expect(mockWorkLogCreate).not.toHaveBeenCalled();
    expect(mockWorkLogImportCreate).not.toHaveBeenCalled();

    const body = await res.json();
    expect(body.deduped).toBe(true);
    expect(body.workLog.id).toBe("wl-existing");
    expect(body.import.id).toBe("imp-existing");
  });

  // ── parse failure ─────────────────────────────────────

  it("400 — parser throws → writes failed import row, no WorkLog, returns { error, importId }", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockImportMarkdown.mockImplementation(() => {
      throw new Error("malformed markdown");
    });
    mockWorkLogImportCreate.mockResolvedValue(
      fakeCreatedImport("imp-failed", null) as never,
    );

    const res = await POST(
      makeRequest({ sourceType: "markdown", source: "garbage" }),
    );

    expect(res.status).toBe(400);
    expect(mockWorkLogCreate).not.toHaveBeenCalled();
    expect(mockWorkLogImportCreate).toHaveBeenCalledTimes(1);

    const impData = mockWorkLogImportCreate.mock.calls[0][0].data as Record<string, unknown>;
    expect(impData.status).toBe("failed");
    expect(impData.errorMessage).toMatch(/malformed markdown/);
    expect(impData.workLogId).toBeNull();

    const body = await res.json();
    expect(body.error).toMatch(/malformed markdown/);
    expect(body.importId).toBe("imp-failed");
  });

  // ── folderId propagation ──────────────────────────────

  it("201 — valid folderId is written to WorkLog.folderId", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockImportMarkdown.mockReturnValue(fakeImportResult());
    mockWorkLogFolderFindFirst.mockResolvedValue({ id: "folder-x" } as never);
    mockWorkLogCreate.mockResolvedValue(
      { ...fakeCreatedWorkLog(), folderId: "folder-x" } as never,
    );
    mockWorkLogImportCreate.mockResolvedValue(fakeCreatedImport() as never);

    const res = await POST(
      makeRequest({
        sourceType: "markdown",
        source: "# hi",
        folderId: "folder-x",
      }),
    );

    expect(res.status).toBe(201);
    const wlData = mockWorkLogCreate.mock.calls[0][0].data as Record<string, unknown>;
    expect(wlData.folderId).toBe("folder-x");
  });

  // ── race: P2002 unique violation after passing dedupe check ───

  it("200 — race: P2002 on insert is recovered by re-reading the dedupe row", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockImportMarkdown.mockReturnValue(fakeImportResult());

    // First findUnique: no row. Second findUnique (post-race): row exists.
    mockWorkLogImportFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...fakeCreatedImport("imp-racewin", "wl-racewin"),
        workLog: fakeCreatedWorkLog("wl-racewin"),
      } as never);

    // WorkLog insert succeeds inside the transaction — race fires on the
    // WorkLogImport insert (the row with the unique dedupe constraint).
    mockWorkLogCreate.mockResolvedValue(fakeCreatedWorkLog("wl-orphan") as never);

    const p2002 = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
    });
    mockWorkLogImportCreate.mockRejectedValueOnce(p2002);

    const res = await POST(
      makeRequest({ sourceType: "markdown", source: "# hi" }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deduped).toBe(true);
    expect(body.workLog.id).toBe("wl-racewin");
  });
});
