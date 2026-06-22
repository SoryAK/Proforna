import type { AIResponse, ProviderId, TokenUsage } from "./types";

/**
 * Per-call AI provenance metadata that travels alongside response data
 * from server to client. Shape locked by ADR-0045.
 *
 * `_ai` is intentionally open-shape — additive fields are non-breaking
 * (future: requestLatencyBreakdown, cacheHit, mcpToolCalls, ...).
 */
export interface AIMeta {
  provider: ProviderId;
  model: string;
  usage?: TokenUsage;
  /** End-to-end latency in milliseconds, measured by the route handler. */
  durationMs: number;
}

/**
 * Wire format for any AI-touching API route. Replaces bare-data responses
 * so the client can render <AIProvenanceChip />. See ADR-0045 §Architecture.
 */
export interface AIEnvelope<T> {
  data: T;
  _ai: AIMeta;
}

/**
 * Build a wire-format envelope from an ai.generate() result.
 *
 * Pure — no clocks, no side effects. The caller measures `durationMs`
 * (typically `Date.now() - t0` around the `ai.generate(...)` call).
 *
 * @param data    payload exposed under `envelope.data` (usually result.json or result.text)
 * @param result  the AIResponse from ai.generate(); only provider/model/usage are read
 * @param durationMs end-to-end latency the caller measured
 */
export function toAIEnvelope<T>(
  data: T,
  result: Pick<AIResponse<unknown>, "provider" | "model" | "usage">,
  durationMs: number,
): AIEnvelope<T> {
  return {
    data,
    _ai: {
      provider: result.provider,
      model: result.model,
      usage: result.usage,
      durationMs,
    },
  };
}

/**
 * Structural type guard. Returns true iff `v` matches the envelope shape
 * (object with a `_ai` carrying string provider/model + numeric durationMs).
 *
 * Used by `unwrapAIEnvelope` to fall back gracefully while routes are
 * still being migrated to the envelope shape during the ADR-0045 sprint.
 */
export function isAIEnvelope<T = unknown>(v: unknown): v is AIEnvelope<T> {
  if (typeof v !== "object" || v === null) return false;
  const e = v as { _ai?: unknown };
  if (typeof e._ai !== "object" || e._ai === null) return false;
  const meta = e._ai as { provider?: unknown; model?: unknown; durationMs?: unknown };
  return (
    typeof meta.provider === "string" &&
    typeof meta.model === "string" &&
    typeof meta.durationMs === "number"
  );
}

/**
 * Extract `{ data, ai }` from a possibly-enveloped wire value.
 *
 * Returns `ai: undefined` for un-enveloped responses so the 13-route
 * migration (Day 2) can land incrementally without breaking consumers
 * that have already been migrated to `useAIQuery<T>()`.
 */
export function unwrapAIEnvelope<T>(v: unknown): { data: T | undefined; ai: AIMeta | undefined } {
  if (isAIEnvelope<T>(v)) return { data: v.data, ai: v._ai };
  return { data: v as T | undefined, ai: undefined };
}
