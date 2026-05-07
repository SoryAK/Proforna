import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getUserId } from "@/lib/auth-utils";

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB — modern phone photos
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];

// GET — list gallery photos for a position
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const positionId = searchParams.get("positionId");
  if (!positionId)
    return NextResponse.json({ error: "positionId required" }, { status: 400 });

  const position = await prisma.workHistory.findFirst({
    where: { id: positionId, userId },
    select: { id: true },
  });
  if (!position)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const photos = await prisma.galleryPhoto.findMany({
    where: { workHistoryId: positionId },
    include: { album: { select: { id: true, name: true } } },
    orderBy: [{ sortOrder: "asc" }, { isCover: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(photos);
}

// POST — upload a gallery photo
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const positionId = formData.get("positionId") as string | null;
    let albumId = (formData.get("albumId") as string | null) || null;
    const albumName = ((formData.get("albumName") as string | null) || "").trim();
    const caption = (formData.get("caption") as string) || null;
    const isCover = formData.get("isCover") === "true";

    if (!file || !positionId)
      return NextResponse.json({ error: "file and positionId required" }, { status: 400 });

    if (!ALLOWED_TYPES.includes(file.type))
      return NextResponse.json({ error: "Invalid file type. Use JPEG, PNG, WebP, GIF, or HEIC." }, { status: 400 });

    if (file.size > MAX_SIZE)
      return NextResponse.json({ error: "File too large. Max 25 MB." }, { status: 400 });

    const position = await prisma.workHistory.findFirst({
      where: { id: positionId, userId },
      select: { id: true },
    });
    if (!position)
      return NextResponse.json({ error: "Position not found" }, { status: 404 });

    if (albumId) {
      const album = await prisma.galleryAlbum.findFirst({
        where: { id: albumId, workHistoryId: positionId },
        include: { workHistory: { select: { userId: true } } },
      });
      if (!album || album.workHistory.userId !== userId)
        return NextResponse.json({ error: "Album not found" }, { status: 404 });
    } else if (albumName) {
      // Find-or-create album by name within this position (used by the
      // "Upload album" multi-file flow so all photos land in one album).
      const existing = await prisma.galleryAlbum.findFirst({
        where: { workHistoryId: positionId, name: albumName },
        select: { id: true },
      });
      if (existing) {
        albumId = existing.id;
      } else {
        const created = await prisma.galleryAlbum.create({
          data: { workHistoryId: positionId, name: albumName.slice(0, 80) },
          select: { id: true },
        });
        albumId = created.id;
      }
    }

    // If setting as cover, unset any existing cover
    if (isCover) {
      await prisma.galleryPhoto.updateMany({
        where: { workHistoryId: positionId, isCover: true },
        data: { isCover: false },
      });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
    const filename = `gallery-${crypto.randomBytes(8).toString("hex")}.${ext}`;

    const uploadDir = path.join(process.cwd(), "public", "uploads", "gallery");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), buffer);

    const filePath = `/uploads/gallery/${filename}`;

    const photo = await prisma.galleryPhoto.create({
      data: {
        workHistoryId: positionId,
        filePath,
        fileName: file.name,
        fileMime: file.type,
        fileSize: file.size,
        caption,
        isCover,
        albumId,
      },
    });

    // Also update the coverImage field on WorkHistory if this is the cover
    if (isCover) {
      await prisma.workHistory.update({
        where: { id: positionId },
        data: { coverImage: filePath },
      });
    }

    return NextResponse.json(photo, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PATCH — update caption, fileName, cover, tags, markers, favorite, privacy, dateTaken, rotation, sortOrder, albumId
// Also supports bulk ops: { ids: string[], action: "tag" | "move", tag?: string, albumId?: string | null }
export async function PATCH(request: Request) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();

    // ── Bulk tag ──────────────────────────────────────────────
    if (body.ids && Array.isArray(body.ids) && body.action === "tag" && body.tag) {
      // Verify all photos belong to this user
      const photos = await prisma.galleryPhoto.findMany({
        where: { id: { in: body.ids } },
        include: { workHistory: { select: { userId: true } } },
      });
      if (photos.some((p) => p.workHistory.userId !== userId))
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      for (const p of photos) {
        const existing = p.tags ? JSON.parse(p.tags) as string[] : [];
        const updated = [...new Set([...existing, body.tag as string])];
        await prisma.galleryPhoto.update({ where: { id: p.id }, data: { tags: JSON.stringify(updated) } });
      }
      return NextResponse.json({ success: true });
    }

    // ── Bulk move to album ─────────────────────────────────────
    if (body.ids && Array.isArray(body.ids) && body.action === "move") {
      const photos = await prisma.galleryPhoto.findMany({
        where: { id: { in: body.ids } },
        include: { workHistory: { select: { userId: true, id: true } } },
      });
      if (photos.length === 0)
        return NextResponse.json({ error: "No photos found" }, { status: 404 });
      if (photos.some((p) => p.workHistory.userId !== userId))
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });

      const albumId = body.albumId ?? null;
      if (albumId) {
        const album = await prisma.galleryAlbum.findUnique({
          where: { id: albumId },
          include: { workHistory: { select: { userId: true, id: true } } },
        });
        if (!album || album.workHistory.userId !== userId)
          return NextResponse.json({ error: "Album not found" }, { status: 404 });

        // Ensure moving within the same position
        if (photos.some((p) => p.workHistoryId !== album.workHistoryId)) {
          return NextResponse.json({ error: "Album must belong to the same position" }, { status: 400 });
        }
      }

      await prisma.galleryPhoto.updateMany({
        where: { id: { in: body.ids } },
        data: { albumId },
      });

      return NextResponse.json({ success: true });
    }

    // ── Bulk reorder (sortOrder array) ────────────────────────
    if (body.order && Array.isArray(body.order)) {
      // body.order = [{ id: string, sortOrder: number }]
      const ids = body.order.map((o: { id: string }) => o.id);
      const photos = await prisma.galleryPhoto.findMany({
        where: { id: { in: ids } },
        include: { workHistory: { select: { userId: true } } },
      });
      if (photos.some((p) => p.workHistory.userId !== userId))
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      for (const o of body.order as { id: string; sortOrder: number }[]) {
        await prisma.galleryPhoto.update({ where: { id: o.id }, data: { sortOrder: o.sortOrder } });
      }
      return NextResponse.json({ success: true });
    }

    // ── Single photo update ───────────────────────────────────
    const { id, caption, fileName, isCover, isFavorite, isPrivate, isBanner, annotationsPublic, tags, markers, dateTaken, rotation, sortOrder, albumId } = body;
    if (!id)
      return NextResponse.json({ error: "id required" }, { status: 400 });

    const photo = await prisma.galleryPhoto.findUnique({
      where: { id },
      include: { workHistory: { select: { userId: true, id: true } } },
    });
    if (!photo || photo.workHistory.userId !== userId)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (albumId !== undefined && albumId !== null) {
      const album = await prisma.galleryAlbum.findFirst({
        where: { id: albumId, workHistoryId: photo.workHistoryId },
        include: { workHistory: { select: { userId: true } } },
      });
      if (!album || album.workHistory.userId !== userId)
        return NextResponse.json({ error: "Album not found" }, { status: 404 });
    }

    // If setting as cover, unset others first
    if (isCover) {
      await prisma.galleryPhoto.updateMany({
        where: { workHistoryId: photo.workHistoryId, isCover: true },
        data: { isCover: false },
      });
      await prisma.workHistory.update({
        where: { id: photo.workHistoryId },
        data: { coverImage: photo.filePath },
      });
    }

    const updated = await prisma.galleryPhoto.update({
      where: { id },
      data: {
        ...(caption !== undefined && { caption }),
        ...(fileName !== undefined && { fileName: String(fileName).trim() || photo.fileName }),
        ...(isCover !== undefined && { isCover }),
        ...(isFavorite !== undefined && { isFavorite }),
        ...(isPrivate !== undefined && { isPrivate }),
        ...(isBanner !== undefined && { isBanner: !!isBanner }),
        ...(annotationsPublic !== undefined && { annotationsPublic: !!annotationsPublic }),
        ...(tags !== undefined && { tags: JSON.stringify(tags) }),
        ...(markers !== undefined && { markers: JSON.stringify(markers) }),
        ...(dateTaken !== undefined && { dateTaken: dateTaken ? new Date(dateTaken) : null }),
        ...(rotation !== undefined && { rotation: Number(rotation) % 360 }),
        ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
        ...(albumId !== undefined && { albumId }),
      },
    });

    if (isCover === false) {
      const newCover = await prisma.galleryPhoto.findFirst({
        where: { workHistoryId: photo.workHistoryId, isCover: true },
      });
      await prisma.workHistory.update({
        where: { id: photo.workHistoryId },
        data: { coverImage: newCover?.filePath ?? null },
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE — remove gallery photo(s). Single: ?id=xxx  Bulk: body { ids: string[] }
export async function DELETE(request: Request) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Bulk delete via JSON body
    let ids: string[] = [];
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await request.json();
      if (body.ids && Array.isArray(body.ids)) ids = body.ids;
    }
    if (ids.length === 0) {
      const { searchParams } = new URL(request.url);
      const id = searchParams.get("id");
      if (id) ids = [id];
    }
    if (ids.length === 0)
      return NextResponse.json({ error: "id or ids required" }, { status: 400 });

    const photos = await prisma.galleryPhoto.findMany({
      where: { id: { in: ids } },
      include: { workHistory: { select: { userId: true, id: true } } },
    });
    if (photos.some((p) => p.workHistory.userId !== userId))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    for (const photo of photos) {
      if (photo.filePath.startsWith("/uploads/")) {
        try { await unlink(path.join(process.cwd(), "public", photo.filePath)); } catch { /* gone */ }
      }
      await prisma.galleryPhoto.delete({ where: { id: photo.id } });

      if (photo.isCover) {
        const newCover = await prisma.galleryPhoto.findFirst({
          where: { workHistoryId: photo.workHistoryId },
          orderBy: { createdAt: "asc" },
        });
        await prisma.workHistory.update({
          where: { id: photo.workHistoryId },
          data: { coverImage: newCover?.filePath ?? null },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
