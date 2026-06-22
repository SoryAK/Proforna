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
