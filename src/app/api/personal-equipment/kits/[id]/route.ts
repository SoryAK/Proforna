import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

async function ensureOwnedKit(kitId: string, userId: string) {
  const kit = await prisma.equipmentKit.findFirst({
    where: { id: kitId, userId },
    select: { id: true },
  });
  return !!kit;
}

// GET /api/personal-equipment/kits/[id] — kit + full item list
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const kit = await prisma.equipmentKit.findFirst({
    where: { id, userId },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          equipment: {
            include: {
              photos: {
                orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
              },
            },
          },
        },
      },
    },
  });
  if (!kit) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: kit.id,
    name: kit.name,
    description: kit.description,
    color: kit.color,
    icon: kit.icon,
    isPrivate: kit.isPrivate,
    sortOrder: kit.sortOrder,
    createdAt: kit.createdAt,
    updatedAt: kit.updatedAt,
    items: kit.items.map((i) => i.equipment),
    itemIds: kit.items.map((i) => i.equipmentId),
  });
}

// PATCH /api/personal-equipment/kits/[id] — rename, recolor, OR replace itemIds
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!(await ensureOwnedKit(id, userId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        description?: string | null;
        color?: string | null;
        icon?: string | null;
        isPrivate?: boolean;
        sortOrder?: number;
        itemIds?: string[];     // full replace
        addItemIds?: string[];  // add only
        removeItemIds?: string[]; // remove only
      }
    | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const n = body.name.trim().slice(0, 80);
    if (!n) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    data.name = n;
  }
  if ("description" in body) data.description = body.description?.toString().slice(0, 500) || null;
  if ("color" in body) data.color = body.color?.toString().slice(0, 32) || null;
  if ("icon" in body) data.icon = body.icon?.toString().slice(0, 32) || null;
  if (typeof body.isPrivate === "boolean") data.isPrivate = body.isPrivate;
  if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;

  try {
    if (Object.keys(data).length > 0) {
      await prisma.equipmentKit.update({ where: { id }, data });
    }

    // Membership ops — verify ownership of any equipment ids first
    async function ownedIds(ids: string[]) {
      if (ids.length === 0) return [];
      const owned = await prisma.personalEquipment.findMany({
        where: { id: { in: ids }, userId },
        select: { id: true },
      });
      return owned.map((o) => o.id);
    }

    if (Array.isArray(body.itemIds)) {
      const valid = await ownedIds(body.itemIds.filter((s): s is string => typeof s === "string"));
      await prisma.$transaction([
        prisma.equipmentKitItem.deleteMany({ where: { kitId: id } }),
        ...(valid.length
          ? [
              prisma.equipmentKitItem.createMany({
                data: valid.map((equipmentId, idx) => ({ kitId: id, equipmentId, sortOrder: idx })),
                skipDuplicates: true,
              }),
            ]
          : []),
      ]);
    } else {
      if (Array.isArray(body.addItemIds) && body.addItemIds.length) {
        const valid = await ownedIds(body.addItemIds);
        if (valid.length) {
          await prisma.equipmentKitItem.createMany({
            data: valid.map((equipmentId) => ({ kitId: id, equipmentId })),
            skipDuplicates: true,
          });
        }
      }
      if (Array.isArray(body.removeItemIds) && body.removeItemIds.length) {
        await prisma.equipmentKitItem.deleteMany({
          where: { kitId: id, equipmentId: { in: body.removeItemIds } },
        });
      }
    }

    const updated = await prisma.equipmentKit.findUnique({
      where: { id },
      include: { items: { select: { equipmentId: true } } },
    });
    return NextResponse.json({
      ...updated,
      itemIds: updated?.items.map((i) => i.equipmentId) ?? [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    if (msg.toLowerCase().includes("unique")) {
      return NextResponse.json({ error: "A kit with that name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/personal-equipment/kits/[id]
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await ensureOwnedKit(id, userId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.equipmentKit.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
