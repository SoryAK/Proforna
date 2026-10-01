import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCAL_BASE_URL,
  LLAMA_CPP_BASE_URL,
  OPENAI_BASE_URL,
  OPENROUTER_BASE_URL,
} from "./model-connection";
import {
  modelCountLabel,
  planModelOnboarding,
  presentModelId,
  preparePortRange,
  presentRangeHits,
  presentScanAddress,
} from "./model-onboarding";

const idleOllama = {
  id: "ollama" as const,
  reachable: false,
  models: [] as string[],
};
const idleLlamaCpp = {
  id: "llamacpp" as const,
  reachable: false,
  models: [] as string[],
};

describe("planModelOnboarding", () => {
  it("shows detected Ollama plus other local and cloud rows", () => {
    const planned = planModelOnboarding({
      locals: [
        { id: "ollama", reachable: true, models: ["llama3.2", "mistral"] },
        idleLlamaCpp,
      ],
    });
    expect(planned).toMatchObject({
      kind: "detected",
      providerId: "ollama",
      label: "Ollama",
      baseUrl: DEFAULT_LOCAL_BASE_URL,
      models: ["llama3.2", "mistral"],
      suggested: "llama3.2",
    });
    if (planned.kind !== "detected") return;
    expect(planned.providers.map((row) => row.id)).toEqual([
      "llamacpp",
      "openai",
      "openrouter",
      "other",
    ]);
    expect(planned.providers[0]).toMatchObject({
      id: "llamacpp",
      status: "missing",
      baseUrl: LLAMA_CPP_BASE_URL,
    });
  });

  it("falls back to named provider rows when nothing local is running", () => {
    expect(
      planModelOnboarding({ locals: [idleOllama, idleLlamaCpp] }),
    ).toEqual({
      kind: "catalog",
      providers: [
        {
          id: "ollama",
          label: "Ollama",
          hosting: "local",
          baseUrl: DEFAULT_LOCAL_BASE_URL,
          status: "missing",
          detail: "Not running on this machine.",
        },
        {
          id: "llamacpp",
          label: "llama.cpp",
          hosting: "local",
          baseUrl: LLAMA_CPP_BASE_URL,
          status: "missing",
          detail: "Not running on this machine.",
        },
        {
          id: "openai",
          label: "OpenAI",
          hosting: "cloud",
          baseUrl: OPENAI_BASE_URL,
          status: "needs-key",
          detail: "Add a key. Resume text would leave this machine.",
        },
        {
          id: "openrouter",
          label: "OpenRouter",
          hosting: "cloud",
          baseUrl: OPENROUTER_BASE_URL,
          status: "needs-key",
          detail: "Add a key. Resume text would leave this machine.",
        },
        {
          id: "other",
          label: "Other endpoint",
          hosting: "local",
          baseUrl: "",
          status: "configure",
          detail: "OpenAI-compatible URL on this machine or a host you trust.",
        },
      ],
    });
  });

  it("keeps a reachable local in the catalog when it listed no models", () => {
    const planned = planModelOnboarding({
      locals: [
        { id: "ollama", reachable: true, models: [] },
        idleLlamaCpp,
      ],
    });
    expect(planned.kind).toBe("catalog");
    if (planned.kind !== "catalog") return;
    expect(planned.providers[0]).toMatchObject({
      id: "ollama",
      status: "empty",
      detail: "Running, but it listed no models.",
    });
  });

  it("detects llama.cpp when Ollama is not running", () => {
    const planned = planModelOnboarding({
      locals: [
        idleOllama,
        { id: "llamacpp", reachable: true, models: ["qwen2.5"] },
      ],
    });
    expect(planned).toMatchObject({
      kind: "detected",
      providerId: "llamacpp",
      label: "llama.cpp",
      baseUrl: LLAMA_CPP_BASE_URL,
      suggested: "qwen2.5",
    });
    if (planned.kind !== "detected") return;
    expect(planned.providers[0]).toMatchObject({
      id: "ollama",
      status: "missing",
    });
  });

  it("keeps llama.cpp as a ready local row when Ollama is already detected", () => {
    const planned = planModelOnboarding({
      locals: [
        { id: "ollama", reachable: true, models: ["llama3.2"] },
        { id: "llamacpp", reachable: true, models: ["qwen2.5"] },
      ],
    });
    expect(planned.kind).toBe("detected");
    if (planned.kind !== "detected") return;
    expect(planned.providerId).toBe("ollama");
    expect(planned.providers[0]).toMatchObject({
      id: "llamacpp",
      status: "ready",
      detail: "qwen2.5 on this machine.",
      models: ["qwen2.5"],
    });
  });

  it("shows a GGUF filename instead of a filesystem path", () => {
    expect(
      presentModelId(
        "/home/skaba/.local/share/mba/model_hub/adapters/qwen/qwen3.8-27b/Qwen3.8-27B-Q6_K.gguf",
      ),
    ).toBe("Qwen3.8-27B-Q6_K.gguf");
  });

  it("keeps addresses that listed models and orders them by port", () => {
    expect(
      presentRangeHits([
        { baseUrl: DEFAULT_LOCAL_BASE_URL, models: ["llama3.2", "mistral"] },
        { baseUrl: LLAMA_CPP_BASE_URL, models: [" "] },
        { baseUrl: "http://127.0.0.1:8080/v1", models: ["qwen2.5"] },
      ]),
    ).toEqual([
      { baseUrl: "http://127.0.0.1:8080/v1", models: ["qwen2.5"] },
      { baseUrl: DEFAULT_LOCAL_BASE_URL, models: ["llama3.2", "mistral"] },
    ]);
    expect(presentScanAddress(DEFAULT_LOCAL_BASE_URL)).toBe("127.0.0.1:11434");
    expect(presentScanAddress(LLAMA_CPP_BASE_URL)).toBe("127.0.0.1:8080");
    expect(modelCountLabel(1)).toBe("1 model");
    expect(modelCountLabel(2)).toBe("2 models");
  });

  it("accepts a port range the occupant set", () => {
    expect(preparePortRange("800", "11434")).toEqual({ ok: true, from: 800, to: 11434 });
    expect(preparePortRange("11434", "800")).toEqual({ ok: false, error: "range-backwards" });
    expect(preparePortRange("0", "80")).toEqual({ ok: false, error: "port-invalid" });
    expect(preparePortRange("", "80")).toEqual({ ok: false, error: "port-invalid" });
  });

  it("suggests a chat model ahead of an embedding model", () => {
    expect(
      planModelOnboarding({
        locals: [
          {
            id: "ollama",
            reachable: true,
            models: ["nomic-embed-text:latest", "qwen3.8:27b"],
          },
          idleLlamaCpp,
        ],
      }),
    ).toMatchObject({
      kind: "detected",
      suggested: "qwen3.8:27b",
    });
  });
});
