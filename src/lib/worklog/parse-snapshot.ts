import type { TLStoreSnapshot } from "@tldraw/tldraw";

/**
 * Safely parse a raw JSON string as a tldraw TLStoreSnapshot.
 * Returns undefined for empty input, non-object JSON values, or invalid JSON.
 */
export function parseSnapshot(raw: string): TLStoreSnapshot | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    return parsed as TLStoreSnapshot;
  } catch {
    return undefined;
  }
}
