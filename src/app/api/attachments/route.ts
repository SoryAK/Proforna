import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getUserId } from "@/lib/auth-utils";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];
const VALID_CATEGORIES = [
  "offer-letter",
  "w2",
  "pay-stub",
  "contract",
  "cert",
  "review",
  "other",
];

// GET — list attachments for a position
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const positionId = searchParams.get("positionId");

  if (!positionId) {
    return NextResponse.json(
      { error: "positionId required" },
      { status: 400 }
    );
  }

  const items = await prisma.attachment.findMany({
    where: { positionId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(items);
}

// POST — upload an attachment
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const positionId = formData.get("positionId") as string | null;
    const label = formData.get("label") as string | null;
    const category = formData.get("category") as string | null;

    if (!file || !positionId || !label) {
      return NextResponse.json(
        { error: "file, positionId, and label are required" },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error:
            "Invalid file type. Allowed: PDF, images, Word, Excel, plain text.",
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large. Max 10 MB." },
        { status: 400 }
      );
    }

    // Verify the position belongs to this user
    const position = await prisma.workHistory.findFirst({
      where: { id: positionId, userId },
      select: { id: true },
    });
    if (!position) {
      return NextResponse.json(
        { error: "Position not found" },
        { status: 404 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name) || ".bin";
    const filename = `att-${crypto.randomBytes(8).toString("hex")}${ext}`;

    const uploadDir = path.join(
      process.cwd(),
      "public",
      "uploads",
      "attachments"
    );
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), buffer);

    const filePath = `/uploads/attachments/${filename}`;
    const cat = VALID_CATEGORIES.includes(category ?? "")
      ? category!
      : "other";

    const item = await prisma.attachment.create({
      data: {
        positionId,
        label,
        category: cat,
        fileName: file.name,
        filePath,
        fileMime: file.type,
        fileSize: file.size,
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE — remove an attachment
export async function DELETE(request: Request) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    // Find attachment and verify ownership through position
    const att = await prisma.attachment.findUnique({
      where: { id },
      include: { position: { select: { userId: true } } },
    });

    if (!att || att.position.userId !== userId) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 }
      );
    }

    // Delete file from disk
    try {
      const diskPath = path.join(process.cwd(), "public", att.filePath);
      await unlink(diskPath);
    } catch {
      // file may already be gone — proceed with DB cleanup
    }

    await prisma.attachment.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PATCH — update attachment label / category
export async function PATCH(request: Request) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { id, label, category } = body;

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const att = await prisma.attachment.findUnique({
      where: { id },
      include: { position: { select: { userId: true } } },
    });

    if (!att || att.position.userId !== userId) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 }
      );
    }

    const data: Record<string, string> = {};
    if (label != null) data.label = label;
    if (category != null)
      data.category = VALID_CATEGORIES.includes(category) ? category : "other";

    const updated = await prisma.attachment.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
