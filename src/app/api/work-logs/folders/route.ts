/**
 * /api/work-logs/folders
 *
 * GET  → list every folder belonging to the signed-in user, each enriched
 *        with a `noteCount` (direct children only, NOT recursive).
 * POST → create a new folder. Body: `{ name, parentId?, color?, icon? }`.
 *        Server enforces 1..80 char name, parent ownership, and FOLDER_MAX_DEPTH.
 *
 * Folders form an adjacency-list tree per user. The tree is built client-side
 * from the flat list. Cycle prevention happens on PATCH (see [id]/route.ts).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import {
  FOLDER_MAX_DEPTH,
  FOLDER_NAME_MAX,
  validateFolderName,
} from "@/lib/worklog-folders";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // One query for folders, one for per-folder note counts. Grouping by
  // folderId avoids loading every note.
  const [folders, counts] = await Promise.all([
    prisma.workLogFolder.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.workLog.groupBy({
      by: ["folderId"],
      where: { userId, folderId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const countByFolderId = new Map<string, number>();
  for (const row of counts) {
    if (row.folderId) countByFolderId.set(row.folderId, row._count._all);
  }

  const enriched = folders.map((f) => ({
    ...f,
    noteCount: countByFolderId.get(f.id) ?? 0,
  }));

  // Also report how many notes are Unfiled so the rail can show a count.
  const unfiledCount = await prisma.workLog.count({
    where: { userId, folderId: null },
  });

  return NextResponse.json({ folders: enriched, unfiledCount });
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json()) as {
      name?: unknown;
      parentId?: unknown;
      color?: unknown;
      icon?: unknown;
    };

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const nameError = validateFolderName(name);
    if (nameError) {
      return NextResponse.json({ error: nameError }, { status: 400 });
    }

    const parentId = body.parentId ? String(body.parentId) : null;
    if (parentId) {
      const parent = await prisma.workLogFolder.findFirst({
        where: { id: parentId, userId },
        select: { id: true },
      });
      if (!parent) {
        return NextResponse.json({ error: "Parent folder not found" }, { status: 404 });
      }
      // Depth check — walk up from the proposed parent until we hit a root.
      const ancestors = await prisma.workLogFolder.findMany({
        where: { userId },
        select: { id: true, parentId: true },
      });
      const byId = new Map(ancestors.map((a) => [a.id, a]));
      let depth = 1;
      let cursor = byId.get(parentId);
      const seen = new Set<string>();
      while (cursor && cursor.parentId && !seen.has(cursor.id)) {
        seen.add(cursor.id);
        cursor = byId.get(cursor.parentId);
        depth += 1;
      }
      if (depth >= FOLDER_MAX_DEPTH) {
        return NextResponse.json(
          { error: `Folders can be nested at most ${FOLDER_MAX_DEPTH} levels deep` },
          { status: 400 },
        );
      }
    }

    const color = typeof body.color === "string" ? body.color.slice(0, 32) : null;
    const icon = typeof body.icon === "string" ? body.icon.slice(0, 64) : null;

    const folder = await prisma.workLogFolder.create({
      data: {
        userId,
        name: name.slice(0, FOLDER_NAME_MAX),
        parentId,
        color,
        icon,
      },
    });

    return NextResponse.json({ ...folder, noteCount: 0 }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
