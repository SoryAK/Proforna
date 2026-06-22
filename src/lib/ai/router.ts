import type { AIProvider, AIRequest, AIResponse, AITaskClass, ProviderId } from "./types";
import { getProviders } from "./providers/registry";

export type RoutingTable = Partial<Record<AITaskClass, ProviderId[]>>;

/**
 * Default routing per ADR-0044. Order is "try first, fall back on failure."
 *
 *  - `reason`  has NO fast-tier fallback — that would defeat premium routing.
 *  - `ground`  has NO Ollama fallback — Ollama cannot do Google grounding.
 *  - Others prefer local Ollama (cheap), then `gemini-fast` (cloud).
 */
export const DEFAULT_ROUTING_TABLE: RoutingTable = {
  chat:      ["ollama", "gemini-fast"],
  extract:   ["ollama", "gemini-fast"],
  summarize: ["ollama", "gemini-fast"],
  ground:    ["gemini-fast"],
  reason:    ["gemini-pro"],
};

export class Router {
  constructor(
    private readonly providers: readonly AIProvider[],
    private readonly table: RoutingTable
  ) {}

  async generate<T = unknown>(req: AIRequest): Promise<AIResponse<T>> {
    const order: ProviderId[] = req.providerOverride
      ? [req.providerOverride]
      : (this.table[req.task] ?? []);

    if (order.length === 0) {
      throw new Error(`Router: no providers configured for task "${req.task}"`);
    }

    let lastErr: Error = new Error(`Router: no provider available for task "${req.task}"`);

    for (const providerId of order) {
      const provider = this.providers.find((p) => p.id === providerId);
      if (!provider) {
        lastErr = new Error(`Router: provider "${providerId}" not registered`);
        continue;
      }
      if (!provider.supports(req.task)) {
        lastErr = new Error(
          `Router: provider "${providerId}" does not support task "${req.task}"`
        );
        continue;
      }
      try {
        const res = await provider.generate<T>(req);
        if (req.onUsage && res.usage) req.onUsage(res.usage);
        return res;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        console.warn(
          `[ai.router] provider ${providerId} failed for task ${req.task}:`,
          lastErr.message
        );
        continue;
      }
    }

    throw lastErr;
  }
}

/**
 * Top-level façade — what callers use.
 *
 * @example
 * const { json } = await ai.generate<ParsedResume>({
 *   task: "extract",
 *   messages: [
 *     { role: "system", content: "Return only JSON..." },
 *     { role: "user",   content: rawText },
 *   ],
 * });
 */
export const ai = {
  generate: <T = unknown>(req: AIRequest): Promise<AIResponse<T>> =>
    new Router(getProviders(), DEFAULT_ROUTING_TABLE).generate<T>(req),
};
