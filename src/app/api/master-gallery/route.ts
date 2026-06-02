import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// GET — Folder tree for the master gallery.
// Returns one node per WorkHistory position the user owns, including:
//   - basic identity (company, role, dates)
//   - photo / banner counts
//   - a single cover thumbnail (cover photo > first photo > null)
//   - albums with their own photo count + cover thumbnail
// Also returns a flat `banners` summary for the virtual top-level
// "Banner Photos" folder so the explorer can show its count without a
// second request.
export async function GET() {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const positions = await prisma.workHistory.findMany({
    where: { userId },
    select: {
      id: true,
      company: true,
      title: true,
      startDate: true,
      endDate: true,
      coverImage: true,
      _count: { select: { galleryPhotos: true } },
      galleryPhotos: {
        where: { isBanner: true },
        select: { id: true },
      },
      galleryAlbums: {
        select: {
          id: true,
          name: true,
          createdAt: true,
          _count: { select: { photos: true } },
          photos: {
            select: { id: true, filePath: true, isCover: true },
            orderBy: [{ isCover: "desc" }, { createdAt: "asc" }],
            take: 1,
          },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
  });

  // For positions with no explicit coverImage, pick the first gallery photo
  // as a fallback thumbnail. Done in a single follow-up query keyed by id.
  const needsFallback = positions
    .filter((p) => !p.coverImage && p._count.galleryPhotos > 0)
    .map((p) => p.id);

  const fallbackCovers = needsFallback.length
    ? await prisma.galleryPhoto.findMany({
        where: { workHistoryId: { in: needsFallback } },
        select: { workHistoryId: true, filePath: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const firstByPosition = new Map<string, string>();
  for (const p of fallbackCovers) {
    if (!firstByPosition.has(p.workHistoryId)) {
      firstByPosition.set(p.workHistoryId, p.filePath);
    }
  }

  // Total banners across the user (used by the virtual folder card).
  const bannerCount = await prisma.galleryPhoto.count({
    where: { workHistory: { userId }, isBanner: true },
  });

  const totalPhotos = positions.reduce(
    (sum, p) => sum + p._count.galleryPhotos,
    0,
  );

  const tree = positions.map((p) => ({
    id: p.id,
    company: p.company,
    role: p.title,
    startDate: p.startDate,
    endDate: p.endDate,
    coverImage: p.coverImage ?? firstByPosition.get(p.id) ?? null,
    photoCount: p._count.galleryPhotos,
    bannerCount: p.galleryPhotos.length,
    albums: p.galleryAlbums.map((a) => ({
      id: a.id,
      name: a.name,
      photoCount: a._count.photos,
      coverPhoto: a.photos[0]?.filePath ?? null,
    })),
  }));

  return NextResponse.json({
    positions: tree,
    totalPhotos,
    bannerCount,
  });
}
