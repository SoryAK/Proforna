/**
 * ADR-0044 Day 5 — hermetic smoke tests for the public `ai.generate()` façade.
 *
 * Layered above the existing per-provider unit tests (`gemini-fast.test`,
 * `gemini-pro.test`, `ollama.test`) and the per-router unit tests
 * (`router.test`). These exercise the END-TO-END path:
 *
 *     ai.generate({task}) → DEFAULT_ROUTING_TABLE → Router → Provider → fetch
 *
 * with `globalThis.fetch` stubbed per scenario so the suite stays deterministic
 * and free of network / quota dependencies. The companion `smoke.live.test.ts`
 * runs the same scenarios against real Ollama + Gemini under an env flag.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ai } from "./router";

/* ── Canned responses ── */

function ollamaTagsOk(): Response {
  return new Response(JSON.stringify({ models: [{ name: "llama3.2" }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function ollamaTagsFail(): Response {
  return new Response("not running", { status: 503 });
}

function ollamaChatJsonOk(content: string): Response {
  return new Response(
    JSON.stringify({
      message: { content },
      prompt_eval_count: 4,
      eval_count: 7,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function geminiOkJson(content: string): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: content }] } }],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

describe("ai.generate — Day 5 hermetic smoke (all five task classes)", () => {
  const origKey = process.env.GEMINI_API_KEY;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    if (origKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = origKey;
    fetchSpy.mockRestore();
  });

  it("chat → routes to Ollama and returns a stream when local is available", async () => {
    fetchSpy.mockImplementation(async (url: RequestInfo | URL) => {
      const s = String(url);
      if (s.includes("/api/tags")) return ollamaTagsOk();
      // Streaming chat builds a ReadableStream that lazily reads /api/chat —
      // not consumed during this assertion, so an empty Response is fine.
      if (s.includes("/api/chat")) return new Response("");
      throw new Error(`unexpected fetch: ${s}`);
    });
    const res = await ai.generate({
      task: "chat",
      messages: [{ role: "user", content: "ping" }],
    });
    expect(res.provider).toBe("ollama");
    expect(res.stream).toBeInstanceOf(ReadableStream);
  });

  it("extract → falls back to gemini-fast when Ollama is unavailable", async () => {
    fetchSpy.mockImplementation(async (url: RequestInfo | URL) => {
      const s = String(url);
      if (s.includes("/api/tags")) return ollamaTagsFail();
      if (s.includes("generativelanguage.googleapis.com")) {
        return geminiOkJson('{"name":"resume"}');
      }
      throw new Error(`unexpected fetch: ${s}`);
    });
    const res = await ai.generate<{ name: string }>({
      task: "extract",
      messages: [{ role: "user", content: "parse this" }],
    });
    expect(res.provider).toBe("gemini-fast");
    expect(res.json).toEqual({ name: "resume" });
    expect(res.usage?.promptTokens).toBe(5);
    expect(res.usage?.completionTokens).toBe(3);
  });

  it("ground → routes directly to gemini-fast (Ollama path is skipped by the table)", async () => {
    fetchSpy.mockImplementation(async (url: RequestInfo | URL) => {
      const s = String(url);
      if (s.includes("generativelanguage.googleapis.com")) {
        return geminiOkJson('{"news":["a"]}');
      }
      throw new Error(`unexpected fetch: ${s}`);
    });
    const res = await ai.generate<{ news: string[] }>({
      task: "ground",
      messages: [{ role: "user", content: "latest" }],
    });
    expect(res.provider).toBe("gemini-fast");
    expect(res.json).toEqual({ news: ["a"] });
    // The routing table must not even attempt Ollama for `ground`.
    const tagsCalls = fetchSpy.mock.calls.filter(
      (c: unknown[]) => String(c[0]).includes("/api/tags"),
    );
    expect(tagsCalls).toHaveLength(0);
  });

  it("reason → routes to gemini-pro and reports usage on the response", async () => {
    fetchSpy.mockImplementation(async (url: RequestInfo | URL) => {
      const s = String(url);
      if (s.includes("generativelanguage.googleapis.com")) {
        return geminiOkJson('{"reasoning":"done"}');
      }
      throw new Error(`unexpected fetch: ${s}`);
    });
    const res = await ai.generate<{ reasoning: string }>({
      task: "reason",
      messages: [{ role: "user", content: "why" }],
    });
    expect(res.provider).toBe("gemini-pro");
    expect(res.model).toContain("gemini-2.5-pro");
    expect(res.json).toEqual({ reasoning: "done" });
    expect(res.usage?.provider).toBe("gemini-pro");
    expect(res.usage?.promptTokens).toBe(5);
  });

  it("summarize → Ollama returns plain text + usage", async () => {
    fetchSpy.mockImplementation(async (url: RequestInfo | URL) => {
      const s = String(url);
      if (s.includes("/api/tags")) return ollamaTagsOk();
      if (s.includes("/api/chat")) return ollamaChatJsonOk("a brief summary");
      throw new Error(`unexpected fetch: ${s}`);
    });
    const res = await ai.generate({
      task: "summarize",
      messages: [{ role: "user", content: "tldr" }],
    });
    expect(res.provider).toBe("ollama");
    expect(res.text).toBe("a brief summary");
    expect(res.usage?.completionTokens).toBe(7);
  });

  it("onUsage callback fires end-to-end through the public façade", async () => {
    fetchSpy.mockImplementation(async (url: RequestInfo | URL) => {
      const s = String(url);
      if (s.includes("/api/tags")) return ollamaTagsFail(); // skip Ollama
      if (s.includes("generativelanguage.googleapis.com")) return geminiOkJson('{"ok":true}');
      throw new Error(`unexpected fetch: ${s}`);
    });
    const onUsage = vi.fn();
    await ai.generate({
      task: "extract",
      messages: [{ role: "user", content: "x" }],
      onUsage,
    });
    expect(onUsage).toHaveBeenCalledOnce();
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "gemini-fast",
        promptTokens: 5,
        completionTokens: 3,
      })
    );
  });
});
