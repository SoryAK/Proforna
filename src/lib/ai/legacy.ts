import type { ChatMessage } from "./types";
import { getAIConfig } from "./config";
import { ollamaIsAvailable } from "./providers/ollama";

/**
 * @deprecated Use `ai.generate<T>({ task: "extract", messages })` from `@/lib/ai` instead.
 *
 * Will be removed at the end of Day 5 of the ADR-0044 migration sprint
 * (week of 2026-06-21) once `/api/cdm/synonyms` and `/api/cdm/decompose`
 * no longer call it.
 *
 * Behavior preserved bit-for-bit from the original `src/lib/ai.ts` so the
 * two CDM callers see zero drift during the migration window. Notably, this
 * does NOT use the `callGemini` model-chain fallback — it hits the
 * configured `geminiModel` once. Day 3 migration upgrades these callers
 * automatically by switching them to `ai.generate({ task: "extract" })`,
 * which goes through `GeminiFastProvider` and gets the 429-safe chain.
 */
export async function aiGenerateJSON<T = unknown>(messages: ChatMessage[]): Promise<T> {
  const cfg = getAIConfig();

  // Try Ollama first.
  if (await ollamaIsAvailable(cfg.ollamaUrl)) {
    const res = await fetch(`${cfg.ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.ollamaModel,
        messages,
        stream: false,
        format: "json",
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.message?.content ?? "";
      return JSON.parse(text) as T;
    }
  }

  // Fall back to Gemini (single-shot, no model chain — preserves legacy behavior).
  if (cfg.geminiApiKey) {
    const systemMsg = messages.find((m) => m.role === "system");
    const chatMessages = messages.filter((m) => m.role !== "system");
    const contents = chatMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const body: Record<string, unknown> = {
      contents,
      generationConfig: { responseMimeType: "application/json" },
    };
    if (systemMsg) {
      body.systemInstruction = { parts: [{ text: systemMsg.content }] };
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.geminiModel}:generateContent?key=${cfg.geminiApiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "Gemini request failed");
      throw new Error(`Gemini error: ${errText}`);
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    return JSON.parse(text) as T;
  }

  throw new Error("No AI provider available. Start Ollama or set GEMINI_API_KEY.");
}
