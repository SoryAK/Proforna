import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";
import { getUserId } from "@/lib/auth-utils";

// GET /api/gallery/export?positionId=xxx
// Returns a ZIP archive of all (non-private) gallery photos for a work position
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
    select: { id: true, company: true },
  });
  if (!position)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const photos = await prisma.galleryPhoto.findMany({
    where: { workHistoryId: positionId, isPrivate: false },
    orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });

  if (photos.length === 0)
    return NextResponse.json({ error: "No photos to export" }, { status: 404 });

  const zip = new JSZip();
  const folder = zip.folder(position.company || "gallery")!;

  for (const photo of photos) {
    if (!photo.filePath.startsWith("/uploads/")) continue;
    try {
      const buffer = await readFile(path.join(process.cwd(), "public", photo.filePath));
      const safeName = photo.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const prefix = photo.isCover ? "COVER_" : "";
      folder.file(`${prefix}${safeName}`, buffer);
    } catch { /* skip missing files */ }
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
  const slug = (position.company || "gallery").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40);

  return new Response(zipBuffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug}_gallery.zip"`,
      "Content-Length": zipBuffer.length.toString(),
    },
  });
}
