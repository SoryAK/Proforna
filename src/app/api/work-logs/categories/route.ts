/**
 * /api/work-logs/categories
 *
 * GET  → list every category belonging to the signed-in user. On first load
 *        (zero rows for this user), auto-seeds task/project/meeting AND any
 *        legacy `WorkLog.category` strings the user already has on their
 *        notes (e.g. "training", "maintenance" from the previous hard-coded
 *        list). The reserved name "other" is never seeded; it's a permanent
 *        virtual fallback bucket rendered by the UI.
 *
 * POST → create a new category. Body: `{ name }`. Rejects empty, >40-char,
 *        the reserved "other", and case-insensitive duplicates per user.
 *
 * Categories coexist with WorkLogFolder: the folder is a *location* in a
 * tree, the category is a cross-cutting *kind* tag. `WorkLog.category`
 * continues to hold the category NAME (free-form string), not a FK — see
 * the schema comment on model WorkLogCategory.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import {
  WORKLOG_CATEGORY_FALLBACK,
  WORKLOG_CATEGORY_NAME_MAX,
  WORKLOG_CATEGORY_SEEDS,
  isReservedCategoryName,
  validateWorklogCategoryName,
} from "@/lib/worklog-categories";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.workLogCategory.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  if (existing.length > 0) {
    return NextResponse.json({ categories: existing });
  }

  // ── First-load seed branch ─────────────────────────────────────────────
  // Combine the 3 default seeds with any legacy `WorkLog.category` strings
  // already on the user's notes so they don't lose access to existing tags.
  const legacy = await prisma.workLog.findMany({
    where: { userId },
    select: { category: true },
    distinct: ["category"],
  });

  const seedSet = new Set<string>(WORKLOG_CATEGORY_SEEDS);
  for (const row of legacy) {
    const name = (row.category ?? "").trim();
    if (!name) continue;
    if (isReservedCategoryName(name)) continue; // skip "other"
    if (name.length > WORKLOG_CATEGORY_NAME_MAX) continue; // skip malformed legacy strings
    // De-dupe case-insensitively against seeds already in the set.
    const lower = name.toLowerCase();
    let dup = false;
    for (const s of seedSet) {
      if (s.toLowerCase() === lower) { dup = true; break; }
    }
    if (!dup) seedSet.add(name);
  }

  // Stable order: the 3 defaults first, then legacy entries alphabetically.
  const seeds = Array.from(seedSet);
  const defaults = WORKLOG_CATEGORY_SEEDS.filter((s) => seeds.includes(s));
  const others = seeds.filter((s) => !WORKLOG_CATEGORY_SEEDS.includes(s)).sort();
  const ordered = [...defaults, ...others];

  if (ordered.length > 0) {
    await prisma.workLogCategory.createMany({
      data: ordered.map((name, idx) => ({ userId, name, sortOrder: idx })),
      skipDuplicates: true,
    });
  }

  const seeded = await prisma.workLogCategory.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ categories: seeded });
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json()) as { name?: unknown };
    const rawName = typeof body.name === "string" ? body.name : "";
    const nameError = validateWorklogCategoryName(rawName);
    if (nameError) {
      return NextResponse.json({ error: nameError }, { status: 400 });
    }

    const trimmed = rawName.trim();

    // Case-insensitive duplicate check, scoped to this user.
    const collision = await prisma.workLogCategory.findFirst({
      where: { userId, name: { equals: trimmed, mode: "insensitive" } },
      select: { id: true },
    });
    if (collision) {
      return NextResponse.json(
        { error: "A category with that name already exists" },
        { status: 409 },
      );
    }

    // Append at the end — read the current max sortOrder.
    const last = await prisma.workLogCategory.findMany({
      where: { userId },
      orderBy: { sortOrder: "desc" },
      take: 1,
      select: { sortOrder: true },
    });
    const nextSortOrder = (last[0]?.sortOrder ?? -1) + 1;

    const created = await prisma.workLogCategory.create({
      data: { userId, name: trimmed, sortOrder: nextSortOrder },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// Avoid Next collecting WORKLOG_CATEGORY_FALLBACK as unused —
// it is conceptually part of this module's contract surface and is
// re-exported for client code via the helper module.
void WORKLOG_CATEGORY_FALLBACK;
