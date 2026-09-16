import { parseDiscoveredModels } from "../core/model-list";

export type ChatMessage = { role: "system" | "user"; content: string };

export type CompleteResult = { text: string; model: string };

export type CompleteFn = (input: {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  messages: ChatMessage[];
}) => Promise<CompleteResult>;

export async function completeOpenAiChat(input: {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  messages: ChatMessage[];
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

  let res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...body, response_format: { type: "json_object" } }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok && res.status === 400) {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
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

export async function listOpenAiCompatModels(input: {
  baseUrl: string;
  apiKey?: string | null;
}): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> {
  const base = input.baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = {};
  if (input.apiKey) headers.authorization = `Bearer ${input.apiKey}`;
  try {
    const res = await fetch(`${base}/models`, {
      headers,
      signal: AbortSignal.timeout(20_000),
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
