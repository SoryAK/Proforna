/**
 * CareerEvent input validator (server-side).
 *
 * House style: plain-TS validator returning a discriminated `Result`,
 * mirroring `worklog-categories.ts` / `worklog-folders.ts`. Repo does
 * not use zod (see ADR-0027 implementation correction commit).
 *
 * Cross-field rule (load-bearing — ADR-0027 Q1A):
 *   - workHistoryId === null         => lat AND lng AND location all required + non-empty
 *   - workHistoryId === "<some id>"  => lat/lng/location all optional
 *
 * Used by:
 *   - `/api/work-history/[id]/events/*` (existing — anchored events)
 *   - `/api/events/*` (Day 2 — peer route family for free-floating)
 *
 * Limits mirror the existing route handler at
 * `src/app/api/work-history/[id]/events/route.ts` so the two code
 * paths stay symmetric.
 */

export const CAREER_EVENT_TITLE_MAX = 200;
export const CAREER_EVENT_DESCRIPTION_MAX = 2000;
export const CAREER_EVENT_LOCATION_MAX = 200;
export const CAREER_EVENT_METRICS_MAX = 500;

/**
 * Default category bucket when caller omits one. Matches the existing
 * route handler's behavior — keeps backwards-compat with any client
 * that posts `{ title, workHistoryId }` and expects the server to
 * pick a sensible default.
 */
export const CAREER_EVENT_CATEGORY_FALLBACK = "company_event" as const;

/**
 * Suggested chip values for the picker UI. Free-form taxonomy per
 * ADR-0027 Q3B — caller may submit any string; this list is purely a
 * UX hint and is NOT used to gate input.
 */
export const CAREER_EVENT_CATEGORY_SUGGESTIONS = [
  // Legacy buckets (work-history anchored)
  "project",
  "milestone",
  "responsibility",
  "training",
  "outcome",
  "context_shift",
  // "Things you participated in" (free-floating friendly)
  "company_event",
  "field_day",
  "emergency",
  "news_event",
  "social",
  "conference",
  "other",
] as const;

/** Normalized server-side shape after validation. Optional fields collapse to `null`. */
export interface CareerEventNormalized {
  title: string;
  workHistoryId: string | null;
  description: string | null;
  category: string;
  startDate: Date | null;
  endDate: Date | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  metrics: string | null;
}

export type CareerEventValidationResult =
  | { ok: true; value: CareerEventNormalized }
  | { ok: false; error: string };

// ─── Internal helpers ──────────────────────────────────────────────

function trimOrNull(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.length === 0) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function parseDateOrNull(v: unknown): { ok: true; value: Date | null } | { ok: false } {
  if (v === undefined || v === null || v === "") return { ok: true, value: null };
  if (typeof v !== "string" && !(v instanceof Date)) return { ok: false };
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return { ok: false };
  return { ok: true, value: d };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * Validate + normalize a raw payload. Returns a discriminated result;
 * never throws. Caller is responsible for auth + ownership checks.
 */
export function validateCareerEventInput(
  raw: unknown
): CareerEventValidationResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Body must be a JSON object." };
  }
  const r = raw as Record<string, unknown>;

  // ─── title (required) ──────────────────────────────────────────
  if (typeof r.title !== "string") {
    return { ok: false, error: "title is required and must be a string." };
  }
  const title = r.title.trim();
  if (title.length === 0) {
    return { ok: false, error: "title is required." };
  }
  if (title.length > CAREER_EVENT_TITLE_MAX) {
    return {
      ok: false,
      error: `title exceeds the ${CAREER_EVENT_TITLE_MAX} character limit.`,
    };
  }

  // ─── workHistoryId (required: string id OR explicit null) ──────
  // Empty string is rejected so the caller is forced to pick.
  let workHistoryId: string | null;
  if (r.workHistoryId === null) {
    workHistoryId = null;
  } else if (typeof r.workHistoryId === "string" && r.workHistoryId.length > 0) {
    workHistoryId = r.workHistoryId;
  } else {
    return {
      ok: false,
      error:
        "workHistoryId must be a non-empty string (anchored event) or null (free-floating event).",
    };
  }

  // ─── lat / lng (numbers if present) ───────────────────────────
  let lat: number | null = null;
  if (r.lat !== undefined && r.lat !== null) {
    if (!isFiniteNumber(r.lat)) {
      return { ok: false, error: "lat must be a finite number." };
    }
    lat = r.lat;
  }
  let lng: number | null = null;
  if (r.lng !== undefined && r.lng !== null) {
    if (!isFiniteNumber(r.lng)) {
      return { ok: false, error: "lng must be a finite number." };
    }
    lng = r.lng;
  }

  // ─── location (string-or-null, trimmed + clamped) ─────────────
  const location = trimOrNull(r.location, CAREER_EVENT_LOCATION_MAX);

  // ─── Cross-field rule: free-floating requires geo trio ────────
  if (workHistoryId === null) {
    if (lat === null) {
      return {
        ok: false,
        error:
          "Free-floating events (workHistoryId is null) require lat.",
      };
    }
    if (lng === null) {
      return {
        ok: false,
        error:
          "Free-floating events (workHistoryId is null) require lng.",
      };
    }
    if (location === null) {
      return {
        ok: false,
        error:
          "Free-floating events (workHistoryId is null) require location.",
      };
    }
  }

  // ─── description / metrics (clamp + null-collapse) ────────────
  const description = trimOrNull(r.description, CAREER_EVENT_DESCRIPTION_MAX);
  const metrics = trimOrNull(r.metrics, CAREER_EVENT_METRICS_MAX);

  // ─── category (free-form, fallback when missing/empty) ────────
  const categoryRaw = trimOrNull(r.category, 80);
  const category = categoryRaw ?? CAREER_EVENT_CATEGORY_FALLBACK;

  // ─── dates ────────────────────────────────────────────────────
  const startParsed = parseDateOrNull(r.startDate);
  if (!startParsed.ok) {
    return { ok: false, error: "startDate is not a valid ISO date." };
  }
  const endParsed = parseDateOrNull(r.endDate);
  if (!endParsed.ok) {
    return { ok: false, error: "endDate is not a valid ISO date." };
  }

  return {
    ok: true,
    value: {
      title,
      workHistoryId,
      description,
      category,
      startDate: startParsed.value,
      endDate: endParsed.value,
      location,
      lat,
      lng,
      metrics,
    },
  };
}
