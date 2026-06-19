/**
 * /api/events/[eventId]/photos — photo CRUD for FREE-FLOATING events.
 *
 * Mirrors /api/work-history/[id]/events/[eventId]/photos but scoped via
 * the same Q2=B contract as /api/events/[eventId]: ownership check
 * filters `workHistoryId: null`, so anchored events 404 here. Clients
 * must dispatch to the work-history-nested route for anchored events.
 *
 * Shipped alongside ADR-0034 follow-up making the inline editor the
 * canonical event surface for photos.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

const MAX_SIZE = 8 * 1024 * 1024; // 8 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_PER_EVENT = 12;

async function ensureOwnership(eventId: string, userId: string) {
  return prisma.careerEvent.findFirst({
    where: { id: eventId, userId, workHistoryId: null },
  });
}

/** GET — list photos for a free-floating event */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;
  const event = await ensureOwnership(eventId, userId);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const photos = await prisma.careerEventPhoto.findMany({
    where: { careerEventId: eventId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(photos);
}

/** POST multipart — upload a photo (field: file, optional: caption) */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;
  const event = await ensureOwnership(eventId, userId);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const caption = (formData.get("caption") as string | null) || null;
    if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large. Max 8MB." }, { status: 400 });
    }

    const count = await prisma.careerEventPhoto.count({ where: { careerEventId: eventId } });
    if (count >= MAX_PER_EVENT) {
      return NextResponse.json({ error: `Max ${MAX_PER_EVENT} photos per event` }, { status: 400 });
    }

    const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
    const filename = `evt-${crypto.randomBytes(8).toString("hex")}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "career-events");
    await mkdir(uploadDir, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadDir, filename), buffer);

    const photo = await prisma.careerEventPhoto.create({
      data: {
        careerEventId: eventId,
        filePath: `/uploads/career-events/${filename}`,
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

/** DELETE ?photoId=... — remove a photo */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;
  const event = await ensureOwnership(eventId, userId);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const photoId = searchParams.get("photoId");
  if (!photoId) return NextResponse.json({ error: "photoId required" }, { status: 400 });

  const photo = await prisma.careerEventPhoto.findFirst({
    where: { id: photoId, careerEventId: eventId },
  });
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const abs = path.join(process.cwd(), "public", photo.filePath.replace(/^\//, ""));
    await unlink(abs);
  } catch {
    /* best-effort */
  }

  await prisma.careerEventPhoto.delete({ where: { id: photoId } });
  return NextResponse.json({ deleted: true });
}
