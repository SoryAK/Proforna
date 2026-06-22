import { describe, expect, it } from "vitest";

import type { AIResponse } from "./types";

import {
  type AIEnvelope,
  type AIMeta,
  isAIEnvelope,
  toAIEnvelope,
  unwrapAIEnvelope,
} from "./envelope";

/**
 * Hermetic coverage for the envelope helpers introduced by ADR-0045.
 *
 * Design intent (locked):
 *  - `toAIEnvelope` is a pure transform — no clocks, no fetches, no side effects.
 *  - `isAIEnvelope` is a structural guard with no runtime imports of the shape it checks.
 *  - `unwrapAIEnvelope` is the bare-value fallback that lets `useAIQuery` keep working
 *    against routes that have not yet been migrated to the envelope. This is the
 *    *only* reason bare values get a graceful path — once Day 2 lands, every AI
 *    route returns an envelope and the fallback is dead code (kept for forward
 *    safety, not feature support).
 */

const fakeResult: Pick<AIResponse<unknown>, "provider" | "model" | "usage"> = {
  provider: "gemini-fast",
  model: "gemini-2.0-flash-lite",
  usage: {
    provider: "gemini-fast",
    model: "gemini-2.0-flash-lite",
    promptTokens: 312,
    completionTokens: 87,
  },
};

describe("toAIEnvelope", () => {
  it("wraps data under `data` and provenance under `_ai`", () => {
    const env = toAIEnvelope({ title: "Software Engineer" }, fakeResult, 947);

    expect(env).toEqual<AIEnvelope<{ title: string }>>({
      data: { title: "Software Engineer" },
      _ai: {
        provider: "gemini-fast",
        model: "gemini-2.0-flash-lite",
        usage: fakeResult.usage,
        durationMs: 947,
      },
    });
  });

  it("preserves the data reference (does not deep clone)", () => {
    const data = { items: [1, 2, 3] };
    const env = toAIEnvelope(data, fakeResult, 50);

    expect(env.data).toBe(data);
  });

  it("accepts a missing usage field (provider did not report tokens)", () => {
    const env = toAIEnvelope("plain text", { provider: "ollama", model: "gemma4:26b" }, 1400);

    expect(env._ai.usage).toBeUndefined();
    expect(env._ai.provider).toBe("ollama");
    expect(env._ai.durationMs).toBe(1400);
  });

  it("accepts string payloads (summarize/text task shape)", () => {
    const env = toAIEnvelope("the executive summary", fakeResult, 200);

    expect(env.data).toBe("the executive summary");
  });
});

describe("isAIEnvelope", () => {
  it("returns true for a well-formed envelope", () => {
    const env: AIEnvelope<{ k: number }> = {
      data: { k: 1 },
      _ai: { provider: "ollama", model: "gemma4:26b", durationMs: 100 },
    };

    expect(isAIEnvelope(env)).toBe(true);
  });

  it("returns false for bare data (no `_ai` field)", () => {
    expect(isAIEnvelope({ title: "x" })).toBe(false);
  });

  it("returns false for null and primitives", () => {
    expect(isAIEnvelope(null)).toBe(false);
    expect(isAIEnvelope(undefined)).toBe(false);
    expect(isAIEnvelope("string")).toBe(false);
    expect(isAIEnvelope(42)).toBe(false);
    expect(isAIEnvelope(true)).toBe(false);
  });

  it("returns false when `_ai` is malformed (missing required fields)", () => {
    expect(isAIEnvelope({ data: {}, _ai: {} })).toBe(false);
    expect(isAIEnvelope({ data: {}, _ai: { provider: "ollama" } })).toBe(false);
    expect(isAIEnvelope({ data: {}, _ai: { provider: "ollama", model: "x" } })).toBe(false);
  });

  it("returns false when `_ai.durationMs` is a string (wire-format drift)", () => {
    expect(
      isAIEnvelope({
        data: {},
        _ai: { provider: "ollama", model: "x", durationMs: "100" },
      })
    ).toBe(false);
  });
});

describe("unwrapAIEnvelope", () => {
  it("splits an envelope into { data, ai }", () => {
    const meta: AIMeta = { provider: "ollama", model: "gemma4:26b", durationMs: 1400 };
    const env: AIEnvelope<{ k: string }> = { data: { k: "v" }, _ai: meta };

    const out = unwrapAIEnvelope<{ k: string }>(env);

    expect(out.data).toEqual({ k: "v" });
    expect(out.ai).toEqual(meta);
  });

  it("returns bare data with ai=undefined for legacy un-wrapped responses", () => {
    const out = unwrapAIEnvelope<{ items: number[] }>({ items: [1, 2] });

    expect(out.data).toEqual({ items: [1, 2] });
    expect(out.ai).toBeUndefined();
  });

  it("returns undefined data for undefined input (loading-state safety)", () => {
    const out = unwrapAIEnvelope<{ items: number[] }>(undefined);

    expect(out.data).toBeUndefined();
    expect(out.ai).toBeUndefined();
  });

  it("returns null data for null input (graceful for failed fetches)", () => {
    const out = unwrapAIEnvelope<unknown>(null);

    expect(out.data).toBeNull();
    expect(out.ai).toBeUndefined();
  });
});
