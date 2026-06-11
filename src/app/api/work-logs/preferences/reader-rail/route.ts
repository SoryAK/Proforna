/**
 * ADR-0023 / ADR-0025 — POST /api/work-logs/preferences/reader-rail
 *
 * Persists per-user worklog reader right-rail state:
 *   - tab       (optional) "backlinks" | "history" | "properties" | "photos"
 *   - collapsed (optional) boolean
 *
 * Partial-update semantics: either field may be sent independently.
 * Sending neither is a 400. Either field present triggers an upsert
 * scoped to the authenticated userId.
 *
 * Legacy alias: ADR-0025 renamed `"tags"` to `"properties"`. To keep
 * existing client caches and stale POSTs from 400-ing, requests
 * containing `tab: "tags"` are silently rewritten to `"properties"`
 * before validation + persistence.
 *
 * Response: { tab, collapsed } — the current saved rail state.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

const ALLOWED_RAIL_TABS = new Set(["backlinks", "history", "properties", "photos"]);
const DEFAULT_RAIL_TAB = "backlinks";

/** Map any legacy tab id to its current canonical value. */
function migrateLegacyRailTab(value: string): string {
  if (value === "tags") return "properties";
  return value;
}

function normalizeRailTab(value: unknown): string {
  const next = migrateLegacyRailTab(String(value ?? "").trim().toLowerCase());
  return ALLOWED_RAIL_TABS.has(next) ? next : DEFAULT_RAIL_TAB;
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const hasTab = Object.prototype.hasOwnProperty.call(body, "tab");
  const hasCollapsed = Object.prototype.hasOwnProperty.call(body, "collapsed");

  if (!hasTab && !hasCollapsed) {
    return NextResponse.json(
      { error: "Body must contain at least one of: tab, collapsed" },
      { status: 400 },
    );
  }

  // Validate tab if present.
  if (hasTab) {
    const raw = migrateLegacyRailTab(String(body.tab ?? "").trim().toLowerCase());
    if (!ALLOWED_RAIL_TABS.has(raw)) {
      return NextResponse.json(
        { error: `Invalid tab: must be one of ${[...ALLOWED_RAIL_TABS].join(", ")}` },
        { status: 400 },
      );
    }
  }

  // Validate collapsed if present (must be strict boolean).
  if (hasCollapsed && typeof body.collapsed !== "boolean") {
    return NextResponse.json(
      { error: "Invalid collapsed: must be a boolean" },
      { status: 400 },
    );
  }

  // Build partial update payload. Only include keys the caller actually sent.
  const updatePayload: { readerRailTab?: string; readerRailCollapsed?: boolean } = {};
  if (hasTab) updatePayload.readerRailTab = normalizeRailTab(body.tab);
  if (hasCollapsed) updatePayload.readerRailCollapsed = body.collapsed as boolean;

  // Create branch must satisfy required fields on WorkLogPreference.
  // Fields not specified fall to their schema defaults.
  const createPayload: {
    userId: string;
    readerRailTab?: string;
    readerRailCollapsed?: boolean;
  } = { userId };
  if (hasTab) createPayload.readerRailTab = updatePayload.readerRailTab;
  if (hasCollapsed) createPayload.readerRailCollapsed = updatePayload.readerRailCollapsed;

  const saved = await prisma.workLogPreference.upsert({
    where: { userId },
    create: createPayload,
    update: updatePayload,
    select: {
      readerRailTab: true,
      readerRailCollapsed: true,
    },
  });

  return NextResponse.json({
    tab: normalizeRailTab((saved as { readerRailTab?: unknown }).readerRailTab),
    collapsed: (saved as { readerRailCollapsed?: unknown }).readerRailCollapsed === true,
  });
}
