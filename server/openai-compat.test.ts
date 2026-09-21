import { afterEach, describe, expect, it, vi } from "vitest";
import { completeOpenAiChat } from "./openai-compat";

describe("OpenAI-compatible complete", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("asks Ollama to unload after a local chat finishes", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: "qwen",
          choices: [{ message: { content: "ok" } }],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetch);

    await expect(
      completeOpenAiChat({
        baseUrl: "http://127.0.0.1:11434/v1",
        apiKey: null,
        model: "qwen3.8:27b",
        messages: [{ role: "user", content: "hello" }],
        jsonObject: false,
        keepAlive: 0,
        contextTokens: 8192,
      }),
    ).resolves.toEqual({ text: "ok", model: "qwen" });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "http://127.0.0.1:11434/v1/chat/completions",
    );
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({
      keep_alive: 0,
      options: { num_ctx: 8192 },
    });
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)).response_format).toBe(
      undefined,
    );
    expect(fetch.mock.calls[1]?.[0]).toBe("http://127.0.0.1:11434/api/generate");
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({
      model: "qwen3.8:27b",
      keep_alive: 0,
    });
  });
});
