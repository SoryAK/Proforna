import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GeminiProProvider } from "./gemini-pro";
import { AIProviderError } from "../errors";
import type { AIRequest } from "../types";

const baseReq = (overrides: Partial<AIRequest> = {}): AIRequest => ({
  task: "reason",
  messages: [
    { role: "system", content: "Return JSON only." },
    { role: "user", content: "What is 2+2?" },
  ],
  ...overrides,
});

function makeOkResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function makeErrResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GeminiProProvider", () => {
  const originalKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_PRO_MODEL;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_PRO_MODEL;
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.GEMINI_PRO_MODEL;
    else process.env.GEMINI_PRO_MODEL = originalModel;
    fetchSpy.mockRestore();
  });

  describe("supports()", () => {
    it("supports only the reason task", () => {
      const p = new GeminiProProvider();
      expect(p.supports("reason")).toBe(true);
      expect(p.supports("chat")).toBe(false);
      expect(p.supports("extract")).toBe(false);
      expect(p.supports("ground")).toBe(false);
      expect(p.supports("summarize")).toBe(false);
    });
  });

  describe("generate()", () => {
    it("throws AIProviderError with status 503 when GEMINI_API_KEY is missing", async () => {
      delete process.env.GEMINI_API_KEY;
      const p = new GeminiProProvider();
      await expect(p.generate(baseReq())).rejects.toMatchObject({
        name: "AIProviderError",
        status: 503,
        providerId: "gemini-pro",
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("returns parsed JSON + usage on success", async () => {
      fetchSpy.mockResolvedValueOnce(
        makeOkResponse({
          candidates: [{ content: { parts: [{ text: '{"answer":4}' }] } }],
          usageMetadata: {
            promptTokenCount: 12,
            candidatesTokenCount: 6,
            totalTokenCount: 18,
          },
        }) as never
      );
      const p = new GeminiProProvider();
      const res = await p.generate<{ answer: number }>(baseReq());
      expect(res.provider).toBe("gemini-pro");
      expect(res.model).toBe("gemini-2.5-pro");
      expect(res.json).toEqual({ answer: 4 });
      expect(res.usage).toEqual({
        promptTokens: 12,
        completionTokens: 6,
        provider: "gemini-pro",
        model: "gemini-2.5-pro",
      });
      expect(fetchSpy).toHaveBeenCalledOnce();
      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toContain("models/gemini-2.5-pro:generateContent");
      expect(calledUrl).toContain("key=test-key");
    });

    it("throws AIProviderError with status 429 + retryAfter on quota exhaustion across the whole chain", async () => {
      // Every model in the chain 429s — provider gives up and throws.
      fetchSpy.mockResolvedValue(
        makeErrResponse(429, {
          error: {
            details: [
              {
                "@type": "type.googleapis.com/google.rpc.RetryInfo",
                retryDelay: "30s",
              },
            ],
          },
        }) as never
      );
      const p = new GeminiProProvider();
      await expect(p.generate(baseReq())).rejects.toMatchObject({
        name: "AIProviderError",
        status: 429,
        providerId: "gemini-pro",
        retryAfter: 30,
      });
      // Chain has at least 2 distinct models — verifies fallback was attempted.
      expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it("falls back to the next model in the chain when the primary 429s, then succeeds", async () => {
      process.env.GEMINI_PRO_MODEL = "gemini-3.0-pro-experimental";
      fetchSpy
        .mockResolvedValueOnce(
          makeErrResponse(429, { error: { message: "quota" } }) as never
        )
        .mockResolvedValueOnce(
          makeOkResponse({
            candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
            usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2, totalTokenCount: 5 },
          }) as never
        );
      const p = new GeminiProProvider();
      const res = await p.generate<{ ok: boolean }>(baseReq());
      expect(res.json).toEqual({ ok: true });
      expect(res.model).toBe("gemini-2.5-pro");
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const firstUrl = fetchSpy.mock.calls[0][0] as string;
      const secondUrl = fetchSpy.mock.calls[1][0] as string;
      expect(firstUrl).toContain("models/gemini-3.0-pro-experimental:generateContent");
      expect(secondUrl).toContain("models/gemini-2.5-pro:generateContent");
    });
  });
});
