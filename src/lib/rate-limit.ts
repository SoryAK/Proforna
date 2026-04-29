/**
 * Tiny in-memory rate limiter.
 *
 * Per-key sliding-window counter; suitable for single-instance dev/small deploys.
 * Replace with Redis/Upstash for multi-instance production scale.
 *
 * Usage:
 *   const rl = checkRateLimit(`comp:${userId}`, { limit: 20, windowMs: 60_000 * 60 });
 *   if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rl.headers });
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Periodic GC so the map doesn't grow unbounded across long-running processes.
let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

export interface RateLimitOptions {
  limit: number;       // max requests per window
  windowMs: number;    // window size in ms
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
  headers: Record<string, string>;
}

export function checkRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  sweep(now);
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + opts.windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  const remaining = Math.max(0, opts.limit - b.count);
  const ok = b.count <= opts.limit;
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(opts.limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(b.resetAt / 1000)),
  };
  if (!ok) headers["Retry-After"] = String(Math.ceil((b.resetAt - now) / 1000));
  return { ok, remaining, resetAt: b.resetAt, headers };
}
