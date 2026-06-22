import { describe, it, expect } from "vitest";
import { AIProviderError } from "./errors";

describe("AIProviderError", () => {
  it("is an Error subclass that carries status, retryAfter, providerId", () => {
    const err = new AIProviderError({
      message: "quota exhausted",
      status: 429,
      retryAfter: 60,
      providerId: "gemini-fast",
    });

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AIProviderError);
    expect(err.message).toBe("quota exhausted");
    expect(err.name).toBe("AIProviderError");
    expect(err.status).toBe(429);
    expect(err.retryAfter).toBe(60);
    expect(err.providerId).toBe("gemini-fast");
  });

  it("accepts message-only construction", () => {
    const err = new AIProviderError({ message: "boom" });
    expect(err.message).toBe("boom");
    expect(err.status).toBeUndefined();
    expect(err.retryAfter).toBeUndefined();
    expect(err.providerId).toBeUndefined();
  });

  it("survives instanceof checks after being re-thrown through async chains", async () => {
    async function inner() {
      throw new AIProviderError({
        message: "rate limit",
        status: 429,
        retryAfter: 30,
        providerId: "gemini-fast",
      });
    }

    async function outer() {
      try {
        await inner();
      } catch (e) {
        throw e;
      }
    }

    let caught: unknown;
    try {
      await outer();
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(AIProviderError);
    expect((caught as AIProviderError).status).toBe(429);
    expect((caught as AIProviderError).retryAfter).toBe(30);
  });
});
