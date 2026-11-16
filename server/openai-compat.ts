import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { APICallError, generateText, type LanguageModel } from "ai";
import { parseDiscoveredModels } from "../core/model-list";

export type ChatMessage = { role: "system" | "user"; content: string };

export type CompleteResult = { text: string; model: string };

export type CompleteFn = (input: {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  jsonObject?: boolean;
  keepAlive?: number;
  contextTokens?: number;
}) => Promise<CompleteResult>;

export function openAiCompatibleModel(input: {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  jsonObject?: boolean;
  keepAlive?: number;
  contextTokens?: number;
}): LanguageModel {
  const jsonObject = input.jsonObject !== false;
  const provider = createOpenAICompatible({
    name: "compatible",
    baseURL: input.baseUrl.replace(/\/+$/, ""),
    apiKey: input.apiKey || undefined,
    transformRequestBody(body) {
      const next: Record<string, unknown> = { ...body };
      if (input.keepAlive !== undefined) next.keep_alive = input.keepAlive;
      if (input.contextTokens) next.options = { num_ctx: input.contextTokens };
      if (jsonObject) next.response_format = { type: "json_object" };
      else delete next.response_format;
      return next;
    },
  });
  return provider.languageModel(input.model);
}

export async function completeOpenAiChat(input: {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  jsonObject?: boolean;
  keepAlive?: number;
  contextTokens?: number;
}): Promise<CompleteResult> {
  const jsonObject = input.jsonObject !== false;
  try {
    try {
      return await generateCompatibleText(input);
    } catch (err) {
      if (jsonObject && APICallError.isInstance(err) && err.statusCode === 400) {
        try {
          return await generateCompatibleText({ ...input, jsonObject: false });
        } catch (fallbackErr) {
          throw asModelError(fallbackErr);
        }
      }
      throw asModelError(err);
    }
  } finally {
    if (input.keepAlive === 0) {
      await unloadLocalModel(input).catch(() => {});
    }
  }
}

async function generateCompatibleText(input: {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  jsonObject?: boolean;
  keepAlive?: number;
  contextTokens?: number;
}): Promise<CompleteResult> {
  const prompt = promptParts(input.messages);
  const result = await generateText({
    model: openAiCompatibleModel(input),
    system: prompt.system,
    messages: prompt.messages,
    temperature: 0,
    maxRetries: 0,
    abortSignal: chatAbortSignal(input.signal),
    timeout: 120_000,
  });
  const text = result.text.trim();
  if (!text) throw new Error("The model returned an empty reply.");
  return { text, model: result.response.modelId ?? input.model };
}

function promptParts(messages: ChatMessage[]): {
  system?: string;
  messages: Array<{ role: "user"; content: string }>;
} {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join("\n\n");
  return {
    system: system || undefined,
    messages: messages
      .filter((message) => message.role === "user")
      .map((message) => ({ role: "user", content: message.content })),
  };
}

function asModelError(err: unknown): Error {
  if (isAbortError(err)) return err instanceof Error ? err : new Error("The model request was cancelled.");
  if (APICallError.isInstance(err)) {
    return new Error(modelErrorMessage(err.responseBody ?? err.message, err.statusCode ?? 0));
  }
  return err instanceof Error ? err : new Error("The model request failed.");
}

export function isAbortError(err: unknown): boolean {
  if (namedAbort(err)) return true;
  return err instanceof Error && namedAbort(err.cause);
}

function namedAbort(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === "AbortError") ||
    (typeof DOMException !== "undefined" &&
      err instanceof DOMException &&
      err.name === "AbortError")
  );
}

export async function unloadLocalModel(input: {
  baseUrl: string;
  model: string;
}): Promise<void> {
  const origin = input.baseUrl.replace(/\/v1\/?$/, "").replace(/\/+$/, "");
  await fetch(`${origin}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: input.model, keep_alive: 0 }),
    signal: AbortSignal.timeout(2_000),
  });
}

function chatAbortSignal(extra?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(120_000);
  if (!extra) return timeout;
  return AbortSignal.any([timeout, extra]);
}

function modelErrorMessage(text: string, status: number): string {
  try {
    const parsed = JSON.parse(text) as {
      error?: { message?: string } | string;
    };
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error.trim();
    }
    if (
      parsed.error &&
      typeof parsed.error === "object" &&
      typeof parsed.error.message === "string" &&
      parsed.error.message.trim()
    ) {
      return parsed.error.message.trim();
    }
  } catch {
    /* keep raw body */
  }
  return text.slice(0, 240) || `HTTP ${status}`;
}

export const LOCAL_MODEL_PROBE_MS = 2_500;

export async function listOpenAiCompatModels(input: {
  baseUrl: string;
  apiKey?: string | null;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> {
  const base = input.baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = {};
  if (input.apiKey) headers.authorization = `Bearer ${input.apiKey}`;
  const timeout = AbortSignal.timeout(input.timeoutMs ?? 20_000);
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
  try {
    const res = await fetch(`${base}/models`, {
      headers,
      signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return { ok: false, error: modelErrorMessage(text, res.status) };
    }
    const models = parseDiscoveredModels(await res.json());
    return { ok: true, models };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not reach that endpoint",
    };
  }
}
