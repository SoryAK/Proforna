import { afterEach, describe, expect, it, vi } from "vitest";
import { completeOpenAiChat } from "./openai-compat";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("OpenAI-compatible complete", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("asks Ollama to unload after a local chat finishes", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        model: "qwen",
        choices: [{ message: { content: "ok" } }],
      }))
      .mockResolvedValueOnce(jsonResponse({}));
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

  it("drops json mode when the endpoint rejects it", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: "response_format is unsupported" } }, 400),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          model: "qwen",
          choices: [{ message: { content: "{\"ok\":true}" } }],
        }),
      );
    vi.stubGlobal("fetch", fetch);

    await expect(
      completeOpenAiChat({
        baseUrl: "http://127.0.0.1:11434/v1",
        apiKey: null,
        model: "qwen",
        messages: [{ role: "user", content: "hello" }],
      }),
    ).resolves.toEqual({ text: "{\"ok\":true}", model: "qwen" });

    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)).response_format).toEqual({
      type: "json_object",
    });
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body)).response_format).toBe(
      undefined,
    );
  });
});
