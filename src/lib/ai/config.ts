/**
 * Environment-derived AI config. Extracted from the original `src/lib/ai.ts`
 * during ADR-0044 Day 2 refactor; the legacy `provider: AIProvider` field was
 * dropped (no external caller ever read it).
 */

export interface AIConfig {
  ollamaUrl: string;
  ollamaModel: string;
  geminiApiKey: string;
  /**
   * Default model name for fast-tier Gemini calls invoked WITHOUT model-chain
   * fallback (e.g. `geminiChat` streaming). The chain-aware path lives in
   * `GeminiFastProvider`/`callGemini` and uses `GEMINI_MODEL` independently.
   */
  geminiModel: string;
}

const DEFAULT_CONFIG: AIConfig = {
  ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
  ollamaModel: process.env.OLLAMA_MODEL ?? "llama3.2",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
};

export function getAIConfig(): AIConfig {
  return { ...DEFAULT_CONFIG };
}
