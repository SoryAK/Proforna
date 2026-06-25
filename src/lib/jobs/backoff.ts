/**
 * Exponential backoff for `DocumentProcessingJob` retries (ADR-0050 β1.2).
 *
 * Math: 60s × 2^attempts, capped at 1h. Pure function — no clock access,
 * no Prisma. Caller (`markJobFailed`) injects `now` so tests stay
 * deterministic and the same function works inside transactions.
 */

export const BACKOFF_BASE_MS = 60_000;
export const BACKOFF_MAX_MS = 60 * 60 * 1_000;

export function computeBackoffMs(attempts: number): number {
  if (attempts < 0) return 0;
  const ms = BACKOFF_BASE_MS * Math.pow(2, attempts);
  return Math.min(ms, BACKOFF_MAX_MS);
}

export function computeNextScheduledAt(attempts: number, now: Date): Date {
  return new Date(now.getTime() + computeBackoffMs(attempts));
}
