/**
 * Hermetic coverage for the GET /api/ai/models contract.
 *
 * The route's job is to report ONLY models that are actually reachable to
 * the chat panel — the picker must never surface a name that is not in the
 * live Ollama tag list. Before this test existed the route blindly returned
 * `defaultModel: process.env.OLLAMA_MODEL ?? "llama3.2"` regardless of
 * whether that model had been pulled, which caused the panel to auto-select
 * a phantom model and the chat route to POST it to Ollama for a guaranteed
 * 404. See session log 2026-06-22 for the live regression.
 *
 * Contract under test:
 *  - When Ollama is up AND the configured default IS in the pulled list,
 *    `defaultModel` echoes the configured name.
 *  - When Ollama is up AND the configured default is NOT in the pulled list,
 *    `defaultModel` falls back to the first pulled name.
 *  - When Ollama is up AND zero models are pulled, `defaultModel` is null
 *    and `available` is false (the daemon is up but the provider is not
 *    usable for chat — picker must hide it).
 *  - When Ollama is unreachable, `defaultModel` is null and `available` is
 *    false.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-utils", () => ({
  getUserId: vi.fn().mockResolvedValue("test-user-id"),
}));

const ollamaIsAvailableMock = vi.fn();
const ollamaModelsMock = vi.fn();
const getAIConfigMock = vi.fn();

vi.mock("@/lib/ai", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai")>("@/lib/ai");
  return {
    ...actual,
    ollamaIsAvailable: (...args: unknown[]) => ollamaIsAvailableMock(...args),
    ollamaModels: (...args: unknown[]) => ollamaModelsMock(...args),
    getAIConfig: () => getAIConfigMock(),
  };
});

import { GET } from "./route";

function makeRequest(url = "http://test.local/api/ai/models"): Request {
  return new Request(url);
}

function baseConfig() {
  return {
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "llama3.2",
    geminiApiKey: "",
    geminiModel: "gemini-2.0-flash",
    geminiProModel: "gemini-2.5-pro",
  };
}

describe("GET /api/ai/models — defaultModel reflects pulled list", () => {
  beforeEach(() => {
    ollamaIsAvailableMock.mockReset();
    ollamaModelsMock.mockReset();
    getAIConfigMock.mockReset();
    getAIConfigMock.mockReturnValue(baseConfig());
  });

  it("echoes the configured default when it IS in the pulled list", async () => {
    ollamaIsAvailableMock.mockResolvedValue(true);
    ollamaModelsMock.mockResolvedValue(["llama3.2", "gemma4:26b"]);
    getAIConfigMock.mockReturnValue({ ...baseConfig(), ollamaModel: "llama3.2" });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.ollama.available).toBe(true);
    expect(body.ollama.defaultModel).toBe("llama3.2");
  });

  it("falls back to the first pulled name when the configured default is NOT pulled", async () => {
    ollamaIsAvailableMock.mockResolvedValue(true);
    ollamaModelsMock.mockResolvedValue(["gemma4:26b", "qwen3-coder:30b"]);
    getAIConfigMock.mockReturnValue({ ...baseConfig(), ollamaModel: "llama3.2" });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.ollama.available).toBe(true);
    expect(body.ollama.defaultModel).toBe("gemma4:26b");
  });

  it("reports defaultModel=null and available=false when Ollama is up but zero models are pulled", async () => {
    ollamaIsAvailableMock.mockResolvedValue(true);
    ollamaModelsMock.mockResolvedValue([]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.ollama.available).toBe(false);
    expect(body.ollama.defaultModel).toBeNull();
    expect(body.models.filter((m: { provider: string }) => m.provider === "ollama")).toHaveLength(0);
  });

  it("reports defaultModel=null and available=false when Ollama is unreachable", async () => {
    ollamaIsAvailableMock.mockResolvedValue(false);
    ollamaModelsMock.mockResolvedValue([]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.ollama.available).toBe(false);
    expect(body.ollama.defaultModel).toBeNull();
  });

  it("never returns an ollama entry in `models[]` whose name is not in the live pulled list", async () => {
    // Regression guard: if `models[]` ever stops being built from
    // `ollamaModels()`, the picker will silently start offering phantom
    // names again.
    ollamaIsAvailableMock.mockResolvedValue(true);
    ollamaModelsMock.mockResolvedValue(["gemma4:26b", "qwen3-coder:30b"]);

    const res = await GET(makeRequest());
    const body = await res.json();

    const ollamaNames = body.models
      .filter((m: { provider: string }) => m.provider === "ollama")
      .map((m: { name: string }) => m.name);
    expect(ollamaNames).toEqual(["gemma4:26b", "qwen3-coder:30b"]);
  });

  it("filters chat-incapable models (e.g. nomic-embed-text) from defaultModel and models[]", async () => {
    // Embedding models are pulled into Ollama alongside chat models, but
    // they cannot serve `/api/chat`. The picker must hide them so it never
    // auto-selects one as the default (lethal because `nomic-embed-text`
    // sorts alphabetically before `gemma4:26b`).
    ollamaIsAvailableMock.mockResolvedValue(true);
    ollamaModelsMock.mockResolvedValue([
      "nomic-embed-text:latest",
      "gemma4:26b",
      "qwen3-coder:30b",
    ]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.ollama.available).toBe(true);
    expect(body.ollama.defaultModel).toBe("gemma4:26b");
    const ollamaNames = body.models
      .filter((m: { provider: string }) => m.provider === "ollama")
      .map((m: { name: string }) => m.name);
    expect(ollamaNames).toEqual(["gemma4:26b", "qwen3-coder:30b"]);
    expect(ollamaNames).not.toContain("nomic-embed-text:latest");
  });

  it("reports available=false when every pulled ollama model is chat-incapable", async () => {
    ollamaIsAvailableMock.mockResolvedValue(true);
    ollamaModelsMock.mockResolvedValue([
      "nomic-embed-text:latest",
      "all-minilm:latest",
    ]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.ollama.available).toBe(false);
    expect(body.ollama.defaultModel).toBeNull();
  });

  it("falls back to the first hardcoded gemini chat model when GEMINI_MODEL is not in the offered list", async () => {
    // Symmetrical regression: GEMINI_MODEL env defaults to
    // `gemini-2.0-flash-lite`, which is NOT in the picker's hardcoded
    // chat-model list. Before the fix, the route would echo the env value
    // as `gemini.defaultModel`, producing the same phantom-default UX bug
    // as the Ollama side.
    ollamaIsAvailableMock.mockResolvedValue(false);
    ollamaModelsMock.mockResolvedValue([]);
    getAIConfigMock.mockReturnValue({
      ...baseConfig(),
      geminiApiKey: "sk-test",
      geminiModel: "gemini-2.0-flash-lite",
    });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.gemini.available).toBe(true);
    expect(body.gemini.defaultModel).toBe("gemini-2.0-flash");
  });

  it("echoes GEMINI_MODEL as default when it IS in the offered chat list", async () => {
    ollamaIsAvailableMock.mockResolvedValue(false);
    ollamaModelsMock.mockResolvedValue([]);
    getAIConfigMock.mockReturnValue({
      ...baseConfig(),
      geminiApiKey: "sk-test",
      geminiModel: "gemini-2.5-flash",
    });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.gemini.defaultModel).toBe("gemini-2.5-flash");
  });
});
