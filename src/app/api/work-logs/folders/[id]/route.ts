/**
 * /api/work-logs/folders/[id]
 *
 * PATCH  → rename, recolor, re-icon, or reparent (move). Reparenting runs an
 *          authoritative cycle-prevention walk: the new parent must not be a
 *          descendant of the folder being moved.
 * DELETE → remove the folder. Required query: `?mode=orphan|delete`.
 *          • `orphan` (default) — sets each child note's `folderId` to NULL
 *            (Unfiled) and re-roots direct child folders. Reversible-ish.
 *          • `delete` — cascades through descendant folders AND deletes every
 *            note filed under any of them. Caller must also send a typed
 *            confirmation header (`x-folder-name-confirm`) matching the
 *            folder's name to avoid catastrophic mis-clicks.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import {
  FOLDER_MAX_DEPTH,
  FOLDER_NAME_MAX,
  validateFolderName,
} from "@/lib/worklog-folders";

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteCtx) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const existing = await prisma.workLogFolder.findFirst({
      where: { id, userId },
      select: { id: true, parentId: true, name: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = (await request.json()) as Record<string, unknown>;
    const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

    const data: Record<string, unknown> = {};

    if (hasOwn("name")) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const nameError = validateFolderName(name);
      if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });
      data.name = name.slice(0, FOLDER_NAME_MAX);
    }

    if (hasOwn("color")) {
      data.color = body.color == null ? null : String(body.color).slice(0, 32);
    }
    if (hasOwn("icon")) {
      data.icon = body.icon == null ? null : String(body.icon).slice(0, 64);
    }
    if (hasOwn("sortOrder") && typeof body.sortOrder === "number") {
      data.sortOrder = body.sortOrder;
    }

    if (hasOwn("parentId")) {
      const nextParentId = body.parentId ? String(body.parentId) : null;

      if (nextParentId === id) {
        return NextResponse.json({ error: "A folder cannot be its own parent" }, { status: 400 });
      }

      if (nextParentId) {
        // Ownership check on new parent.
        const parent = await prisma.workLogFolder.findFirst({
          where: { id: nextParentId, userId },
          select: { id: true },
        });
        if (!parent) return NextResponse.json({ error: "Parent folder not found" }, { status: 404 });

        // Cycle check: walk up from new parent; if we encounter `id`, it's a cycle.
        // Also compute depth at the same time to enforce FOLDER_MAX_DEPTH.
        const allFolders = await prisma.workLogFolder.findMany({
          where: { userId },
          select: { id: true, parentId: true },
        });
        const byId = new Map(allFolders.map((f) => [f.id, f]));

        let cursor: { id: string; parentId: string | null } | undefined = byId.get(nextParentId);
        const ancestors = new Set<string>();
        let depth = 1; // depth the moving folder will sit at (parent depth + 1)
        while (cursor) {
          if (ancestors.has(cursor.id)) break; // defensive: pre-existing cycle in data
          ancestors.add(cursor.id);
          if (cursor.id === id) {
            return NextResponse.json(
              { error: "Cannot move a folder into one of its descendants" },
              { status: 400 },
            );
          }
          if (!cursor.parentId) break;
          cursor = byId.get(cursor.parentId);
          depth += 1;
        }

        // Compute deepest descendant depth of the moving folder.
        const childrenOf = new Map<string, string[]>();
        for (const f of allFolders) {
          if (!f.parentId) continue;
          if (!childrenOf.has(f.parentId)) childrenOf.set(f.parentId, []);
          childrenOf.get(f.parentId)!.push(f.id);
        }
        const maxDescendantDepth = (rootId: string): number => {
          let max = 0;
          const walk = (nodeId: string, d: number) => {
            if (d > max) max = d;
            for (const child of childrenOf.get(nodeId) ?? []) walk(child, d + 1);
          };
          walk(rootId, 0);
          return max;
        };
        const subtreeDepth = maxDescendantDepth(id);
        if (depth + subtreeDepth >= FOLDER_MAX_DEPTH) {
          return NextResponse.json(
            { error: `Move would exceed the ${FOLDER_MAX_DEPTH}-level nesting limit` },
            { status: 400 },
          );
        }
      }

      data.parentId = nextParentId;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const updated = await prisma.workLogFolder.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteCtx) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const mode = (searchParams.get("mode") ?? "orphan").toLowerCase();

    const folder = await prisma.workLogFolder.findFirst({
      where: { id, userId },
      select: { id: true, name: true },
    });
    if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (mode === "delete") {
      // Hard delete — require name confirmation header to avoid mass loss.
      const confirm = request.headers.get("x-folder-name-confirm") ?? "";
      if (confirm.trim() !== folder.name) {
        return NextResponse.json(
          { error: "Confirmation name does not match" },
          { status: 400 },
        );
      }

      // Collect the entire subtree id-set.
      const allFolders = await prisma.workLogFolder.findMany({
        where: { userId },
        select: { id: true, parentId: true },
      });
      const childrenOf = new Map<string, string[]>();
      for (const f of allFolders) {
        if (!f.parentId) continue;
        if (!childrenOf.has(f.parentId)) childrenOf.set(f.parentId, []);
        childrenOf.get(f.parentId)!.push(f.id);
      }
      const subtree = new Set<string>([id]);
      const stack = [id];
      while (stack.length) {
        const cur = stack.pop()!;
        for (const child of childrenOf.get(cur) ?? []) {
          if (!subtree.has(child)) {
            subtree.add(child);
            stack.push(child);
          }
        }
      }

      const ids = Array.from(subtree);
      // Notes first (FK), then folders (children before parents not required
      // because the parent FK is ON DELETE SET NULL, but order keeps cascade tidy).
      await prisma.$transaction([
        prisma.workLog.deleteMany({ where: { userId, folderId: { in: ids } } }),
        prisma.workLogFolder.deleteMany({ where: { userId, id: { in: ids } } }),
      ]);

      return NextResponse.json({ ok: true, deletedFolders: ids.length });
    }

    // Default: orphan mode — children notes go to Unfiled (folderId = null),
    // direct child folders become roots (parentId = null).
    await prisma.$transaction([
      prisma.workLog.updateMany({
        where: { userId, folderId: id },
        data: { folderId: null },
      }),
      prisma.workLogFolder.updateMany({
        where: { userId, parentId: id },
        data: { parentId: null },
      }),
      prisma.workLogFolder.delete({ where: { id } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
