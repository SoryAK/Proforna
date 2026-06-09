/**
 * Tests for PUT /api/work-logs/[id] — focused on the mention-asset merge.
 *
 * When `contentJson` is saved the route extracts all @a: (asset) mention IDs
 * and unions them into `assetIds`.  Manual accordion entries are never removed.
 *
 * Coverage:
 *  - contentJson with asset mentions → mention IDs unioned with existing assetIds
 *  - explicit body.assetIds + asset mentions → full union stored
 *  - contentJson with non-asset mentions only → assetIds NOT touched
 *  - no contentJson in body → assetIds NOT in updateData
 *  - explicit body.assetIds alone (no contentJson) → stored as-is
 */

import { vi } from "vitest";
import { PUT } from "@/app/api/work-logs/[id]/route";
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
    workHistoryShift: {
      findFirst: vi.fn(),
    },
    workLogFolder: {
      findFirst: vi.fn(),
    },
  },
}));

const mockGetUserId  = vi.mocked(getUserId);
const mockFindFirst  = vi.mocked(prisma.workLog.findFirst);
const mockUpdate     = vi.mocked(prisma.workLog.update);

// ── helpers ────────────────────────────────────────────────────────────────

function makeRequest(id: string, body: unknown): [Request, { params: Promise<{ id: string }> }] {
  const req = new Request(`http://localhost/api/work-logs/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return [req, { params: Promise.resolve({ id }) }];
}

/** Minimal existing log fixture — shiftId null avoids the shift lookup branch. */
function existingLog(assetIds: string[] = [], linkedNoteIds: string[] = []) {
  return {
    id: "log1",
    positionId: null,
    date: new Date("2026-01-15T08:00:00.000Z"),
    shiftId: null,
    assetIds,
    linkedNoteIds,
  };
}

/** ProseMirror doc with one asset mention and one non-asset mention. */
function docWithMentions(assetIds: string[], nonAssetIds: { type: string; id: string }[] = []) {
  const content = [
    ...assetIds.map((id) => ({
      type: "mention",
      attrs: { entityType: "asset", entityId: id, label: `Asset ${id}` },
    })),
    ...nonAssetIds.map(({ type, id }) => ({
      type: "mention",
      attrs: { entityType: type, entityId: id, label: `${type} ${id}` },
    })),
  ];
  return {
    type: "doc",
    content: [{ type: "paragraph", content }],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  // Default update mock — just returns a minimal log.
  mockUpdate.mockResolvedValue({ id: "log1", assetIds: [] } as any);
});

// ─────────────────────────────────────────────────────────
describe("PUT /api/work-logs/[id] — mention-asset merge", () => {

  // ── 401 ───────────────────────────────────────────────

  it("401 — unauthenticated request", async () => {
    mockGetUserId.mockResolvedValue(null);
    const [req, ctx] = makeRequest("log1", { contentJson: docWithMentions(["a1"]) });

    const res = await PUT(req, ctx);

    expect(res.status).toBe(401);
  });

  // ── mention IDs unioned with existing assetIds ────────

  it("unions asset mention IDs with existing assetIds when no explicit assetIds in body", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockFindFirst.mockResolvedValue(existingLog(["manual-1"]) as any);

    const [req, ctx] = makeRequest("log1", {
      contentJson: docWithMentions(["mention-a2"]),
    });
    await PUT(req, ctx);

    const updateData = mockUpdate.mock.calls[0][0].data as Record<string, unknown>;
    expect(updateData.assetIds).toEqual(expect.arrayContaining(["manual-1", "mention-a2"]));
    expect((updateData.assetIds as string[]).length).toBe(2);
  });

  it("skip-if-equal: omits assetIds from updateData when extracted set matches existing (ADR-0016)", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockFindFirst.mockResolvedValue(existingLog(["a1"]) as any);

    const [req, ctx] = makeRequest("log1", {
      contentJson: docWithMentions(["a1"]), // same ID mentioned inline
    });
    await PUT(req, ctx);

    const updateData = mockUpdate.mock.calls[0][0].data as Record<string, unknown>;
    // ADR-0016: when extracted set is set-equal to existing, omit the column
    // entirely to skip the GIN write on autosave.
    expect(updateData).not.toHaveProperty("assetIds");
  });

  // ── explicit body.assetIds + mentions → full union ────

  it("unions explicit body.assetIds with mention IDs", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockFindFirst.mockResolvedValue(existingLog(["old-1"]) as any);

    const [req, ctx] = makeRequest("log1", {
      assetIds: ["explicit-a2"],
      contentJson: docWithMentions(["mention-a3"]),
    });
    await PUT(req, ctx);

    const updateData = mockUpdate.mock.calls[0][0].data as Record<string, unknown>;
    const stored = updateData.assetIds as string[];
    // explicit-a2 is the base (body.assetIds), mention-a3 is unioned on top.
    // old-1 is NOT present because body.assetIds overrides the existing base.
    expect(stored).toEqual(expect.arrayContaining(["explicit-a2", "mention-a3"]));
    expect(stored).not.toContain("old-1");
  });

  // ── non-asset mentions do not trigger assetIds update ─

  it("does not include assetIds in updateData when contentJson has only non-asset mentions", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockFindFirst.mockResolvedValue(existingLog(["existing-1"]) as any);

    const [req, ctx] = makeRequest("log1", {
      contentJson: docWithMentions([], [
        { type: "skill",   id: "s1" },
        { type: "contact", id: "co1" },
      ]),
    });
    await PUT(req, ctx);

    const updateData = mockUpdate.mock.calls[0][0].data as Record<string, unknown>;
    expect(updateData).not.toHaveProperty("assetIds");
  });

  // ── no contentJson in body → assetIds untouched ───────

  it("does not include assetIds in updateData when contentJson is absent from body", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockFindFirst.mockResolvedValue(existingLog(["existing-1"]) as any);

    const [req, ctx] = makeRequest("log1", { title: "Updated title" });
    await PUT(req, ctx);

    const updateData = mockUpdate.mock.calls[0][0].data as Record<string, unknown>;
    expect(updateData).not.toHaveProperty("assetIds");
  });

  // ── explicit body.assetIds alone (no contentJson) ─────

  it("stores explicit body.assetIds as-is when no contentJson in body", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockFindFirst.mockResolvedValue(existingLog(["old-1"]) as any);

    const [req, ctx] = makeRequest("log1", { assetIds: ["new-a1", "new-a2"] });
    await PUT(req, ctx);

    const updateData = mockUpdate.mock.calls[0][0].data as Record<string, unknown>;
    expect(updateData.assetIds).toEqual(["new-a1", "new-a2"]);
  });

  // ── multiple asset mentions across paragraphs ─────────

  it("collects asset mentions from multiple paragraphs and unions with existing", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockFindFirst.mockResolvedValue(existingLog([]) as any);

    const multiParaDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "mention", attrs: { entityType: "asset", entityId: "a1", label: "Pump A" } },
          ],
        },
        {
          type: "paragraph",
          content: [
            { type: "mention", attrs: { entityType: "asset", entityId: "a2", label: "Valve B" } },
          ],
        },
      ],
    };

    const [req, ctx] = makeRequest("log1", { contentJson: multiParaDoc });
    await PUT(req, ctx);

    const updateData = mockUpdate.mock.calls[0][0].data as Record<string, unknown>;
    const stored = updateData.assetIds as string[];
    expect(stored).toHaveLength(2);
    expect(stored).toContain("a1");
    expect(stored).toContain("a2");
  });
});

// ────────────────────────────────────────────────────
// ADR-0016 — linkedNoteIds + self-loop + skip-if-equal
// ────────────────────────────────────────────────────

function emptyDoc() {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

describe("PUT /api/work-logs/[id] — ADR-0016 linkedNoteIds", () => {
  it("populates linkedNoteIds from @n: mentions on save", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockFindFirst.mockResolvedValue(existingLog([], []) as any);

    const [req, ctx] = makeRequest("log1", {
      contentJson: docWithMentions([], [{ type: "worklog", id: "log-other" }]),
    });
    await PUT(req, ctx);

    const updateData = mockUpdate.mock.calls[0][0].data as Record<string, unknown>;
    expect(updateData.linkedNoteIds).toEqual(["log-other"]);
  });

  it("self-loop guard: filters current log id from linkedNoteIds at write time", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockFindFirst.mockResolvedValue(existingLog([], []) as any);

    const [req, ctx] = makeRequest("log1", {
      // Doc references the note being edited (paste/copy edge case bypassing picker).
      contentJson: docWithMentions([], [{ type: "worklog", id: "log1" }]),
    });
    await PUT(req, ctx);

    const updateData = mockUpdate.mock.calls[0][0].data as Record<string, unknown>;
    if ("linkedNoteIds" in updateData) {
      expect(updateData.linkedNoteIds).not.toContain("log1");
      expect(updateData.linkedNoteIds).toEqual([]);
    }
    // If skip-if-equal omitted the column entirely, that's also fine — the
    // guarantee is that "log1" is never persisted into linkedNoteIds.
  });

  it("skip-if-equal: omits linkedNoteIds when extracted set matches existing", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockFindFirst.mockResolvedValue(existingLog([], ["log-other"]) as any);

    const [req, ctx] = makeRequest("log1", {
      contentJson: docWithMentions([], [{ type: "worklog", id: "log-other" }]),
    });
    await PUT(req, ctx);

    const updateData = mockUpdate.mock.calls[0][0].data as Record<string, unknown>;
    expect(updateData).not.toHaveProperty("linkedNoteIds");
  });

  it("replacement semantic: clears linkedNoteIds when chip is removed from doc", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockFindFirst.mockResolvedValue(existingLog([], ["log-old"]) as any);

    // contentJson saved with NO worklog mentions — link should clear, not persist.
    const [req, ctx] = makeRequest("log1", { contentJson: emptyDoc() });
    await PUT(req, ctx);

    const updateData = mockUpdate.mock.calls[0][0].data as Record<string, unknown>;
    expect(updateData.linkedNoteIds).toEqual([]);
  });

  it("does not touch linkedNoteIds when contentJson is absent from body", async () => {
    mockGetUserId.mockResolvedValue("u1");
    mockFindFirst.mockResolvedValue(existingLog([], ["log-old"]) as any);

    const [req, ctx] = makeRequest("log1", { title: "new title" });
    await PUT(req, ctx);

    const updateData = mockUpdate.mock.calls[0][0].data as Record<string, unknown>;
    expect(updateData).not.toHaveProperty("linkedNoteIds");
  });
});
