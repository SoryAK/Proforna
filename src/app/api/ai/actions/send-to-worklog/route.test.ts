/**
 * Hermetic coverage for the `send-to-worklog` action route introduced by
 * ADR-0046 Phase D.2.
 *
 * Contract (v1 baseline — see ADR-0046 Phase D notes):
 *  - POST `{ content: string, title?: string }`
 *  - Always CREATES a new WorkLog. The ADR's "prepend to active worklog
 *    editor" UX is a client-side concern (URL `?ai-prepend=<base64>` flow)
 *    and is deliberately deferred to a polish pass after D.3 ships.
 *    Documented in the D.2 commit message.
 *  - Title defaults to "From AI Chat" + ISO date when not provided, or the
 *    first non-empty trimmed line of `content` (truncated at 80 chars)
 *    when the caller wants AI-derived titling.
 *  - 401 unauthenticated; 400 on blank content; 200 returns
 *    `{ id, title }` for the newly-created note.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  workLog: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { getUserId } from "@/lib/auth-utils";
import { POST } from "./route";

function req(body: unknown): Request {
  return new Request("http://localhost/api/ai/actions/send-to-worklog", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (getUserId as ReturnType<typeof vi.fn>).mockResolvedValue("u-test");
});

describe("POST /api/ai/actions/send-to-worklog — ADR-0046 Phase D.2", () => {
  it("returns 401 when unauthenticated", async () => {
    (getUserId as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const res = await POST(req({ content: "x" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when content is blank", async () => {
    const res = await POST(req({ content: "  \n " }));
    expect(res.status).toBe(400);
    expect(prismaMock.workLog.create).not.toHaveBeenCalled();
  });

  it("creates a new WorkLog with the provided title", async () => {
    prismaMock.workLog.create.mockImplementationOnce(({ data }: { data: { title: string; content: string; userId: string } }) =>
      Promise.resolve({ id: "wl-1", title: data.title, content: data.content }),
    );
    const res = await POST(req({ content: "Code block payload.", title: "Custom Title" }));
    expect(res.status).toBe(200);

    const createCall = prismaMock.workLog.create.mock.calls[0]?.[0] as {
      data: { title: string; content: string; userId: string };
    };
    expect(createCall.data.userId).toBe("u-test");
    expect(createCall.data.title).toBe("Custom Title");
    expect(createCall.data.content).toBe("Code block payload.");

    const data = (await res.json()) as { id: string; title: string };
    expect(data.id).toBe("wl-1");
    expect(data.title).toBe("Custom Title");
  });

  it("derives a title from the first non-empty content line when title is absent", async () => {
    prismaMock.workLog.create.mockImplementationOnce(({ data }: { data: { title: string; content: string } }) =>
      Promise.resolve({ id: "wl-1", title: data.title, content: data.content }),
    );
    const longFirstLine = "A".repeat(120);
    await POST(req({ content: `   \n${longFirstLine}\nsecond line` }));
    const createCall = prismaMock.workLog.create.mock.calls[0]?.[0] as {
      data: { title: string };
    };
    expect(createCall.data.title.length).toBeLessThanOrEqual(80);
    expect(createCall.data.title.startsWith("A")).toBe(true);
  });

  it("owner-scopes the new WorkLog to the authenticated user", async () => {
    prismaMock.workLog.create.mockImplementationOnce(({ data }: { data: { userId: string } }) =>
      Promise.resolve({ id: "wl-1", title: "x", userId: data.userId }),
    );
    await POST(req({ content: "hello" }));
    const createCall = prismaMock.workLog.create.mock.calls[0]?.[0] as {
      data: { userId: string };
    };
    expect(createCall.data.userId).toBe("u-test");
  });
});
