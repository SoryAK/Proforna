/**
 * Hermetic coverage for the chat route's task-forwarding contract
 * introduced by ADR-0045 Day 3.
 *
 * Scope:
 *  - `task` defaults to "chat" when omitted from the POST body.
 *  - Valid task ids ({chat, ground, reason, summarize}) are passed
 *    through verbatim to `ai.generate`.
 *  - Invalid task ids fall back to "chat" rather than 400/500.
 *
 * Intentionally NOT covered here:
 *  - Stream contents / SSE framing — owned by the router/provider layer.
 *  - Provider override semantics — owned by the router unit tests.
 *
 * The route is tested by mocking `ai.generate` and the auth helper so the
 * handler stays pure-fn from input to invocation shape.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn().mockResolvedValue("test-user-id"),
}));

const generateMock = vi.fn();

const prismaMock = vi.hoisted(() => ({
  entityAIMentionCount: {
    upsert: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/lib/ai", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai")>("@/lib/ai");
  return {
    ...actual,
    ai: { generate: (...args: unknown[]) => generateMock(...args) },
    ollamaIsAvailable: vi.fn().mockResolvedValue(true),
    ollamaChat: vi.fn(),
  };
});

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://test.local/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeStreamResult(provider = "gemini-fast") {
  return {
    provider,
    model: "test-model",
    stream: new ReadableStream<string>({
      start(controller) {
        controller.enqueue("hi");
        controller.close();
      },
    }),
  };
}

describe("POST /api/ai/chat — task forwarding", () => {
  beforeEach(() => {
    generateMock.mockReset();
    generateMock.mockResolvedValue(makeStreamResult());
    prismaMock.entityAIMentionCount.upsert.mockReset();
    prismaMock.entityAIMentionCount.upsert.mockResolvedValue({});
  });

  it("defaults task to 'chat' when omitted", async () => {
    await POST(makeRequest({ messages: [{ role: "user", content: "hello" }] }));
    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(generateMock.mock.calls[0][0]).toMatchObject({ task: "chat" });
  });

  it.each(["chat", "ground", "reason", "summarize"] as const)(
    "forwards valid task '%s' verbatim to ai.generate",
    async (task) => {
      await POST(
        makeRequest({ messages: [{ role: "user", content: "hi" }], task }),
      );
      expect(generateMock.mock.calls[0][0]).toMatchObject({ task });
    },
  );

  it("falls back to 'chat' for unknown task ids (no 400, no 500)", async () => {
    const res = await POST(
      makeRequest({
        messages: [{ role: "user", content: "hi" }],
        task: "haxxor-mode",
      }),
    );
    expect(res.status).toBe(200);
    expect(generateMock.mock.calls[0][0]).toMatchObject({ task: "chat" });
  });

  it("rejects an empty messages array with 400", async () => {
    const res = await POST(makeRequest({ messages: [] }));
    expect(res.status).toBe(400);
    expect(generateMock).not.toHaveBeenCalled();
  });
});

/**
 * ADR-0046 Phase C.2 — mention payload + count increment.
 *
 * Scope:
 *  - `mentions` (sidecar in the request body) trigger one `upsert` per unique
 *    `${type}:${id}` BEFORE the stream starts.
 *  - Deduplication is by `${type}:${id}` (not by label).
 *  - Invalid `type` values are silently dropped (no 400 — mentions are
 *    user-supplied UI data, not an auth gate; degraded gracefully).
 *  - A hidden system message carrying the structured JSON block is
 *    prepended to the messages array passed to `ai.generate`.
 *  - Absence of `mentions` is fully backward-compatible (no upsert call,
 *    no extra system message).
 */
