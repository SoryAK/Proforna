import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getUserId } from "@/lib/auth-utils";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// POST — upload a cover image for a work history entry
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const positionId = formData.get("positionId") as string | null;

    if (!file || !positionId) {
      return NextResponse.json(
        { error: "file and positionId are required" },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Use JPEG, PNG, WebP, or GIF." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large. Max 5 MB." },
        { status: 400 }
      );
    }

    // Verify ownership
    const position = await prisma.workHistory.findFirst({
      where: { id: positionId, userId },
      select: { id: true, coverImage: true },
    });
    if (!position) {
      return NextResponse.json(
        { error: "Position not found" },
        { status: 404 }
      );
    }

    // Delete old cover file from disk if it was a file path (not base64)
    if (
      position.coverImage &&
      position.coverImage.startsWith("/uploads/")
    ) {
      try {
        await unlink(
          path.join(process.cwd(), "public", position.coverImage)
        );
      } catch {
        // old file may be gone
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext =
      file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
    const filename = `cover-${crypto.randomBytes(8).toString("hex")}.${ext}`;

    const uploadDir = path.join(
      process.cwd(),
      "public",
      "uploads",
      "gallery"
    );
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), buffer);

    const coverUrl = `/uploads/gallery/${filename}`;

    await prisma.workHistory.update({
      where: { id: positionId },
      data: { coverImage: coverUrl },
    });

    return NextResponse.json({ coverImage: coverUrl }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE — remove cover image
export async function DELETE(request: Request) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const positionId = searchParams.get("positionId");

    if (!positionId) {
      return NextResponse.json(
        { error: "positionId required" },
        { status: 400 }
      );
    }

    const position = await prisma.workHistory.findFirst({
      where: { id: positionId, userId },
      select: { id: true, coverImage: true },
    });
    if (!position) {
      return NextResponse.json(
        { error: "Position not found" },
        { status: 404 }
      );
    }

    // Delete file from disk if stored as path
    if (
      position.coverImage &&
      position.coverImage.startsWith("/uploads/")
    ) {
      try {
        await unlink(
          path.join(process.cwd(), "public", position.coverImage)
        );
      } catch {
        // file may be gone
      }
    }

    await prisma.workHistory.update({
      where: { id: positionId },
      data: { coverImage: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
