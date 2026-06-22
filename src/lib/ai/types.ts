/**
 * Locked interface from ADR-0044 (L1 Provider Router).
 *
 * New code should depend on these types; the legacy `AIProvider = "ollama" | "gemini"`
 * string alias has been retired (no external caller imported it — confirmed Day 2 grep).
 */

export type AITaskClass = "chat" | "extract" | "ground" | "reason" | "summarize";

/**
 * Provider identifier. Forward Path additions (deferred per ADR-0021 §Mobile providers):
 *   "firebase" | "aicore" | "openai-byok" | "anthropic-byok"
 * are intentionally NOT in this union until the Play Store push sprint registers them.
 */
export type ProviderId = "ollama" | "gemini-fast" | "gemini-pro";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  provider: ProviderId;
  model: string;
}

export interface AIRequest {
  task: AITaskClass;
  messages: ChatMessage[];
  /** Escape hatch — defeats the router's model choice for this single call. */
  modelOverride?: string;
  /** Escape hatch — defeats tier selection for this single call. */
  providerOverride?: ProviderId;
  /** Cost-guard stub (ADR-0044 Q3) — recorded, not enforced until multi-tenancy lands. */
  userId?: string;
  /** Cost-guard stub — emitted on success when the provider reports usage. */
  onUsage?: (u: TokenUsage) => void;
}

export interface AIResponse<T = unknown> {
  /** Populated for `summarize` and non-streaming `chat`. */
  text?: string;
  /** Populated for `extract`, `ground`, `reason`. */
  json?: T;
  /** Populated for streaming `chat`. */
  stream?: ReadableStream<string>;
  provider: ProviderId;
  model: string;
  usage?: TokenUsage;
}

export interface AIProvider {
  readonly id: ProviderId;
  supports(task: AITaskClass): boolean;
  generate<T = unknown>(req: AIRequest): Promise<AIResponse<T>>;
}
