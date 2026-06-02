/**
 * Worklog offline read cache (Dexie / IndexedDB).
 *
 * Purpose: serve the worklog list instantly on cold load / offline, then
 * revalidate from the server when online. Server is always source of truth.
 *
 * Scope: list rows only (full WorkLog shape, including contentJson). No
 * write queue, no per-log detail cache. See ADR 0010 for the broader plan.
 *
 * Cache invalidation:
 *   - TTL: rows older than CACHE_TTL_MS are ignored on read (treated as miss).
 *   - Version bump: bumping DB_VERSION wipes the `logs` table (Dexie upgrade).
 */

import Dexie, { type Table } from "dexie";
import type { WorkLog } from "@/types/worklog";

const DB_NAME = "resumsify-worklog-cache";
const DB_VERSION = 1;

/** 7 days. Bump cautiously — stale cross-device data shows for this long. */
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type MetaRow = { key: string; value: string };

class WorklogCacheDB extends Dexie {
  logs!: Table<WorkLog, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super(DB_NAME);
    this.version(DB_VERSION).stores({
      // keyPath `id` + secondary indexes for future range queries
      logs: "id, date, updatedAt, positionId",
      meta: "key",
    });
  }
}

let _db: WorklogCacheDB | null = null;

function db(): WorklogCacheDB | null {
  if (typeof window === "undefined") return null;
  if (!_db) {
    try {
      _db = new WorklogCacheDB();
    } catch (err) {
      // IndexedDB unavailable (private mode, quota, etc.) — fail soft.
      console.warn("[worklog-cache] Dexie init failed", err);
      return null;
    }
  }
  return _db;
}

const META_LAST_SYNC = "logs:lastSync";

/**
 * Read all cached logs. Returns `null` when cache is empty, expired (per
 * CACHE_TTL_MS), or unavailable — caller should treat as a miss.
 */
export async function cacheGetAllLogs(): Promise<WorkLog[] | null> {
  const d = db();
  if (!d) return null;
  try {
    const lastSync = await d.meta.get(META_LAST_SYNC);
    if (!lastSync) return null;
    const age = Date.now() - new Date(lastSync.value).getTime();
    if (Number.isNaN(age) || age > CACHE_TTL_MS) return null;
    const rows = await d.logs.toArray();
    return rows.length > 0 ? rows : null;
  } catch (err) {
    console.warn("[worklog-cache] read failed", err);
    return null;
  }
}

/**
 * Replace the entire `logs` table with `logs` and stamp lastSync = now.
 * Used after a successful server fetch so the cache mirrors server state.
 */
export async function cacheReplaceAllLogs(logs: WorkLog[]): Promise<void> {
  const d = db();
  if (!d) return;
  try {
    await d.transaction("rw", d.logs, d.meta, async () => {
      await d.logs.clear();
      if (logs.length > 0) await d.logs.bulkPut(logs);
      await d.meta.put({ key: META_LAST_SYNC, value: new Date().toISOString() });
    });
  } catch (err) {
    console.warn("[worklog-cache] write failed", err);
  }
}

/** Drop everything. Useful for sign-out flows or manual reset. */
export async function cacheClear(): Promise<void> {
  const d = db();
  if (!d) return;
  try {
    await d.transaction("rw", d.logs, d.meta, async () => {
      await d.logs.clear();
      await d.meta.clear();
    });
  } catch (err) {
    console.warn("[worklog-cache] clear failed", err);
  }
}
