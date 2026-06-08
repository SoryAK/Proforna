/**
 * /api/work-logs/categories/[id]
 *
 * PATCH  → rename a category. Body: `{ name }`.
 *          - 404 if the category doesn't belong to the user (IDOR guard).
 *          - 400 for invalid / reserved names.
 *          - 409 if the new name collides with another of the user's
 *            categories (case-insensitive).
 *          - Same-canonical-name renames (e.g. "standup" → "Standup") update
 *            the display row only, no notes rewrite needed.
 *          - True renames run a $transaction: bulk-update the user's
 *            WorkLog.category from oldName → newName, then update the row.
 *
 * DELETE → remove a category. In one $transaction:
 *          - Bulk-rewrite the user's WorkLog.category from this row's name
 *            to WORKLOG_CATEGORY_FALLBACK ("other").
 *          - Delete the category row.
 *          Returns `{ ok: true, rewroteNotes: N }`.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import {
  WORKLOG_CATEGORY_FALLBACK,
  validateWorklogCategoryName,
} from "@/lib/worklog-categories";

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteCtx) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const existing = await prisma.workLogCategory.findFirst({
      where: { id, userId },
      select: { id: true, name: true, sortOrder: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = (await request.json()) as { name?: unknown };
    const rawName = typeof body.name === "string" ? body.name : "";
    const nameError = validateWorklogCategoryName(rawName);
    if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });

    const newName = rawName.trim();
    const sameCanonical = newName.toLowerCase() === existing.name.toLowerCase();

    if (!sameCanonical) {
      // Collision check against the user's other categories.
      const collision = await prisma.workLogCategory.findFirst({
        where: {
          userId,
          name: { equals: newName, mode: "insensitive" },
          NOT: { id },
        },
        select: { id: true },
      });
      if (collision) {
        return NextResponse.json(
          { error: "A category with that name already exists" },
          { status: 409 },
        );
      }

      // True rename — rewrite notes + update display in a transaction.
      const [, updated] = await prisma.$transaction([
        prisma.workLog.updateMany({
          where: { userId, category: existing.name },
          data: { category: newName },
        }),
        prisma.workLogCategory.update({
          where: { id },
          data: { name: newName },
        }),
      ]);
      return NextResponse.json(updated);
    }

    // Same canonical name — just refresh the display string (e.g. casing).
    const updated = await prisma.workLogCategory.update({
      where: { id },
      data: { name: newName },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteCtx) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const existing = await prisma.workLogCategory.findFirst({
      where: { id, userId },
      select: { id: true, name: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [rewrite] = (await prisma.$transaction([
      prisma.workLog.updateMany({
        where: { userId, category: existing.name },
        data: { category: WORKLOG_CATEGORY_FALLBACK },
      }),
      prisma.workLogCategory.delete({ where: { id } }),
    ])) as [{ count: number }, unknown];

    return NextResponse.json({ ok: true, rewroteNotes: rewrite.count });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
