//
// AI provider layer — ADR-0044 (L1 Provider Router).
//
// New code should reach for the `ai` façade and the typed task vocabulary:
//
//     import { ai } from "@/lib/ai";
//     const { json } = await ai.generate<MyShape>({ task: "extract", messages });
//
// Day 3 migration is complete — all route callers consume the `ai` façade.
// The raw helpers exported below remain available for the rare power-user
// path (e.g. `/api/ai/chat` `body.localUrl`, `/api/ai/models` probes).
//

/* ── New façade (ADR-0044) ── */

export type {
  AITaskClass,
  ProviderId,
  ChatMessage,
  TokenUsage,
  AIRequest,
  AIResponse,
  AIProvider,
} from "./types";

export { ai, Router, DEFAULT_ROUTING_TABLE } from "./router";
export type { RoutingTable } from "./router";

export { OllamaProvider } from "./providers/ollama";
export { GeminiFastProvider } from "./providers/gemini-fast";
export { getProviders, registerProvider } from "./providers/registry";
export { AIProviderError } from "./errors";

/* ── Config (still current API) ── */

export { getAIConfig } from "./config";
export type { AIConfig } from "./config";

/* ── Raw helpers — still exported for the rare power-user override
   (e.g. /api/ai/chat `body.localUrl` and /api/ai/models probes).
   New code should reach for `ai.generate()` instead. ── */

export { ollamaIsAvailable, ollamaModels, ollamaChat } from "./providers/ollama";
export { geminiChat } from "./providers/gemini-fast";
