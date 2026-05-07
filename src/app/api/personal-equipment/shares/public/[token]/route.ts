import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/personal-equipment/shares/public/[token] — read-only public view
// No authentication. Returns owner display name + filtered items.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const share = await prisma.personalEquipmentShare.findUnique({
    where: { token },
    include: { user: { select: { name: true, image: true } } },
  });
  if (!share) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Expired" }, { status: 410 });
  }

  const where =
    share.scope === "selected"
      ? { userId: share.userId, id: { in: share.itemIds } }
      : share.scope === "kit" && share.kitId
        ? { userId: share.userId, kits: { some: { kitId: share.kitId } } }
        : { userId: share.userId };

  const items = await prisma.personalEquipment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      photos: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  // Optionally include kit metadata for kit-scoped shares
  let kitMeta: { id: string; name: string; description: string | null } | null = null;
  if (share.scope === "kit" && share.kitId) {
    const k = await prisma.equipmentKit.findUnique({
      where: { id: share.kitId },
      select: { id: true, name: true, description: true },
    });
    if (k) kitMeta = k;
  }

  // Increment view count (non-blocking; best-effort).
  prisma.personalEquipmentShare
    .update({
      where: { id: share.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    })
    .catch(() => {});

  return NextResponse.json({
    share: {
      label: share.label,
      scope: share.scope,
      kit: kitMeta,
      createdAt: share.createdAt,
      expiresAt: share.expiresAt,
      ownerName: share.user?.name ?? null,
      ownerImage: share.user?.image ?? null,
    },
    items,
  });
}
