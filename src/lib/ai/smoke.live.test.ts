/**
 * ADR-0044 Day 5 — LIVE network smoke. Same scenarios as `smoke.test.ts` but
 * hits real Ollama (localhost) + real Google Gemini. Gated by an env flag so
 * `npm test` stays deterministic. Run manually:
 *
 *     $env:RUN_LIVE_SMOKE_AI = "1"; npm test -- --run src/lib/ai/smoke.live.test.ts
 *
 * Acceptance for each test is intentionally loose: EITHER a real success OR
 * an `AIProviderError` whose `status` matches the expected unavailable-service
 * code (503 for missing Ollama / missing API key, 429 for quota exhaustion).
 * That way the smoke run still exercises both the happy path AND the
 * provider-error path on the lab box; only unexpected exceptions fail it.
 */
import { describe, it, expect } from "vitest";
import { ai } from "./router";
import { AIProviderError } from "./errors";

const RUN_LIVE = process.env.RUN_LIVE_SMOKE_AI === "1";

// Live calls — especially Ollama with a 17GB gemma4:26b cold-start, and
// Gemini under retry — routinely exceed vitest's 5s default. 60s per test
// is generous enough for cold-start while still bounding accidental hangs.
const LIVE_TIMEOUT = 60_000;

function isAcceptableProviderError(err: unknown): err is AIProviderError {
  if (!(err instanceof AIProviderError)) return false;
  // 503 = service not reachable (no Ollama, no GEMINI_API_KEY).
  // 429 = quota exhausted — still proves the error path.
  return err.status === 503 || err.status === 429;
}

async function expectGreenOrAcceptableError(
  label: string,
  run: () => Promise<unknown>
): Promise<void> {
  try {
    const res = await run();
    console.log(`[live-smoke ✓] ${label}:`, summarize(res));
  } catch (err) {
    if (isAcceptableProviderError(err)) {
      console.log(
        `[live-smoke ~] ${label}: ${err.providerId} reported status=${err.status}` +
          (err.retryAfter ? ` (retryAfter=${err.retryAfter}s)` : "") +
          ` — accepted as expected error-path coverage.`
      );
      return;
    }
    throw err;
  }
}

function summarize(res: unknown): string {
  if (!res || typeof res !== "object") return String(res);
  const r = res as Record<string, unknown>;
  const usage = r.usage as Record<string, unknown> | undefined;
  return JSON.stringify({
    provider: r.provider,
    model: r.model,
    hasText: typeof r.text === "string" && r.text.length > 0,
    hasJson: r.json !== undefined,
    hasStream: r.stream !== undefined,
    usage: usage
      ? { p: usage.promptTokens, c: usage.completionTokens }
      : undefined,
  });
}

describe.skipIf(!RUN_LIVE)("ai.generate — Day 5 LIVE network smoke", () => {
  it(
    "chat — real provider (Ollama → Gemini fallback)",
    async () => {
      await expectGreenOrAcceptableError("chat", () =>
        ai.generate({
          task: "chat",
          messages: [
            { role: "system", content: "Reply with exactly the word: pong." },
            { role: "user", content: "ping" },
          ],
        })
      );
    },
    LIVE_TIMEOUT
  );

  it(
    "extract — real provider (Ollama → Gemini fallback)",
    async () => {
      await expectGreenOrAcceptableError("extract", () =>
        ai.generate({
          task: "extract",
          messages: [
            {
              role: "system",
              content:
                'Return JSON only of shape {"city":string,"state":string}. No prose.',
            },
            { role: "user", content: "Philadelphia, PA" },
          ],
        })
      );
    },
    LIVE_TIMEOUT
  );

  it(
    "ground — real provider (Gemini only, Google Search grounding)",
    async () => {
      await expectGreenOrAcceptableError("ground", () =>
        ai.generate({
          task: "ground",
          messages: [
            {
              role: "system",
              content:
                'Return JSON only of shape {"answer":string}. No prose.',
            },
            { role: "user", content: "Who is the current CEO of Microsoft?" },
          ],
        })
      );
    },
    LIVE_TIMEOUT
  );

  it(
    "reason — real provider (gemini-pro only)",
    async () => {
      await expectGreenOrAcceptableError("reason", () =>
        ai.generate({
          task: "reason",
          messages: [
            {
              role: "system",
              content:
                'Return JSON only of shape {"answer":number}. Compute carefully.',
            },
            { role: "user", content: "What is 7 * 8?" },
          ],
        })
      );
    },
    LIVE_TIMEOUT
  );

  it(
    "summarize — real provider (Ollama → Gemini fallback)",
    async () => {
      await expectGreenOrAcceptableError("summarize", () =>
        ai.generate({
          task: "summarize",
          messages: [
            { role: "system", content: "Summarize in one short sentence." },
            {
              role: "user",
              content:
                "Resumsify is a job-tracking app for Sory. It manages worklogs, jobs, and persona contacts on a personal timeline.",
            },
          ],
        })
      );
    },
    LIVE_TIMEOUT
  );
});
