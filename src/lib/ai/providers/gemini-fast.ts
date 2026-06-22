import { getAIConfig } from "../config";
import { AIProviderError } from "../errors";
import type {
  AIProvider,
  AIRequest,
  AIResponse,
  AITaskClass,
  ChatMessage,
  ProviderId,
  TokenUsage,
} from "../types";

const SUPPORTED: ReadonlySet<AITaskClass> = new Set(["chat", "extract", "ground", "summarize"]);
// `reason` is intentionally absent — premium routing requires `gemini-pro` (Day 4).

/* ── Internal model-chain fallback (preserved from legacy lib/gemini.ts) ── */

/**
 * Build a deduplicated model chain ordered `[primary, ...fallbacks]`.
 * Used by both `GeminiFastProvider` and `GeminiProProvider` (ADR-0044 Day 4).
 */
export function modelChain(primary: string, fallbacks: readonly string[]): string[] {
  const seen = new Set<string>();
  const chain: string[] = [];
  for (const m of [primary, ...fallbacks]) {
    if (m && !seen.has(m)) {
      seen.add(m);
      chain.push(m);
    }
  }
  return chain;
}

/**
 * Parse Gemini's `usageMetadata` into the locked `TokenUsage` shape.
 * Returns `undefined` when the response omits usage (older models or stream final chunks).
 */
export function extractGeminiUsage(
  data: unknown,
  providerId: ProviderId,
  model: string
): TokenUsage | undefined {
  const meta = (data as { usageMetadata?: Record<string, unknown> } | null)?.usageMetadata;
  if (!meta) return undefined;
  const promptTokens = typeof meta.promptTokenCount === "number" ? meta.promptTokenCount : undefined;
  const completionTokens =
    typeof meta.candidatesTokenCount === "number" ? meta.candidatesTokenCount : undefined;
  if (promptTokens === undefined && completionTokens === undefined) return undefined;
  return { promptTokens, completionTokens, provider: providerId, model };
}

export interface GeminiRequest {
  systemInstruction?: { parts: { text: string }[] };
  contents: { role?: string; parts: { text: string }[] }[];
  generationConfig?: Record<string, unknown>;
  tools?: Array<Record<string, unknown>>;
}

export interface GeminiResult {
  res: Response;
  model: string;
}

/**
 * Call Gemini with automatic model fallback on 429 quota errors.
 * Returns the first successful response, or the last failed one.
 *
 * ADR-0044 Day 4: `models` is now an explicit arg so the pro-tier provider
 * can share this same retry loop with its own chain.
 */
export async function callGemini(
  body: GeminiRequest,
  models: readonly string[]
): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY ?? "";

  let lastRes: Response | null = null;
  let lastModel = models[0];

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { res, model };
    lastRes = res;
    lastModel = model;
    if (res.status === 429) {
      console.warn(`[gemini] ${model} quota exhausted, trying next…`);
      continue;
    }
    // Non-429 — stop trying.
    break;
  }
  return { res: lastRes!, model: lastModel };
}

/** Return a user-facing error message for a failed Gemini response. */
export async function geminiErrorMessage(
  res: Response
): Promise<{ message: string; retryAfter: number }> {
  const errText = await res.text().catch(() => "Gemini request failed");
  console.error("[gemini] Error:", errText);

  if (res.status !== 429) {
    return { message: "AI extraction failed", retryAfter: 0 };
  }

  let retrySeconds = 60;
  let isDailyQuota = false;
  const isZeroQuota = errText.includes("limit: 0");

  try {
    const errJson = JSON.parse(errText);
    const violations: Array<Record<string, string>> =
      errJson.error?.details?.find((d: Record<string, unknown>) =>
        d["@type"]?.toString().includes("QuotaFailure")
      )?.violations ?? [];
    isDailyQuota = violations.some((v) => v.quotaId?.includes("PerDay"));
    const retryInfo = errJson.error?.details?.find((d: Record<string, unknown>) =>
      d["@type"]?.toString().includes("RetryInfo")
    );
    if (retryInfo?.retryDelay) {
      retrySeconds = Math.ceil(parseFloat(retryInfo.retryDelay));
    }
  } catch {
    /* ignore parse errors */
  }

  const message = isZeroQuota
    ? "Gemini free tier quota is no longer available. Enable billing at https://aistudio.google.com or update GEMINI_MODEL."
    : isDailyQuota
      ? "Gemini daily quota exhausted across all models. Resets at midnight Pacific."
      : `AI rate limit reached. Please wait ~${retrySeconds}s and try again.`;

  return { message, retryAfter: retrySeconds };
}

