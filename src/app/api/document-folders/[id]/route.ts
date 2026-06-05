import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { Prisma } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

const NAME_MAX = 120;

/**
 * Walks the descendant set of a folder (BFS) and returns a Set of folder ids
 * that includes the root id and every descendant. Used to hard-prevent
 * moving a folder into itself or one of its own descendants.
 */
async function collectDescendantIds(rootId: string, userId: string): Promise<Set<string>> {
  const result = new Set<string>([rootId]);
  let frontier: string[] = [rootId];
  while (frontier.length > 0) {
    const children = await prisma.documentFolder.findMany({
      where: { userId, parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = [];
    for (const c of children) {
      if (!result.has(c.id)) {
        result.add(c.id);
        frontier.push(c.id);
      }
    }
  }
  return result;
}

/**
 * GET /api/document-folders/[id]
 * Returns folder + children + documents (one-level shallow).
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const folder = await prisma.documentFolder.findFirst({
    where: { id, userId },
    select: {
      id: true,
      name: true,
      parentId: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { children: true, documents: true } },
    },
  });
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(folder);
}

/**
 * PATCH /api/document-folders/[id]
 * Body: { name?: string, parentId?: string | null }
 * - Rename: just `name` (unique-sibling rule enforced by DB)
 * - Move:   `parentId` (null = root). Self/descendant target is rejected with 400.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { name, parentId } = (body ?? {}) as { name?: unknown; parentId?: unknown };

  // Confirm folder belongs to this user.
  const existing = await prisma.documentFolder.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: { name?: string; parentId?: string | null } = {};

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0 || name.length > NAME_MAX) {
      return NextResponse.json({ error: "Invalid folder name" }, { status: 400 });
    }
    data.name = name.trim();
  }

  if (parentId !== undefined) {
    const target = parentId === null || parentId === "" ? null : (parentId as string);

    if (target !== null) {
      if (typeof target !== "string") {
        return NextResponse.json({ error: "Invalid parentId" }, { status: 400 });
      }
      // Hard-prevent moving the folder into itself or any of its descendants.
      const blocked = await collectDescendantIds(id, userId);
      if (blocked.has(target)) {
        return NextResponse.json(
          { error: "Cannot move a folder into itself or its descendants" },
          { status: 400 }
        );
      }
      // Verify target parent belongs to this user.
      const parent = await prisma.documentFolder.findFirst({
        where: { id: target, userId },
        select: { id: true },
      });
      if (!parent) {
        return NextResponse.json({ error: "Target folder not found" }, { status: 404 });
      }
    }

    data.parentId = target;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  }

  try {
    const updated = await prisma.documentFolder.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        parentId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "A folder with that name already exists here" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to update folder" }, { status: 500 });
  }
}

/**
 * DELETE /api/document-folders/[id]?cascade=1
 * - If folder has child folders or documents and `cascade !== "1"`, returns 409 with counts
 *   so the UI can show a confirm-modal listing what would be deleted.
 * - Cascade behavior:
 *     * Child folders: removed (Postgres FK ON DELETE CASCADE chains down)
 *     * Documents inside cascaded folders: folderId set to NULL (becomes root-level orphan)
 *       \u2014 documents are NEVER deleted by folder cascade.
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const cascade = new URL(req.url).searchParams.get("cascade") === "1";

  const folder = await prisma.documentFolder.findFirst({
    where: { id, userId },
    select: {
      id: true,
      _count: { select: { children: true, documents: true } },
    },
  });
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isEmpty = folder._count.children === 0 && folder._count.documents === 0;
  if (!isEmpty && !cascade) {
    return NextResponse.json(
      {
        error: "Folder is not empty",
        children: folder._count.children,
        documents: folder._count.documents,
      },
      { status: 409 }
    );
  }

  await prisma.documentFolder.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
