/**
 * Hermetic coverage for the `save-as-bullet` action route introduced by
 * ADR-0046 Phase D.2.
 *
 * Contract:
 *  - POST `{ content: string, jobId: string }`
 *  - Appends `content` (trimmed) to `WorkHistory.accomplishments` — a
 *    JSON-array string of accomplishment lines. If the existing field is
 *    not valid JSON OR not an array, the existing value is wrapped:
 *    `[oldValue, newValue]`. If the field is null/blank, starts fresh:
 *    `[newValue]`. Duplicate exact strings are NOT inserted (no-op,
 *    returns 200 with the unchanged array).
 *  - 401 / 400 / 404 mirror add-to-job-notes.
 *  - 200 returns `{ id, accomplishments }`.
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
  return new Request("http://localhost/api/ai/actions/save-as-bullet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (getUserId as ReturnType<typeof vi.fn>).mockResolvedValue("u-test");
});

describe("POST /api/ai/actions/save-as-bullet — ADR-0046 Phase D.2", () => {
  it("returns 401 when unauthenticated", async () => {
    (getUserId as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const res = await POST(req({ content: "x", jobId: "j" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when content is blank", async () => {
    const res = await POST(req({ content: "   ", jobId: "j" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when jobId is missing", async () => {
    const res = await POST(req({ content: "Led migration." }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the job does not exist", async () => {
    prismaMock.workHistory.findUnique.mockResolvedValueOnce(null);
    const res = await POST(req({ content: "Led migration.", jobId: "missing" }));
    expect(res.status).toBe(404);
  });

  it("returns 404 on cross-user job", async () => {
    prismaMock.workHistory.findUnique.mockResolvedValueOnce({
      id: "j",
      userId: "u-other",
      accomplishments: null,
    });
    const res = await POST(req({ content: "Led migration.", jobId: "j" }));
    expect(res.status).toBe(404);
  });

  it("starts a fresh array when existing accomplishments is null", async () => {
    prismaMock.workHistory.findUnique.mockResolvedValueOnce({
      id: "j",
      userId: "u-test",
      accomplishments: null,
    });
    prismaMock.workHistory.update.mockImplementationOnce(({ data }: { data: { accomplishments: string } }) =>
      Promise.resolve({ id: "j", accomplishments: data.accomplishments }),
    );
    const res = await POST(req({ content: "Led migration.", jobId: "j" }));
    expect(res.status).toBe(200);
    const updateCall = prismaMock.workHistory.update.mock.calls[0]?.[0] as {
      data: { accomplishments: string };
    };
    expect(JSON.parse(updateCall.data.accomplishments)).toEqual([
      "Led migration.",
    ]);
  });

  it("appends to an existing JSON array", async () => {
    prismaMock.workHistory.findUnique.mockResolvedValueOnce({
      id: "j",
      userId: "u-test",
      accomplishments: JSON.stringify(["First."]),
    });
    prismaMock.workHistory.update.mockImplementationOnce(({ data }: { data: { accomplishments: string } }) =>
      Promise.resolve({ id: "j", accomplishments: data.accomplishments }),
    );
    const res = await POST(req({ content: "Second.", jobId: "j" }));
    expect(res.status).toBe(200);
    const updateCall = prismaMock.workHistory.update.mock.calls[0]?.[0] as {
      data: { accomplishments: string };
    };
    expect(JSON.parse(updateCall.data.accomplishments)).toEqual([
      "First.",
      "Second.",
    ]);
  });

  it("wraps non-array legacy values when appending", async () => {
    prismaMock.workHistory.findUnique.mockResolvedValueOnce({
      id: "j",
      userId: "u-test",
      accomplishments: "Old freeform text.",
    });
    prismaMock.workHistory.update.mockImplementationOnce(({ data }: { data: { accomplishments: string } }) =>
      Promise.resolve({ id: "j", accomplishments: data.accomplishments }),
    );
    const res = await POST(req({ content: "Second.", jobId: "j" }));
    expect(res.status).toBe(200);
    const updateCall = prismaMock.workHistory.update.mock.calls[0]?.[0] as {
      data: { accomplishments: string };
    };
    expect(JSON.parse(updateCall.data.accomplishments)).toEqual([
      "Old freeform text.",
      "Second.",
    ]);
  });

  it("is a no-op on duplicate strings (returns 200 unchanged)", async () => {
    prismaMock.workHistory.findUnique.mockResolvedValueOnce({
      id: "j",
      userId: "u-test",
      accomplishments: JSON.stringify(["First.", "Second."]),
    });
    const res = await POST(req({ content: "Second.", jobId: "j" }));
    expect(res.status).toBe(200);
    expect(prismaMock.workHistory.update).not.toHaveBeenCalled();
    const data = (await res.json()) as { accomplishments: string };
    expect(JSON.parse(data.accomplishments)).toEqual(["First.", "Second."]);
  });
});
