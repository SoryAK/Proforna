import { getAIConfig } from "../config";
import { AIProviderError } from "../errors";
import {
  callGemini,
  extractGeminiUsage,
  geminiErrorMessage,
  modelChain,
  type GeminiRequest,
} from "./gemini-fast";
import type { AIProvider, AIRequest, AIResponse, AITaskClass, ChatMessage } from "../types";

const SUPPORTED: ReadonlySet<AITaskClass> = new Set(["reason"]);

/**
 * Premium-tier Gemini provider (ADR-0044 Day 4).
 *
 * Serves the `reason` task only. Premium routing intentionally has NO fast-tier
 * fallback in the default routing table \u2014 falling back would defeat the
 * "reach for the smarter model" intent. The model chain handles in-tier 429
 * retries against `gemini-2.5-pro` only (the 1.5 lineup was decommissioned
 * 2026-06; degrading to a fast-tier model on a reasoning task is worse than
 * surfacing the quota error).
 */
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

export class GeminiProProvider implements AIProvider {
  readonly id = "gemini-pro" as const;

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

    if (req.task !== "reason") {
      throw new AIProviderError({
        message: `GeminiProProvider does not support task: ${req.task}`,
        status: 400,
        providerId: this.id,
      });
    }

    const body: GeminiRequest = { ...toGeminiBody(req.messages) } as GeminiRequest;
    body.generationConfig = { responseMimeType: "application/json" };

    const chain = req.modelOverride
      ? [req.modelOverride]
      : modelChain(cfg.geminiProModel, ["gemini-2.5-pro"]);

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
    return { json: JSON.parse(text || "{}") as T, provider: this.id, model, usage };
  }
}
