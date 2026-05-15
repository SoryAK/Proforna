import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_PER_LOG = 6;

async function ensureLogOwnership(workLogId: string, userId: string) {
  const log = await prisma.workLog.findUnique({
    where: { id: workLogId },
    select: { id: true, userId: true },
  });
  if (!log || log.userId !== userId) return null;
  return log;
}

// GET /api/work-logs/photos?workLogId=...
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const workLogId = searchParams.get("workLogId");
  if (!workLogId) return NextResponse.json({ error: "workLogId required" }, { status: 400 });

  const log = await ensureLogOwnership(workLogId, userId);
  if (!log) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const photos = await prisma.workLogPhoto.findMany({
    where: { workLogId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(photos);
}

// POST multipart: workLogId, file, caption?
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await request.formData();
    const workLogId = formData.get("workLogId") as string | null;
    const file = formData.get("file") as File | null;
    const caption = (formData.get("caption") as string | null) || null;

    if (!workLogId || !file) {
      return NextResponse.json({ error: "workLogId and file required" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large. Max 5MB." }, { status: 400 });
    }

    const log = await ensureLogOwnership(workLogId, userId);
    if (!log) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const count = await prisma.workLogPhoto.count({ where: { workLogId } });
    if (count >= MAX_PER_LOG) {
      return NextResponse.json({ error: `Max ${MAX_PER_LOG} photos per entry` }, { status: 400 });
    }

    const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
    const filename = `worklog-${crypto.randomBytes(8).toString("hex")}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "worklog");
    await mkdir(uploadDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadDir, filename), buffer);

    const photo = await prisma.workLogPhoto.create({
      data: {
        workLogId,
        filePath: `/uploads/worklog/${filename}`,
        fileName: file.name,
        fileMime: file.type,
        fileSize: file.size,
        caption,
        sortOrder: count,
      },
    });

    return NextResponse.json(photo, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PATCH JSON: { id, caption? }
export async function PATCH(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { id, caption } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const existing = await prisma.workLogPhoto.findUnique({
      where: { id },
      include: { workLog: { select: { userId: true } } },
    });
    if (!existing || existing.workLog.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await prisma.workLogPhoto.update({
      where: { id },
      data: { ...(caption !== undefined && { caption: caption || null }) },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE /api/work-logs/photos?id=...
export async function DELETE(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const existing = await prisma.workLogPhoto.findUnique({
      where: { id },
      include: { workLog: { select: { userId: true } } },
    });
    if (!existing || existing.workLog.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (existing.filePath.startsWith("/uploads/")) {
      try {
        await unlink(path.join(process.cwd(), "public", existing.filePath));
      } catch {
        // ignore missing file
      }
    }
    await prisma.workLogPhoto.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
