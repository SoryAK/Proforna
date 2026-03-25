/**
 * Simple in-memory TTL cache for external API responses.
 * Avoids hitting Adzuna / SerpAPI / Nominatim / OSRM rate limits
 * when repeating the same searches during development.
 *
 * Cache lives in the Node.js process — resets on server restart.
 * No extra infrastructure (Redis, etc.) required.
 */

interface CacheEntry<T> {
  data: T;
  exp: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/** Max entries before we purge expired items (soft limit) */
const MAX_ENTRIES = 2000;

function evictExpired() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.exp <= now) store.delete(key);
  }
}

/**
 * Return cached value if fresh, otherwise call `fn`, cache the result, and return it.
 * @param key   Unique cache key (e.g. "adzuna:react:new york:1:30")
 * @param ttlMs Time-to-live in milliseconds
 * @param fn    Async function that produces the value
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = store.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.exp > Date.now()) return hit.data;

  const data = await fn();

  // Lazy eviction when the store grows large
  if (store.size >= MAX_ENTRIES) evictExpired();

  store.set(key, { data, exp: Date.now() + ttlMs });
  return data;
}

/** Cache durations */
export const TTL = {
  ADZUNA: 10 * 60 * 1000,    // 10 minutes
  SERPAPI: 10 * 60 * 1000,    // 10 minutes
  GEOCODE: 60 * 60 * 1000,   // 1 hour  (locations rarely change)
  COMMUTE: 30 * 60 * 1000,   // 30 minutes
} as const;
