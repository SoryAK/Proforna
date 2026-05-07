import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().slice(0, 80);
  return v.length > 0 ? v : null;
}

// GET /api/personal-equipment/kits — list all kits for the user, with item ids
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const kits = await prisma.equipmentKit.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      items: {
        select: { equipmentId: true, sortOrder: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  return NextResponse.json(
    kits.map((k) => ({
      id: k.id,
      name: k.name,
      description: k.description,
      color: k.color,
      icon: k.icon,
      isPrivate: k.isPrivate,
      sortOrder: k.sortOrder,
      createdAt: k.createdAt,
      updatedAt: k.updatedAt,
      itemIds: k.items.map((i) => i.equipmentId),
    }))
  );
}

// POST /api/personal-equipment/kits — create a kit, optionally seeded with itemIds
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        description?: string | null;
        color?: string | null;
        icon?: string | null;
        isPrivate?: boolean;
        itemIds?: string[];
      }
    | null;

  const name = sanitizeName(body?.name);
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const ids = Array.isArray(body?.itemIds)
    ? Array.from(new Set(body!.itemIds.filter((s): s is string => typeof s === "string")))
    : [];

  // Verify ownership of seed items
  let validIds: string[] = [];
  if (ids.length > 0) {
    const owned = await prisma.personalEquipment.findMany({
      where: { id: { in: ids }, userId },
      select: { id: true },
    });
    validIds = owned.map((o) => o.id);
  }

  try {
    const created = await prisma.equipmentKit.create({
      data: {
        userId,
        name,
        description: body?.description?.toString().slice(0, 500) || null,
        color: body?.color?.toString().slice(0, 32) || null,
        icon: body?.icon?.toString().slice(0, 32) || null,
        isPrivate: body?.isPrivate !== false,
        items: validIds.length
          ? {
              create: validIds.map((equipmentId, idx) => ({ equipmentId, sortOrder: idx })),
            }
          : undefined,
      },
      include: { items: { select: { equipmentId: true } } },
    });

    return NextResponse.json(
      {
        id: created.id,
        name: created.name,
        description: created.description,
        color: created.color,
        icon: created.icon,
        isPrivate: created.isPrivate,
        sortOrder: created.sortOrder,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        itemIds: created.items.map((i) => i.equipmentId),
      },
      { status: 201 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Create failed";
    if (msg.toLowerCase().includes("unique")) {
      return NextResponse.json({ error: "A kit with that name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