describe("POST /api/ai/chat — mentions (ADR-0046 Phase C.2)", () => {
  beforeEach(() => {
    generateMock.mockReset();
    generateMock.mockResolvedValue(makeStreamResult());
    prismaMock.entityAIMentionCount.upsert.mockReset();
    prismaMock.entityAIMentionCount.upsert.mockResolvedValue({});
  });

  it("calls upsert once per unique mention with correct compound where", async () => {
    await POST(
      makeRequest({
        messages: [{ role: "user", content: "tell me about @Acme" }],
        mentions: [{ type: "job", id: "job-1", label: "Acme" }],
      }),
    );
    expect(prismaMock.entityAIMentionCount.upsert).toHaveBeenCalledTimes(1);
    const args = prismaMock.entityAIMentionCount.upsert.mock.calls[0][0];
    expect(args.where).toEqual({
      userId_entityType_entityId: {
        userId: "test-user-id",
        entityType: "job",
        entityId: "job-1",
      },
    });
    expect(args.update).toMatchObject({ count: { increment: 1 } });
    expect(args.update.lastMentionedAt).toBeInstanceOf(Date);
    expect(args.create).toMatchObject({
      userId: "test-user-id",
      entityType: "job",
      entityId: "job-1",
      count: 1,
    });
  });

  it("deduplicates by ${type}:${id} within a single request", async () => {
    await POST(
      makeRequest({
        messages: [{ role: "user", content: "@Acme @Acme @Beta" }],
        mentions: [
          { type: "job", id: "job-1", label: "Acme" },
          { type: "job", id: "job-1", label: "Acme" },
          { type: "skill", id: "skill-1", label: "Beta" },
        ],
      }),
    );
    expect(prismaMock.entityAIMentionCount.upsert).toHaveBeenCalledTimes(2);
    const calledIds = prismaMock.entityAIMentionCount.upsert.mock.calls.map(
      (c) =>
        `${c[0].where.userId_entityType_entityId.entityType}:${c[0].where.userId_entityType_entityId.entityId}`,
    );
    expect(calledIds.sort()).toEqual(["job:job-1", "skill:skill-1"]);
  });

  it("silently drops mentions with invalid entityType (no 400, no upsert)", async () => {
    const res = await POST(
      makeRequest({
        messages: [{ role: "user", content: "hi" }],
        mentions: [
          { type: "haxxor", id: "x", label: "X" },
          { type: "job", id: "job-1", label: "Acme" },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.entityAIMentionCount.upsert).toHaveBeenCalledTimes(1);
    expect(
      prismaMock.entityAIMentionCount.upsert.mock.calls[0][0].where
        .userId_entityType_entityId.entityType,
    ).toBe("job");
  });

  it("is backward-compatible when mentions field is absent", async () => {
    await POST(
      makeRequest({ messages: [{ role: "user", content: "hi" }] }),
    );
    expect(prismaMock.entityAIMentionCount.upsert).not.toHaveBeenCalled();
    const passedMessages = generateMock.mock.calls[0][0].messages;
    // No mention system message should be injected.
    const mentionSystem = passedMessages.find(
      (m: { role: string; content: string }) =>
        m.role === "system" && m.content.includes("Resumsify mentions"),
    );
    expect(mentionSystem).toBeUndefined();
  });

  it("prepends a hidden system message with the JSON mention block", async () => {
    await POST(
      makeRequest({
        messages: [{ role: "user", content: "tell me about @Acme" }],
        mentions: [{ type: "job", id: "job-1", label: "Acme" }],
      }),
    );
    const passedMessages = generateMock.mock.calls[0][0].messages;
    const mentionSystem = passedMessages.find(
      (m: { role: string; content: string }) =>
        m.role === "system" && m.content.includes("Resumsify mentions"),
    );
    expect(mentionSystem).toBeDefined();
    // Must be the first message so the model sees it before any user text.
    expect(passedMessages[0]).toBe(mentionSystem);
    // Content carries the structured JSON block (validated by parsability).
    const jsonStart = mentionSystem!.content.indexOf("[");
    const parsed = JSON.parse(mentionSystem!.content.slice(jsonStart));
    expect(parsed).toEqual([{ type: "job", id: "job-1", label: "Acme" }]);
  });

  it("does not throw when upsert rejects (best-effort ranking write)", async () => {
    prismaMock.entityAIMentionCount.upsert.mockRejectedValueOnce(
      new Error("simulated DB outage"),
    );
    const res = await POST(
      makeRequest({
        messages: [{ role: "user", content: "hi" }],
        mentions: [{ type: "job", id: "job-1", label: "Acme" }],
      }),
    );
    // Stream still opens even though the ranking write failed.
    expect(res.status).toBe(200);
    expect(generateMock).toHaveBeenCalled();
  });
});
