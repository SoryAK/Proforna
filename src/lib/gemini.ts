const GEMINI_API_KEY = () => process.env.GEMINI_API_KEY ?? "";

/** Ordered list of models to try — primary first, then fallbacks */
const MODEL_CHAIN = () => {
  const primary = process.env.GEMINI_MODEL || "gemini-2.0-flash-lite";
  const fallbacks = ["gemini-2.0-flash-lite", "gemini-1.5-flash"];
  // dedupe while keeping order
  const seen = new Set<string>();
  const chain: string[] = [];
  for (const m of [primary, ...fallbacks]) {
    if (!seen.has(m)) { seen.add(m); chain.push(m); }
  }
  return chain;
};

interface GeminiRequest {
  systemInstruction?: { parts: { text: string }[] };
  contents: { role?: string; parts: { text: string }[] }[];
  generationConfig?: Record<string, unknown>;
}

interface GeminiResult {
  res: Response;
  model: string;
}

/**
 * Call Gemini with automatic model fallback on 429 quota errors.
 * Returns the first successful response, or the last failed one.
 */
export async function callGemini(body: GeminiRequest): Promise<GeminiResult> {
  const apiKey = GEMINI_API_KEY();
  const models = MODEL_CHAIN();

  let lastRes: Response | null = null;
  let lastModel = models[0];

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) return { res, model };

    lastRes = res;
    lastModel = model;

    if (res.status === 429) {
      console.warn(`[gemini] ${model} quota exhausted, trying next…`);
      continue;
    }

    // Non-429 error — stop trying
    break;
  }

  return { res: lastRes!, model: lastModel };
}

/** Return a user-facing error message for a failed Gemini response */
export async function geminiErrorMessage(res: Response): Promise<{ message: string; retryAfter: number }> {
  const errText = await res.text().catch(() => "Gemini request failed");
  console.error("[gemini] Error:", errText);

  if (res.status !== 429) {
    return { message: "AI extraction failed", retryAfter: 0 };
  }

  let retrySeconds = 60;
  let isDailyQuota = false;
  let isZeroQuota = errText.includes("limit: 0");

  try {
    const errJson = JSON.parse(errText);
    const violations = errJson.error?.details?.find(
      (d: Record<string, unknown>) => d["@type"]?.toString().includes("QuotaFailure")
    )?.violations || [];
    isDailyQuota = violations.some((v: Record<string, string>) =>
      v.quotaId?.includes("PerDay")
    );
    const retryInfo = errJson.error?.details?.find(
      (d: Record<string, unknown>) => d["@type"]?.toString().includes("RetryInfo")
    );
    if (retryInfo?.retryDelay) {
      retrySeconds = Math.ceil(parseFloat(retryInfo.retryDelay));
    }
  } catch { /* ignore parse errors */ }

  const message = isZeroQuota
    ? "Gemini free tier quota is no longer available. Enable billing at https://aistudio.google.com or update GEMINI_MODEL."
    : isDailyQuota
      ? "Gemini daily quota exhausted across all models. Resets at midnight Pacific."
      : `AI rate limit reached. Please wait ~${retrySeconds}s and try again.`;

  return { message, retryAfter: retrySeconds };
}
