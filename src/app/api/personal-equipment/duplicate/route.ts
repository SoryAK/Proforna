import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { copyFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

// POST /api/personal-equipment/duplicate
// body: { id: string, withPhotos?: boolean, nameSuffix?: string }
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id : null;
    const withPhotos = body.withPhotos !== false; // default true
    const nameSuffix = typeof body.nameSuffix === "string" && body.nameSuffix.length <= 32 ? body.nameSuffix : " (copy)";
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const source = await prisma.personalEquipment.findFirst({
      where: { id, userId },
      include: { photos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
    });
    if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const newName = `${source.name}${nameSuffix}`.slice(0, 200);

    const created = await prisma.personalEquipment.create({
      data: {
        userId,
        name: newName,
        category: source.category,
        ownership: source.ownership,
        manufacturer: source.manufacturer,
        model: source.model,
        // Don't copy serial number — it's unique to a physical item
        serialNumber: null,
        condition: source.condition,
        proficiency: source.proficiency,
        purchaseDate: source.purchaseDate,
        purchasePrice: source.purchasePrice,
        currentValue: source.currentValue,
        location: source.location,
        isPrivate: source.isPrivate,
        notes: source.notes,
        tags: source.tags,
      },
    });

    if (withPhotos && source.photos.length > 0) {
      const uploadDir = path.join(process.cwd(), "public", "uploads", "personal-equipment");
      await mkdir(uploadDir, { recursive: true });

      for (let i = 0; i < source.photos.length; i++) {
        const p = source.photos[i];
        // Source files live under public/uploads/... — we copy by filesystem path
        const srcRel = p.filePath.replace(/^\//, ""); // "uploads/personal-equipment/pe-xxx.jpg"
        const srcAbs = path.join(process.cwd(), "public", srcRel);
        const ext = path.extname(srcRel) || ".jpg";
        const newName = `pe-${crypto.randomBytes(8).toString("hex")}${ext}`;
        const dstAbs = path.join(uploadDir, newName);
        try {
          await copyFile(srcAbs, dstAbs);
          await prisma.personalEquipmentPhoto.create({
            data: {
              equipmentId: created.id,
              filePath: `/uploads/personal-equipment/${newName}`,
              fileName: p.fileName,
              fileMime: p.fileMime,
              fileSize: p.fileSize,
              caption: p.caption,
              isCover: p.isCover,
              sortOrder: i,
              focalX: p.focalX,
              focalY: p.focalY,
              zoom: p.zoom,
              rotation: p.rotation,
              flipH: p.flipH,
              flipV: p.flipV,
            },
          });
        } catch (err) {
          // If a single source file is missing, skip it but keep going
          console.error("duplicate: failed to copy photo", srcAbs, err);
        }
      }
    }

    const full = await prisma.personalEquipment.findUnique({
      where: { id: created.id },
      include: { photos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
    });
    return NextResponse.json(full, { status: 201 });
  } catch (err) {
    console.error("duplicate failed", err);
    return NextResponse.json({ error: "Duplicate failed" }, { status: 500 });
  }
}
