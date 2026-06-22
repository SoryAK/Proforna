//
// AI provider layer — ADR-0044 (L1 Provider Router).
//
// New code should reach for the `ai` façade and the typed task vocabulary:
//
//     import { ai } from "@/lib/ai";
//     const { json } = await ai.generate<MyShape>({ task: "extract", messages });
//
// Legacy helpers (`ollamaChat`, `geminiChat`, `aiGenerateJSON`, …) are
// re-exported here for backwards compatibility while the 15 existing
// call sites migrate. They will be removed at the end of Day 5 of the
// ADR-0044 migration sprint (week of 2026-06-21).
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

/* ── Config (still current API) ── */

export { getAIConfig } from "./config";
export type { AIConfig } from "./config";

/* ── Legacy helpers — @deprecated, scheduled for removal at end of Day 5 ── */

export { ollamaIsAvailable, ollamaModels, ollamaChat } from "./providers/ollama";
export { geminiChat } from "./providers/gemini-fast";
export { aiGenerateJSON } from "./legacy";
