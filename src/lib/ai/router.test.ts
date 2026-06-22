import { describe, it, expect, vi } from "vitest";
import { Router, type RoutingTable } from "./router";
import type { AIProvider, AIRequest, AITaskClass, ProviderId } from "./types";

function mockProvider(
  id: ProviderId,
  supportedTasks: AITaskClass[],
  outcome: "ok" | "throw"
): AIProvider & { generate: ReturnType<typeof vi.fn> } {
  const supported = new Set(supportedTasks);
  return {
    id,
    supports: (t) => supported.has(t),
    generate: vi.fn(async () => {
      if (outcome === "throw") throw new Error(`${id} failed`);
      return { text: `${id} ok`, provider: id, model: "mock" };
    }),
  };
}

const baseReq = (overrides: Partial<AIRequest> = {}): AIRequest => ({
  task: "chat",
  messages: [{ role: "user", content: "hi" }],
  ...overrides,
});

describe("Router.generate", () => {
  it("picks the first provider in the routing table that supports the task", async () => {
    const a = mockProvider("ollama", ["chat"], "ok");
    const b = mockProvider("gemini-fast", ["chat"], "ok");
    const r = new Router([a, b], { chat: ["ollama", "gemini-fast"] });
    const res = await r.generate(baseReq());
    expect(res.provider).toBe("ollama");
    expect(b.generate).not.toHaveBeenCalled();
  });

  it("falls back to the next provider when the first throws", async () => {
    const a = mockProvider("ollama", ["chat"], "throw");
    const b = mockProvider("gemini-fast", ["chat"], "ok");
    const r = new Router([a, b], { chat: ["ollama", "gemini-fast"] });
    const res = await r.generate(baseReq());
    expect(res.provider).toBe("gemini-fast");
    expect(a.generate).toHaveBeenCalledOnce();
  });

  it("skips providers that do not support the task", async () => {
    const a = mockProvider("ollama", ["chat"], "ok"); // does not support "ground"
    const b = mockProvider("gemini-fast", ["ground"], "ok");
    const table: RoutingTable = { ground: ["ollama", "gemini-fast"] };
    const res = await new Router([a, b], table).generate(baseReq({ task: "ground" }));
    expect(res.provider).toBe("gemini-fast");
    expect(a.generate).not.toHaveBeenCalled();
  });

  it("throws when no registered provider can serve the task", async () => {
    const a = mockProvider("ollama", ["chat"], "ok");
    const r = new Router([a], { reason: ["gemini-pro"] });
    await expect(r.generate(baseReq({ task: "reason" }))).rejects.toThrow(/not registered/);
  });

  it("honours providerOverride and bypasses the routing table", async () => {
    const a = mockProvider("ollama", ["chat"], "ok");
    const b = mockProvider("gemini-fast", ["chat"], "ok");
    const r = new Router([a, b], { chat: ["ollama", "gemini-fast"] });
    const res = await r.generate(baseReq({ providerOverride: "gemini-fast" }));
    expect(res.provider).toBe("gemini-fast");
    expect(a.generate).not.toHaveBeenCalled();
  });

  it("propagates the last error when every provider in the chain fails", async () => {
    const a = mockProvider("ollama", ["chat"], "throw");
    const b = mockProvider("gemini-fast", ["chat"], "throw");
    const r = new Router([a, b], { chat: ["ollama", "gemini-fast"] });
    await expect(r.generate(baseReq())).rejects.toThrow(/gemini-fast failed/);
  });

  it("emits onUsage hook when the provider reports usage", async () => {
    const provider: AIProvider = {
      id: "ollama",
      supports: () => true,
      generate: async () => ({
        text: "ok",
        provider: "ollama",
        model: "mock",
        usage: { promptTokens: 5, completionTokens: 7, provider: "ollama", model: "mock" },
      }),
    };
    const onUsage = vi.fn();
    const r = new Router([provider], { chat: ["ollama"] });
    await r.generate(baseReq({ onUsage }));
    expect(onUsage).toHaveBeenCalledWith({
      promptTokens: 5,
      completionTokens: 7,
      provider: "ollama",
      model: "mock",
    });
  });
});
