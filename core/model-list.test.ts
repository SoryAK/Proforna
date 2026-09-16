import { describe, expect, it } from "vitest";
import { parseDiscoveredModels } from "./model-list";

describe("parseDiscoveredModels", () => {
  it("reads OpenAI-style data[].id", () => {
    expect(
      parseDiscoveredModels({
        data: [{ id: "llama3.1:latest" }, { id: "mistral" }],
      }),
    ).toEqual(["llama3.1:latest", "mistral"]);
  });

  it("reads Ollama /api/tags models[].name", () => {
    expect(
      parseDiscoveredModels({
        models: [{ name: "qwen2.5" }, { name: "qwen2.5" }],
      }),
    ).toEqual(["qwen2.5"]);
  });
});
