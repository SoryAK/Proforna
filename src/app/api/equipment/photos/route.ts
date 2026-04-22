import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_PER_EQUIPMENT = 3;

async function ensureOwnership(equipmentId: string, userId: string) {
  const equipment = await prisma.equipment.findUnique({
    where: { id: equipmentId },
    include: { position: { select: { userId: true } } },
  });
  if (!equipment || equipment.position.userId !== userId) return null;
  return equipment;
}

// GET /api/equipment/photos?equipmentId=...
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const equipmentId = searchParams.get("equipmentId");
  if (!equipmentId) return NextResponse.json({ error: "equipmentId required" }, { status: 400 });

  const equipment = await ensureOwnership(equipmentId, userId);
  if (!equipment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const photos = await prisma.equipmentPhoto.findMany({
    where: { equipmentId },
    orderBy: [{ isCover: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(photos);
}

// POST multipart: equipmentId, file, caption?, isCover?
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await request.formData();
    const equipmentId = formData.get("equipmentId") as string | null;
    const file = formData.get("file") as File | null;
    const caption = (formData.get("caption") as string | null) || null;
    const isCover = formData.get("isCover") === "true";

    if (!equipmentId || !file) {
      return NextResponse.json({ error: "equipmentId and file required" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large. Max 5MB." }, { status: 400 });
    }

    const equipment = await ensureOwnership(equipmentId, userId);
    if (!equipment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const count = await prisma.equipmentPhoto.count({ where: { equipmentId } });
    if (count >= MAX_PER_EQUIPMENT) {
      return NextResponse.json({ error: "Max 3 photos per equipment item" }, { status: 400 });
    }

    if (isCover) {
      await prisma.equipmentPhoto.updateMany({
        where: { equipmentId, isCover: true },
        data: { isCover: false },
      });
    }

    const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
    const filename = `equip-${crypto.randomBytes(8).toString("hex")}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "equipment");
    await mkdir(uploadDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadDir, filename), buffer);

    const photo = await prisma.equipmentPhoto.create({
      data: {
        equipmentId,
        filePath: `/uploads/equipment/${filename}`,
        fileName: file.name,
        fileMime: file.type,
        fileSize: file.size,
        caption,
        isCover: isCover || count === 0,
      },
    });

    return NextResponse.json(photo, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PATCH JSON: { id, caption?, isCover? }
export async function PATCH(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { id, caption, isCover } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const existing = await prisma.equipmentPhoto.findUnique({
      where: { id },
      include: { equipment: { include: { position: { select: { userId: true } } } } },
    });
    if (!existing || existing.equipment.position.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (isCover) {
      await prisma.equipmentPhoto.updateMany({
        where: { equipmentId: existing.equipmentId, isCover: true },
        data: { isCover: false },
      });
    }

    const updated = await prisma.equipmentPhoto.update({
      where: { id },
      data: {
        ...(caption !== undefined && { caption: caption || null }),
        ...(isCover !== undefined && { isCover }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE /api/equipment/photos?id=...
export async function DELETE(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const existing = await prisma.equipmentPhoto.findUnique({
      where: { id },
      include: { equipment: { include: { position: { select: { userId: true } } } } },
    });
    if (!existing || existing.equipment.position.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (existing.filePath.startsWith("/uploads/")) {
      try {
        await unlink(path.join(process.cwd(), "public", existing.filePath));
      } catch {
        // ignore missing files
      }
    }

    await prisma.equipmentPhoto.delete({ where: { id } });

    if (existing.isCover) {
      const next = await prisma.equipmentPhoto.findFirst({
        where: { equipmentId: existing.equipmentId },
        orderBy: { createdAt: "asc" },
      });
      if (next) {
        await prisma.equipmentPhoto.update({ where: { id: next.id }, data: { isCover: true } });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
