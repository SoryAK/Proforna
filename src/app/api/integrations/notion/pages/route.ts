/**
 * GET /api/integrations/notion/pages
 *
 * Lists Notion pages the workspace has granted us access to. Used by the
 * NotionImportDialog to populate its checkbox picker.
 *
 * Status codes:
 *   - 200 — { pages: NotionPageSummary[], importedPageIds: string[] }
 *   - 401 — unauthenticated
 *   - 404 — no enabled Notion connection on this account
 *   - 502 — Notion API error (token revoked, rate limited, etc.)
 *
 * `importedPageIds` is computed from existing WorkLog rows matching
 * (userId, externalSource: "notion") so the picker can mark already-imported
 * pages as such (and the user can choose to skip them).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import {
  buildNotionClient,
  listAccessiblePages,
  type NotionConnectionConfig,
} from "@/lib/integrations/notion-client";

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conn = await prisma.integrationConnection.findFirst({
    where: { userId, provider: "notion", enabled: true },
    select: { id: true, config: true },
  });
  if (!conn) {
    return NextResponse.json(
      { error: "No active Notion connection" },
      { status: 404 },
    );
  }

  let pages;
  try {
    const client = buildNotionClient(conn.config as NotionConnectionConfig);
    pages = await listAccessiblePages(client);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Notion API error";
    console.error("Notion listAccessiblePages failed", msg);
    return NextResponse.json(
      { error: "Failed to load Notion pages" },
      { status: 502 },
    );
  }

  // Mark pages already imported so the picker can dim them.
  const imported = await prisma.workLog.findMany({
    where: { userId, externalSource: "notion" },
    select: { externalId: true },
  });
  const importedPageIds = imported
    .map((r) => r.externalId)
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  return NextResponse.json({ pages, importedPageIds });
}
