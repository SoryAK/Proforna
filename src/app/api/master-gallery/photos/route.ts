import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// GET — Photos for a master-gallery folder.
//
// Query params:
//   view=banners                      → all isBanner photos across the user
//   positionId=X                      → all photos in that position (any album)
//   positionId=X&albumId=Y            → photos in that album
//   positionId=X&albumId=__unfiled__  → photos in position with no album
//
// Always scoped to the current user; returns 404 on unowned position.
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view");
  const positionId = searchParams.get("positionId");
  const albumId = searchParams.get("albumId");

  // Built per-branch; Prisma's relation filter (`workHistory: { userId }`)
  // typing is awkward to inline here, so we use a permissive shape and
  // rely on Prisma's runtime + generated types at call sites.
  let where: Record<string, unknown>;

  if (view === "banners") {
    where = { isBanner: true, workHistory: { userId } };
  } else if (positionId) {
    const position = await prisma.workHistory.findFirst({
      where: { id: positionId, userId },
      select: { id: true },
    });
    if (!position)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    where = { workHistoryId: positionId };
    if (albumId === "__unfiled__") where.albumId = null;
    else if (albumId) where.albumId = albumId;
  } else {
    return NextResponse.json(
      { error: "view=banners or positionId required" },
      { status: 400 },
    );
  }

  const photos = await prisma.galleryPhoto.findMany({
    where,
    include: {
      album: { select: { id: true, name: true } },
      workHistory: { select: { id: true, company: true, title: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { isCover: "desc" }, { createdAt: "asc" }],
  });

  // Public API exposes the position name as `role` (matches client types).
  // Map Prisma's underlying `title` field to that.
  const out = photos.map((p) => ({
    ...p,
    workHistory: p.workHistory
      ? { id: p.workHistory.id, company: p.workHistory.company, role: p.workHistory.title }
      : p.workHistory,
  }));

  return NextResponse.json(out);
}
