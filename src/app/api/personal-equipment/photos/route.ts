import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_PER_EQUIPMENT = 5;

async function ensureOwnership(equipmentId: string, userId: string) {
  const equipment = await prisma.personalEquipment.findUnique({
    where: { id: equipmentId },
    select: { id: true, userId: true },
  });
  if (!equipment || equipment.userId !== userId) return null;
  return equipment;
}

// GET /api/personal-equipment/photos?equipmentId=...
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const equipmentId = searchParams.get("equipmentId");
  if (!equipmentId) return NextResponse.json({ error: "equipmentId required" }, { status: 400 });

  if (!(await ensureOwnership(equipmentId, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const photos = await prisma.personalEquipmentPhoto.findMany({
    where: { equipmentId },
    orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
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

    if (!(await ensureOwnership(equipmentId, userId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const count = await prisma.personalEquipmentPhoto.count({ where: { equipmentId } });
    if (count >= MAX_PER_EQUIPMENT) {
      return NextResponse.json({ error: `Max ${MAX_PER_EQUIPMENT} photos per item` }, { status: 400 });
    }

    if (isCover) {
      await prisma.personalEquipmentPhoto.updateMany({
        where: { equipmentId, isCover: true },
        data: { isCover: false },
      });
    }

    const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
    const filename = `pe-${crypto.randomBytes(8).toString("hex")}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "personal-equipment");
    await mkdir(uploadDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadDir, filename), buffer);

    const photo = await prisma.personalEquipmentPhoto.create({
      data: {
        equipmentId,
        filePath: `/uploads/personal-equipment/${filename}`,
        fileName: file.name,
        fileMime: file.type,
        fileSize: file.size,
        caption,
        isCover: isCover || count === 0,
        sortOrder: count,
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
    const { id, caption, isCover, focalX, focalY, zoom } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const existing = await prisma.personalEquipmentPhoto.findUnique({
      where: { id },
      include: { equipment: { select: { userId: true } } },
    });
    if (!existing || existing.equipment.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (isCover) {
      await prisma.personalEquipmentPhoto.updateMany({
        where: { equipmentId: existing.equipmentId, isCover: true },
        data: { isCover: false },
      });
    }

    const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
    const updated = await prisma.personalEquipmentPhoto.update({
      where: { id },
      data: {
        ...(caption !== undefined && { caption: caption || null }),
        ...(isCover !== undefined && { isCover }),
        ...(typeof focalX === "number" && { focalX: Math.round(clamp(focalX, 0, 100)) }),
        ...(typeof focalY === "number" && { focalY: Math.round(clamp(focalY, 0, 100)) }),
        ...(typeof zoom === "number" && { zoom: clamp(zoom, 1, 4) }),
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PUT JSON: { equipmentId, order: string[] }  -- reorder photos
export async function PUT(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { equipmentId, order } = body as { equipmentId?: string; order?: unknown };
    if (!equipmentId || !Array.isArray(order)) {
      return NextResponse.json({ error: "equipmentId and order[] required" }, { status: 400 });
    }
    if (!(await ensureOwnership(equipmentId, userId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const ids = order.filter((x): x is string => typeof x === "string");
    const owned = await prisma.personalEquipmentPhoto.findMany({
      where: { equipmentId, id: { in: ids } },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map((p) => p.id));
    const filtered = ids.filter((id) => ownedSet.has(id));

    await prisma.$transaction(
      filtered.map((id, idx) =>
        prisma.personalEquipmentPhoto.update({
          where: { id },
          data: { sortOrder: idx },
        }),
      ),
    );
    return NextResponse.json({ success: true, count: filtered.length });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE /api/personal-equipment/photos?id=...
export async function DELETE(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const existing = await prisma.personalEquipmentPhoto.findUnique({
      where: { id },
      include: { equipment: { select: { userId: true } } },
    });
    if (!existing || existing.equipment.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (existing.filePath.startsWith("/uploads/")) {
      try {
        await unlink(path.join(process.cwd(), "public", existing.filePath));
      } catch {
        // ignore missing files
      }
    }

    await prisma.personalEquipmentPhoto.delete({ where: { id } });

    if (existing.isCover) {
      const next = await prisma.personalEquipmentPhoto.findFirst({
        where: { equipmentId: existing.equipmentId },
        orderBy: { createdAt: "asc" },
      });
      if (next) {
        await prisma.personalEquipmentPhoto.update({ where: { id: next.id }, data: { isCover: true } });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
