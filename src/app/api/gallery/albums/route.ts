import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// GET — list albums for a position
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const positionId = searchParams.get("positionId");
  if (!positionId) return NextResponse.json({ error: "positionId required" }, { status: 400 });

  const position = await prisma.workHistory.findFirst({
    where: { id: positionId, userId },
    select: { id: true },
  });
  if (!position) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const albums = await prisma.galleryAlbum.findMany({
    where: { workHistoryId: positionId },
    include: {
      _count: { select: { photos: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(albums);
}

// POST — create an album
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const positionId = String(body.positionId ?? "").trim();
    const name = String(body.name ?? "").trim();

    if (!positionId || !name) {
      return NextResponse.json({ error: "positionId and name required" }, { status: 400 });
    }

    const position = await prisma.workHistory.findFirst({
      where: { id: positionId, userId },
      select: { id: true },
    });
    if (!position) return NextResponse.json({ error: "Position not found" }, { status: 404 });

    const existing = await prisma.galleryAlbum.findFirst({
      where: { workHistoryId: positionId, name },
      select: { id: true },
    });
    if (existing) return NextResponse.json({ error: "Album name already exists" }, { status: 409 });

    const album = await prisma.galleryAlbum.create({
      data: { workHistoryId: positionId, name },
    });

    return NextResponse.json(album, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PATCH — rename/reorder album
export async function PATCH(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const id = String(body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const album = await prisma.galleryAlbum.findUnique({
      where: { id },
      include: { workHistory: { select: { userId: true, id: true } } },
    });
    if (!album || album.workHistory.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const nextName = body.name === undefined ? undefined : String(body.name ?? "").trim();
    if (nextName !== undefined && nextName.length === 0) {
      return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    }

    if (nextName !== undefined && nextName !== album.name) {
      const dupe = await prisma.galleryAlbum.findFirst({
        where: {
          workHistoryId: album.workHistoryId,
          name: nextName,
          id: { not: album.id },
        },
      });
      if (dupe) return NextResponse.json({ error: "Album name already exists" }, { status: 409 });
    }

    const updated = await prisma.galleryAlbum.update({
      where: { id },
      data: {
        ...(nextName !== undefined && { name: nextName }),
        ...(body.sortOrder !== undefined && { sortOrder: Number(body.sortOrder) }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE — remove an album and optionally move photos
export async function DELETE(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const contentType = request.headers.get("content-type") ?? "";
    let albumId: string | null = null;
    let moveToAlbumId: string | null = null;

    if (contentType.includes("application/json")) {
      const body = await request.json();
      albumId = body.id ?? null;
      moveToAlbumId = body.moveToAlbumId ?? null;
    } else {
      const { searchParams } = new URL(request.url);
      albumId = searchParams.get("id");
      moveToAlbumId = searchParams.get("moveToAlbumId");
    }

    if (!albumId) return NextResponse.json({ error: "id required" }, { status: 400 });

    const album = await prisma.galleryAlbum.findUnique({
      where: { id: albumId },
      include: { workHistory: { select: { userId: true, id: true } } },
    });
    if (!album || album.workHistory.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (moveToAlbumId) {
      const target = await prisma.galleryAlbum.findUnique({
        where: { id: moveToAlbumId },
      });
      if (!target || target.workHistoryId !== album.workHistoryId) {
        return NextResponse.json({ error: "Target album invalid" }, { status: 400 });
      }
      await prisma.galleryPhoto.updateMany({
        where: { albumId },
        data: { albumId: moveToAlbumId },
      });
    } else {
      await prisma.galleryPhoto.updateMany({
        where: { albumId },
        data: { albumId: null },
      });
    }

    await prisma.galleryAlbum.delete({ where: { id: albumId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
