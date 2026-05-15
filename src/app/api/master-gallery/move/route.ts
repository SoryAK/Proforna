import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// PATCH — Cross-job move for one or more photos.
//
// Body: { ids: string[], targetPositionId: string, targetAlbumId?: string | null }
//
// The existing `/api/gallery` PATCH `action: "move"` only re-files within
// the SAME position. Moving a photo to a different job changes its
// `workHistoryId`; if an `albumId` was set it is cleared (albums belong
// to a single position) unless `targetAlbumId` is explicitly provided
// and belongs to the target position.
//
// Side effects:
//   - If a moved photo was the source position's cover, that position's
//     coverImage is recomputed (next available photo, else null).
//   - The photo's `isCover` is always cleared on move (the new owner
//     position does not inherit cover status).
export async function PATCH(request: Request) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    ids?: unknown;
    targetPositionId?: unknown;
    targetAlbumId?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? (body.ids as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  const targetPositionId =
    typeof body.targetPositionId === "string" ? body.targetPositionId : "";
  const targetAlbumId =
    typeof body.targetAlbumId === "string"
      ? body.targetAlbumId
      : body.targetAlbumId === null
        ? null
        : undefined;

  if (ids.length === 0)
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  if (!targetPositionId)
    return NextResponse.json(
      { error: "targetPositionId required" },
      { status: 400 },
    );

  // Verify target position belongs to caller.
  const target = await prisma.workHistory.findFirst({
    where: { id: targetPositionId, userId },
    select: { id: true },
  });
  if (!target)
    return NextResponse.json(
      { error: "Target position not found" },
      { status: 404 },
    );

  // Verify target album (if provided) belongs to target position.
  if (targetAlbumId) {
    const album = await prisma.galleryAlbum.findFirst({
      where: { id: targetAlbumId, workHistoryId: targetPositionId },
      select: { id: true },
    });
    if (!album)
      return NextResponse.json(
        { error: "Target album not found in target position" },
        { status: 400 },
      );
  }

  // Verify all source photos belong to the user.
  const photos = await prisma.galleryPhoto.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      workHistoryId: true,
      isCover: true,
      workHistory: { select: { userId: true } },
    },
  });
  if (photos.length !== ids.length)
    return NextResponse.json(
      { error: "One or more photos not found" },
      { status: 404 },
    );
  if (photos.some((p) => p.workHistory.userId !== userId))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Perform move.
  await prisma.galleryPhoto.updateMany({
    where: { id: { in: ids } },
    data: {
      workHistoryId: targetPositionId,
      albumId: targetAlbumId ?? null,
      isCover: false,
    },
  });

  // Recompute coverImage on any source positions whose cover photo moved.
  const sourcePositionsLosingCover = Array.from(
    new Set(
      photos
        .filter((p) => p.isCover && p.workHistoryId !== targetPositionId)
        .map((p) => p.workHistoryId),
    ),
  );
  for (const sourceId of sourcePositionsLosingCover) {
    const next = await prisma.galleryPhoto.findFirst({
      where: { workHistoryId: sourceId },
      orderBy: { createdAt: "asc" },
      select: { filePath: true },
    });
    await prisma.workHistory.update({
      where: { id: sourceId },
      data: { coverImage: next?.filePath ?? null },
    });
  }

  return NextResponse.json({ success: true, moved: ids.length });
}
