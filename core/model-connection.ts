export const DEFAULT_LOCAL_BASE_URL = "http://127.0.0.1:11434/v1";
export const LLAMA_CPP_BASE_URL = "http://127.0.0.1:8080/v1";
export const OPENAI_BASE_URL = "https://api.openai.com/v1";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export type ModelHosting = "local" | "cloud";

export type ModelConnectionInput = {
  hosting?: unknown;
  baseUrl?: unknown;
  model?: unknown;
  apiKey?: unknown;
};

export type PreparedModelConnection = {
  hosting: ModelHosting;
  baseUrl: string;
  model: string;
  apiKey: string | null;
};

export type ModelConnectionPrepareError =
  | "hosting-required"
  | "url-required"
  | "url-invalid"
  | "key-required";

export function parseModelHosting(value: unknown): ModelHosting | null {
  return value === "local" || value === "cloud" ? value : null;
}

export function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\/+$/, "");
}

export function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function prepareModelConnection(
  input: ModelConnectionInput,
):
  | { ok: true; value: PreparedModelConnection }
  | { ok: false; error: ModelConnectionPrepareError } {
  const hosting = parseModelHosting(input.hosting);
  if (!hosting) return { ok: false, error: "hosting-required" };

  const baseUrl = normalizeBaseUrl(input.baseUrl);
  if (!baseUrl) return { ok: false, error: "url-required" };
  if (!isHttpUrl(baseUrl)) return { ok: false, error: "url-invalid" };

  const model = typeof input.model === "string" ? input.model.trim() : "";
  const apiKey =
    typeof input.apiKey === "string" && input.apiKey.trim()
      ? input.apiKey.trim()
      : null;

  if (hosting === "cloud" && !apiKey) {
    return { ok: false, error: "key-required" };
  }

  return { ok: true, value: { hosting, baseUrl, model, apiKey } };
}
