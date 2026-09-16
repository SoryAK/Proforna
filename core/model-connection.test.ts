import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCAL_BASE_URL,
  prepareModelConnection,
} from "./model-connection";

describe("prepareModelConnection", () => {
  it("accepts a local Ollama URL without a key or model", () => {
    expect(
      prepareModelConnection({
        hosting: "local",
        baseUrl: `${DEFAULT_LOCAL_BASE_URL}/`,
        model: "  ",
      }),
    ).toEqual({
      ok: true,
      value: {
        hosting: "local",
        baseUrl: DEFAULT_LOCAL_BASE_URL,
        model: "",
        apiKey: null,
      },
    });
  });

  it("requires a key for cloud hosting", () => {
    expect(
      prepareModelConnection({
        hosting: "cloud",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "  ",
      }),
    ).toEqual({ ok: false, error: "key-required" });
  });

  it("rejects a missing or non-http URL", () => {
    expect(prepareModelConnection({ hosting: "local" })).toEqual({
      ok: false,
      error: "url-required",
    });
    expect(
      prepareModelConnection({ hosting: "local", baseUrl: "ollama.local" }),
    ).toEqual({ ok: false, error: "url-invalid" });
  });
});
