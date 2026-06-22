import { NextResponse } from "next/server";
import { getAIConfig, ollamaIsAvailable, ollamaModels } from "@/lib/ai";
import { getUserId } from "@/lib/auth-utils";

/**
 * GET /api/ai/models
 *
 * Returns available AI models and status for each provider.
 *
 * Contract (2026-06-22, after the "llama3.2 phantom" regression):
 *  - `ollama.available` is `true` ONLY when the daemon is reachable AND at
 *    least one CHAT-CAPABLE model is pulled. A reachable daemon with only
 *    embed models (e.g. `nomic-embed-text`) is not usable for chat — the
 *    picker hides Ollama and falls back to Gemini.
 *  - `ollama.defaultModel` is guaranteed to be a member of the live pulled
 *    list AND chat-capable, or `null` when no usable model exists. The chat
 *    panel uses this to auto-select; returning an unpulled or embed-only
 *    name round-trips into Ollama as a 404 or capability error.
 *  - `gemini.defaultModel` is guaranteed to be a member of the same
 *    `GEMINI_CHAT_MODELS` list the picker renders, never the raw env value.
 */

/**
 * Hardcoded list of Gemini chat models surfaced to the picker. Keep in
 * sync with the `<SelectItem>` list in `ai-chat.tsx`. The env-derived
 * `config.geminiModel` is used as the default ONLY if it appears here;
 * otherwise we fall back to `GEMINI_CHAT_MODELS[0]` so the picker never
 * shows a value its dropdown does not offer.
 */
const GEMINI_CHAT_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro"] as const;

/**
 * Pattern-based exclusion for Ollama models that exist on-disk but cannot
 * serve `/api/chat`. Heuristic — a novel embed family from a future
 * vendor would leak through until the pattern is updated. Worst case: the
 * picker auto-selects an embed model the user later sees fail, which is
 * still better than the previous phantom-name behaviour. Update this list
 * if a new embed family ships.
 */
const CHAT_INCAPABLE_PATTERNS = [
  /^nomic-embed/i,
  /-embed-/i,
  /^all-minilm/i,
  /^bge-/i,
  /^mxbai-embed/i,
];

function isChatCapable(modelName: string): boolean {
  return !CHAT_INCAPABLE_PATTERNS.some((p) => p.test(modelName));
}

export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const customUrl = searchParams.get("url");

  const config = getAIConfig();
  const targetUrl = customUrl || config.ollamaUrl;

  const ollamaUp = await ollamaIsAvailable(targetUrl);
  const rawOllamaNames = ollamaUp ? await ollamaModels(targetUrl) : [];
  const ollamaNames = rawOllamaNames.filter(isChatCapable);
  // The configured default only "wins" when it is actually pulled AND
  // chat-capable. Otherwise we pick the first usable name so the picker
  // auto-selects something the chat route can actually invoke. `null`
  // when nothing usable is available.
  const effectiveOllamaDefault =
    ollamaNames.length === 0
      ? null
      : ollamaNames.includes(config.ollamaModel)
        ? config.ollamaModel
        : ollamaNames[0];

  const models: { provider: string; name: string; active: boolean }[] = [];

  for (const name of ollamaNames) {
    models.push({
      provider: "ollama",
      name,
      active: name === effectiveOllamaDefault,
    });
  }

  // Gemini default is gated to the offered chat list — `gemini-2.0-flash-lite`
  // or any other env value the picker does not render is rejected.
  const geminiDefault: string = (GEMINI_CHAT_MODELS as readonly string[]).includes(config.geminiModel)
    ? config.geminiModel
    : GEMINI_CHAT_MODELS[0];

  if (config.geminiApiKey) {
    for (const name of GEMINI_CHAT_MODELS) {
      models.push({
        provider: "gemini",
        name,
        active: name === geminiDefault,
      });
    }
  }

  return NextResponse.json({
    ollama: {
      available: ollamaUp && ollamaNames.length > 0,
      url: config.ollamaUrl,
      defaultModel: effectiveOllamaDefault,
    },
    gemini: { available: !!config.geminiApiKey, defaultModel: geminiDefault },
    models,
  });
}


