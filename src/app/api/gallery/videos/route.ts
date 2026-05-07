import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getUserId } from "@/lib/auth-utils";

// Keep aligned with next.config.ts -> experimental.proxyClientMaxBodySize ("50mb").
const MAX_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime", // .mov
  "video/x-matroska", // .mkv
  "video/ogg",
];

function extFor(mime: string): string {
  switch (mime) {
    case "video/mp4": return "mp4";
    case "video/webm": return "webm";
    case "video/quicktime": return "mov";
    case "video/x-matroska": return "mkv";
    case "video/ogg": return "ogv";
    default: return "bin";
  }
}

// Detect embed provider + canonicalize URL for iframe playback.
function parseEmbed(rawUrl: string): {
  provider: "youtube" | "vimeo" | "loom" | "other";
  embedSrc: string;
  thumbnail?: string;
  title: string;
} | null {
  let url: URL;
  try { url = new URL(rawUrl.trim()); } catch { return null; }
  const host = url.hostname.replace(/^www\./, "");

  // YouTube — youtu.be/<id>, youtube.com/watch?v=<id>, youtube.com/shorts/<id>, youtube.com/embed/<id>
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    if (id) return {
      provider: "youtube",
      embedSrc: `https://www.youtube.com/embed/${id}`,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      title: `YouTube · ${id}`,
    };
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    let id: string | null = url.searchParams.get("v");
    if (!id) {
      const m = url.pathname.match(/\/(embed|shorts|v)\/([^/?#]+)/);
      if (m) id = m[2];
    }
    if (id) return {
      provider: "youtube",
      embedSrc: `https://www.youtube.com/embed/${id}`,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      title: `YouTube · ${id}`,
    };
  }

  // Vimeo — vimeo.com/<id> or player.vimeo.com/video/<id>
  if (host === "vimeo.com") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    if (id && /^\d+$/.test(id)) return {
      provider: "vimeo",
      embedSrc: `https://player.vimeo.com/video/${id}`,
      title: `Vimeo · ${id}`,
    };
  }
  if (host === "player.vimeo.com") {
    const m = url.pathname.match(/\/video\/(\d+)/);
    if (m) return {
      provider: "vimeo",
      embedSrc: `https://player.vimeo.com/video/${m[1]}`,
      title: `Vimeo · ${m[1]}`,
    };
  }

  // Loom — loom.com/share/<id> or loom.com/embed/<id>
  if (host === "loom.com") {
    const m = url.pathname.match(/\/(share|embed)\/([a-f0-9]+)/i);
    if (m) return {
      provider: "loom",
      embedSrc: `https://www.loom.com/embed/${m[2]}`,
      title: `Loom · ${m[2].slice(0, 8)}`,
    };
  }

  // Fallback — accept any https URL (may or may not be iframable)
  if (url.protocol === "https:") {
    return {
      provider: "other",
      embedSrc: url.toString(),
      title: url.hostname + url.pathname,
    };
  }
  return null;
}

// GET — list videos for a position
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

  const videos = await prisma.galleryVideo.findMany({
    where: { workHistoryId: positionId },
    include: { album: { select: { id: true, name: true } } },
    orderBy: [{ sortOrder: "asc" }, { isCover: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(videos);
}

// POST — upload a gallery video, OR add an external embed (YouTube/Vimeo/Loom/etc)
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = request.headers.get("content-type") || "";

  // ── JSON branch: external embed ────────────────────────────────────────────
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null) as
      | { positionId?: string; url?: string; caption?: string | null; albumId?: string | null; albumName?: string | null; isCover?: boolean }
      | null;

    if (!body?.positionId || !body?.url) {
      return NextResponse.json({ error: "positionId and url required" }, { status: 400 });
    }

    const parsed = parseEmbed(body.url);
    if (!parsed) return NextResponse.json({ error: "Invalid or unsupported embed URL" }, { status: 400 });

    const position = await prisma.workHistory.findFirst({
      where: { id: body.positionId, userId },
      select: { id: true },
    });
    if (!position) return NextResponse.json({ error: "Position not found" }, { status: 404 });

    let albumId: string | null = body.albumId ?? null;
    const albumName = (body.albumName ?? "").trim();
    if (albumId) {
      const album = await prisma.galleryAlbum.findFirst({
        where: { id: albumId, workHistoryId: body.positionId },
        include: { workHistory: { select: { userId: true } } },
      });
      if (!album || album.workHistory.userId !== userId) {
        return NextResponse.json({ error: "Album not found" }, { status: 404 });
      }
    } else if (albumName) {
      const existing = await prisma.galleryAlbum.findFirst({
        where: { workHistoryId: body.positionId, name: albumName },
        select: { id: true },
      });
      albumId = existing?.id ?? (await prisma.galleryAlbum.create({
        data: { workHistoryId: body.positionId, name: albumName.slice(0, 80) },
        select: { id: true },
      })).id;
    }

    if (body.isCover) {
      await prisma.galleryVideo.updateMany({
        where: { workHistoryId: body.positionId, isCover: true },
        data: { isCover: false },
      });
    }

    const video = await prisma.galleryVideo.create({
      data: {
        workHistoryId: body.positionId,
        filePath: parsed.embedSrc,
        fileName: parsed.title,
        fileMime: `embed/${parsed.provider}`,
        fileSize: 0,
        posterPath: parsed.thumbnail ?? null,
        isEmbed: true,
        embedProvider: parsed.provider,
        caption: body.caption ?? null,
        isCover: !!body.isCover,
        albumId,
      },
      include: { album: { select: { id: true, name: true } } },
    });

    return NextResponse.json(video, { status: 201 });
  }

  // ── Multipart branch: file upload ──────────────────────────────────────────
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const positionId = formData.get("positionId") as string | null;
    let albumId = (formData.get("albumId") as string | null) || null;
    const albumName = ((formData.get("albumName") as string | null) || "").trim();
    const caption = (formData.get("caption") as string) || null;
    const isCover = formData.get("isCover") === "true";

    if (!file || !positionId) {
      return NextResponse.json({ error: "file and positionId required" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Use MP4, WebM, MOV, MKV, or OGV." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large. Max 50 MB." }, { status: 400 });
    }

    const position = await prisma.workHistory.findFirst({
      where: { id: positionId, userId },
      select: { id: true },
    });
    if (!position) return NextResponse.json({ error: "Position not found" }, { status: 404 });

    if (albumId) {
      const album = await prisma.galleryAlbum.findFirst({
        where: { id: albumId, workHistoryId: positionId },
        include: { workHistory: { select: { userId: true } } },
      });
      if (!album || album.workHistory.userId !== userId) {
        return NextResponse.json({ error: "Album not found" }, { status: 404 });
      }
    } else if (albumName) {
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

    if (isCover) {
      await prisma.galleryVideo.updateMany({
        where: { workHistoryId: positionId, isCover: true },
        data: { isCover: false },
      });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `gallery-${crypto.randomBytes(8).toString("hex")}.${extFor(file.type)}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "gallery", "videos");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), buffer);

    const filePath = `/uploads/gallery/videos/${filename}`;

    const video = await prisma.galleryVideo.create({
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
      include: { album: { select: { id: true, name: true } } },
    });

    return NextResponse.json(video, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PATCH — update a single video (caption, fileName, cover, favorite, privacy, tags, dateTaken, sortOrder, albumId)
// or bulk: { ids: string[], action: "move" | "tag", albumId?: string|null, tag?: string }
export async function PATCH(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();

    // Bulk move
    if (Array.isArray(body.ids) && body.action === "move") {
      const videos = await prisma.galleryVideo.findMany({
        where: { id: { in: body.ids } },
        include: { workHistory: { select: { userId: true } } },
      });
      if (videos.length === 0) return NextResponse.json({ error: "No videos found" }, { status: 404 });
      if (videos.some((v) => v.workHistory.userId !== userId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const albumId = body.albumId ?? null;
      if (albumId) {
        const album = await prisma.galleryAlbum.findUnique({
          where: { id: albumId },
          include: { workHistory: { select: { userId: true } } },
        });
        if (!album || album.workHistory.userId !== userId) {
          return NextResponse.json({ error: "Album not found" }, { status: 404 });
        }
        if (videos.some((v) => v.workHistoryId !== album.workHistoryId)) {
          return NextResponse.json({ error: "Album must belong to the same position" }, { status: 400 });
        }
      }
      await prisma.galleryVideo.updateMany({ where: { id: { in: body.ids } }, data: { albumId } });
      return NextResponse.json({ success: true });
    }

    // Bulk tag
    if (Array.isArray(body.ids) && body.action === "tag" && body.tag) {
      const videos = await prisma.galleryVideo.findMany({
        where: { id: { in: body.ids } },
        include: { workHistory: { select: { userId: true } } },
      });
      if (videos.some((v) => v.workHistory.userId !== userId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      for (const v of videos) {
        const existing = v.tags ? (JSON.parse(v.tags) as string[]) : [];
        const updated = [...new Set([...existing, body.tag as string])];
        await prisma.galleryVideo.update({ where: { id: v.id }, data: { tags: JSON.stringify(updated) } });
      }
      return NextResponse.json({ success: true });
    }

    // Single update
    const { id, ...rest } = body as Record<string, unknown> & { id?: string };
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const existing = await prisma.galleryVideo.findUnique({
      where: { id },
      include: { workHistory: { select: { userId: true, id: true } } },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.workHistory.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data: Record<string, unknown> = {};
    if (typeof rest.caption === "string" || rest.caption === null) data.caption = rest.caption;
    if (typeof rest.fileName === "string") data.fileName = rest.fileName;
    if (typeof rest.isCover === "boolean") data.isCover = rest.isCover;
    if (typeof rest.isFavorite === "boolean") data.isFavorite = rest.isFavorite;
    if (typeof rest.isPrivate === "boolean") data.isPrivate = rest.isPrivate;
    if (typeof rest.annotationsPublic === "boolean") data.annotationsPublic = rest.annotationsPublic;
    if (typeof rest.sortOrder === "number" || rest.sortOrder === null) data.sortOrder = rest.sortOrder;
    if (typeof rest.albumId === "string" || rest.albumId === null) data.albumId = rest.albumId;
    if (Array.isArray(rest.tags)) data.tags = JSON.stringify(rest.tags as string[]);
    if (typeof rest.dateTaken === "string" || rest.dateTaken === null) {
      data.dateTaken = rest.dateTaken ? new Date(rest.dateTaken as string) : null;
    }
    if (typeof rest.durationSec === "number") data.durationSec = rest.durationSec;
    if (typeof rest.width === "number") data.width = rest.width;
    if (typeof rest.height === "number") data.height = rest.height;

    if (data.isCover === true) {
      await prisma.galleryVideo.updateMany({
        where: { workHistoryId: existing.workHistoryId, isCover: true, NOT: { id } },
        data: { isCover: false },
      });
    }

    const updated = await prisma.galleryVideo.update({
      where: { id },
      data,
      include: { album: { select: { id: true, name: true } } },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE — remove a video and its file
export async function DELETE(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const video = await prisma.galleryVideo.findUnique({
    where: { id },
    include: { workHistory: { select: { userId: true } } },
  });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (video.workHistory.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    if (video.filePath?.startsWith("/uploads/")) {
      const abs = path.join(process.cwd(), "public", video.filePath);
      await unlink(abs).catch(() => { /* file may already be gone */ });
    }
    if (video.posterPath?.startsWith("/uploads/")) {
      const abs = path.join(process.cwd(), "public", video.posterPath);
      await unlink(abs).catch(() => { /* file may already be gone */ });
    }
  } catch { /* swallow fs errors — DB delete still proceeds */ }

  await prisma.galleryVideo.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
