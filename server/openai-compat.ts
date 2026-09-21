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
  const url = `${input.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (input.apiKey) headers.authorization = `Bearer ${input.apiKey}`;

  const body: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
    stream: false,
    temperature: 0,
  };
  if (input.keepAlive !== undefined) body.keep_alive = input.keepAlive;
  if (input.contextTokens) body.options = { num_ctx: input.contextTokens };
  const signal = chatAbortSignal(input.signal);
  const jsonObject = input.jsonObject !== false;

  try {
    let res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(
        jsonObject
          ? { ...body, response_format: { type: "json_object" } }
          : body,
      ),
      signal,
    });

    if (jsonObject && !res.ok && res.status === 400) {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      });
    }

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(modelErrorMessage(text, res.status));
    }

    const payload = (await res.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) throw new Error("The model returned an empty reply.");
    return { text, model: payload.model ?? input.model };
  } finally {
    if (input.keepAlive === 0) {
      await unloadLocalModel(input).catch(() => {});
    }
  }
}

export function isAbortError(err: unknown): boolean {
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
}): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> {
  const base = input.baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = {};
  if (input.apiKey) headers.authorization = `Bearer ${input.apiKey}`;
  try {
    const res = await fetch(`${base}/models`, {
      headers,
      signal: AbortSignal.timeout(input.timeoutMs ?? 20_000),
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