/** Stream a chat completion from Gemini via SSE. */
export function geminiChat(
  apiKey: string,
  model: string,
  messages: ChatMessage[]
): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      try {
        const systemMsg = messages.find((m) => m.role === "system");
        const chatMessages = messages.filter((m) => m.role !== "system");
        const contents = chatMessages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

        const body: Record<string, unknown> = { contents };
        if (systemMsg) {
          body.systemInstruction = { parts: [{ text: systemMsg.content }] };
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => "Gemini request failed");
          controller.enqueue(`Error: ${text}`);
          controller.close();
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6);
            try {
              const json = JSON.parse(jsonStr);
              const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) controller.enqueue(text);
            } catch {
              /* skip */
            }
          }
        }
        controller.close();
      } catch (err) {
        controller.enqueue(`Error: ${err instanceof Error ? err.message : String(err)}`);
        controller.close();
      }
    },
  });
}

/* ── ADR-0044 provider class ── */

function toGeminiBody(
  messages: ChatMessage[]
): Pick<GeminiRequest, "contents" | "systemInstruction"> {
  const systemMsg = messages.find((m) => m.role === "system");
  const chatMessages = messages.filter((m) => m.role !== "system");
  const contents = chatMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const body: Pick<GeminiRequest, "contents" | "systemInstruction"> = { contents };
  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }
  return body;
}

export class GeminiFastProvider implements AIProvider {
  readonly id = "gemini-fast" as const;

  supports(task: AITaskClass): boolean {
    return SUPPORTED.has(task);
  }

  async generate<T = unknown>(req: AIRequest): Promise<AIResponse<T>> {
    const cfg = getAIConfig();
    if (!cfg.geminiApiKey) {
      throw new AIProviderError({
        message: "GEMINI_API_KEY is not set",
        status: 503,
        providerId: this.id,
      });
    }

    switch (req.task) {
      case "chat": {
        // Streaming bypasses the model chain (chains assume single-shot retries).
        const model = req.modelOverride ?? cfg.geminiModel;
        return {
          stream: geminiChat(cfg.geminiApiKey, model, req.messages),
          provider: this.id,
          model,
        };
      }

      case "extract":
      case "ground":
      case "summarize": {
        const body: GeminiRequest = { ...toGeminiBody(req.messages) } as GeminiRequest;
        if (req.task === "extract" || req.task === "ground") {
          body.generationConfig = { responseMimeType: "application/json" };
        }
        if (req.task === "ground") {
          body.tools = [{ google_search: {} }];
        }
        const chain = modelChain(
          process.env.GEMINI_MODEL || "gemini-2.0-flash-lite",
          ["gemini-2.0-flash-lite", "gemini-1.5-flash"]
        );
        const { res, model } = await callGemini(body, chain);
        if (!res.ok) {
          const err = await geminiErrorMessage(res);
          throw new AIProviderError({
            message: err.message,
            status: res.status,
            retryAfter: err.retryAfter,
            providerId: this.id,
          });
        }
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        const usage = extractGeminiUsage(data, this.id, model);
        if (req.task === "summarize") {
          return { text, provider: this.id, model, usage };
        }
        return { json: JSON.parse(text || "{}") as T, provider: this.id, model, usage };
      }

      default:
        throw new Error(`GeminiFastProvider does not support task: ${req.task}`);
    }
  }
}
