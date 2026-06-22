import { getAIConfig } from "../config";
import { AIProviderError } from "../errors";
import type {
  AIProvider,
  AIRequest,
  AIResponse,
  AITaskClass,
  ChatMessage,
  TokenUsage,
} from "../types";

const SUPPORTED: ReadonlySet<AITaskClass> = new Set(["chat", "extract", "summarize"]);

/**
 * Parse Ollama's top-level `prompt_eval_count` / `eval_count` into the locked
 * `TokenUsage` shape. Returns `undefined` when both fields are absent (some
 * server versions / streamed responses omit them).
 */
function extractOllamaUsage(data: unknown, model: string): TokenUsage | undefined {
  const d = data as { prompt_eval_count?: unknown; eval_count?: unknown } | null;
  const promptTokens = typeof d?.prompt_eval_count === "number" ? d.prompt_eval_count : undefined;
  const completionTokens = typeof d?.eval_count === "number" ? d.eval_count : undefined;
  if (promptTokens === undefined && completionTokens === undefined) return undefined;
  return { promptTokens, completionTokens, provider: "ollama", model };
}

/* ── Raw helpers (used internally + re-exported from `@/lib/ai` for legacy callers) ── */

/** Probe `/api/tags` with a 2s timeout. Returns false on any error. */
export async function ollamaIsAvailable(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** List installed model names. Returns [] on any error. */
export async function ollamaModels(url: string): Promise<string[]> {
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models ?? []).map((m: { name: string }) => m.name);
  } catch {
    return [];
  }
}

/** Stream a chat completion from Ollama as `ReadableStream<string>` of text chunks. */
export function ollamaChat(
  url: string,
  model: string,
  messages: ChatMessage[]
): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      try {
        const res = await fetch(`${url}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages, stream: true }),
        });
        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => "Ollama request failed");
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
          // Ollama streams newline-delimited JSON
          for (const line of chunk.split("\n")) {
            if (!line.trim()) continue;
            try {
              const json = JSON.parse(line);
              if (json.message?.content) controller.enqueue(json.message.content);
            } catch {
              /* skip invalid JSON fragments */
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

export class OllamaProvider implements AIProvider {
  readonly id = "ollama" as const;

  supports(task: AITaskClass): boolean {
    return SUPPORTED.has(task);
  }

  async generate<T = unknown>(req: AIRequest): Promise<AIResponse<T>> {
    const cfg = getAIConfig();
    const model = req.modelOverride ?? cfg.ollamaModel;
    const url = cfg.ollamaUrl;

    if (!(await ollamaIsAvailable(url))) {
      throw new AIProviderError({
        message: `Ollama is not available at ${url}`,
        status: 503,
        providerId: this.id,
      });
    }

    switch (req.task) {
      case "chat":
        return {
          stream: ollamaChat(url, model, req.messages),
          provider: this.id,
          model,
        };

      case "extract": {
        const res = await fetch(`${url}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages: req.messages, stream: false, format: "json" }),
        });
        if (!res.ok) {
          throw new AIProviderError({
            message: `Ollama extract failed: ${await res.text().catch(() => res.statusText)}`,
            status: res.status,
            providerId: this.id,
          });
        }
        const data = await res.json();
        const text = data.message?.content ?? "{}";
        const usage = extractOllamaUsage(data, model);
        return { json: JSON.parse(text) as T, provider: this.id, model, usage };
      }

      case "summarize": {
        const res = await fetch(`${url}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages: req.messages, stream: false }),
        });
        if (!res.ok) {
          throw new AIProviderError({
            message: `Ollama summarize failed: ${await res.text().catch(() => res.statusText)}`,
            status: res.status,
            providerId: this.id,
          });
        }
        const data = await res.json();
        const usage = extractOllamaUsage(data, model);
        return { text: data.message?.content ?? "", provider: this.id, model, usage };
      }

      default:
        throw new AIProviderError({
          message: `OllamaProvider does not support task: ${req.task}`,
          status: 400,
          providerId: this.id,
        });
    }
  }
}
