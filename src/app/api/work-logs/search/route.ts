/**
 * GET /api/work-logs/search?q=...&folderId=...&limit=20
 *
 * Postgres full-text search over a user's WorkLog entries (W1.2 roadmap).
 *
 * Backed by the GENERATED tsvector column `search_vector` and its GIN
 * index (see migration 20260523220000_add_worklog_search_vector). Returns
 * highlighted snippets ranked by `ts_rank_cd`.
 *
 * Security:
 *   • Authenticated via getUserId(); userId predicate is ALWAYS applied.
 *   • Uses parameterized $queryRaw + Prisma.sql tagged template — no
 *     string interpolation of `q` into SQL.
 *   • Uses plainto_tsquery (not to_tsquery) so raw user input cannot
 *     produce invalid tsquery syntax errors / injection.
 *
 * Performance:
 *   • Caps `limit` at 50 and requires q.trim().length >= 2.
 *   • Applies ts_headline only AFTER the LIMIT (CTE-style) so snippet
 *     generation runs on at most `limit` rows, never the full match set.
 *   • Folder scoping resolves the folder + all descendants and uses an
 *     IN-list (cheap for the realistic depth of <=8).
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { collectDescendantIds } from "@/lib/worklog-folders";
import type { WorkLogFolder } from "@/types/worklog";

const Q_MIN_LEN = 2;
const Q_MAX_LEN = 200;
const LIMIT_MAX = 50;
const LIMIT_DEFAULT = 20;

interface SearchRow {
  id: string;
  title: string;
  snippet: string;
  folderId: string | null;
  date: Date;
  rank: number;
}

export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const qRaw = (searchParams.get("q") ?? "").trim();
  const folderIdParam = searchParams.get("folderId");
  const limitParam = Number(searchParams.get("limit") ?? LIMIT_DEFAULT);

  if (qRaw.length < Q_MIN_LEN || qRaw.length > Q_MAX_LEN) {
    return NextResponse.json({ results: [] });
  }

  const limit = Math.max(1, Math.min(LIMIT_MAX, Number.isFinite(limitParam) ? limitParam : LIMIT_DEFAULT));

  // Resolve folder scope → array of folder ids (folder + descendants), or null for "all".
  let folderIdList: string[] | null = null;
  if (folderIdParam && folderIdParam !== "all") {
    if (folderIdParam === "null" || folderIdParam === "unfiled") {
      folderIdList = []; // signal: WHERE "folderId" IS NULL
    } else {
      // Pull this user's folders once and walk descendants in memory.
      const folders = await prisma.workLogFolder.findMany({
        where: { userId },
        select: { id: true, userId: true, name: true, parentId: true, color: true, icon: true, sortOrder: true, createdAt: true, updatedAt: true },
      });
      const ids = collectDescendantIds(folders as unknown as WorkLogFolder[], folderIdParam);
      folderIdList = [...ids];
      // If the supplied folderId isn't this user's, ids === {folderIdParam} and the
      // userId predicate below ensures zero rows leak.
    }
  }

  // Folder predicate fragment (parameterized).
  const folderPredicate: Prisma.Sql = folderIdList === null
    ? Prisma.sql`TRUE`
    : folderIdList.length === 0
      ? Prisma.sql`"folderId" IS NULL`
      : Prisma.sql`"folderId" IN (${Prisma.join(folderIdList)})`;

  // Two-stage query:
  //   ranked CTE → pick top-N by ts_rank_cd against plainto_tsquery
  //   outer SELECT → compute ts_headline only on those N rows
  const rows = await prisma.$queryRaw<SearchRow[]>(Prisma.sql`
    WITH ranked AS (
      SELECT
        "id",
        "title",
        "content",
        "folderId",
        "date",
        ts_rank_cd("search_vector", plainto_tsquery('english', ${qRaw})) AS rank
      FROM "WorkLog"
      WHERE "userId" = ${userId}
        AND ${folderPredicate}
        AND "search_vector" @@ plainto_tsquery('english', ${qRaw})
      ORDER BY rank DESC, "date" DESC
      LIMIT ${limit}
    )
    SELECT
      "id",
      "title",
      ts_headline(
        'english',
        coalesce("content", ''),
        plainto_tsquery('english', ${qRaw}),
        'MaxFragments=2, MaxWords=15, MinWords=5, ShortWord=3, HighlightAll=false, StartSel=<mark>, StopSel=</mark>'
      ) AS snippet,
      "folderId",
      "date",
      rank
    FROM ranked
    ORDER BY rank DESC, "date" DESC
  `);

  return NextResponse.json({
    results: rows.map((r) => ({
      id: r.id,
      title: r.title,
      snippet: r.snippet,
      folderId: r.folderId,
      date: r.date,
      rank: Number(r.rank),
    })),
  });
}
