import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { ensureAutoLog } from "@/lib/auto-log";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_PER_ASSET = 6;

async function ensureOwnership(assetId: string, userId: string) {
  const asset = await prisma.jobAsset.findUnique({
    where: { id: assetId },
    select: { id: true, userId: true, positionId: true },
  });
  if (!asset || asset.userId !== userId) return null;
  return asset;
}

// GET /api/job-assets/photos?assetId=...
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const assetId = searchParams.get("assetId");
  if (!assetId) return NextResponse.json({ error: "assetId required" }, { status: 400 });

  if (!(await ensureOwnership(assetId, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const photos = await prisma.jobAssetPhoto.findMany({
    where: { assetId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(photos);
}

// POST multipart: assetId, file, caption?, isCover?
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await request.formData();
    const assetId = formData.get("assetId") as string | null;
    const file = formData.get("file") as File | null;
    const caption = (formData.get("caption") as string | null) || null;
    const isCover = formData.get("isCover") === "true";

    if (!assetId || !file) {
      return NextResponse.json({ error: "assetId and file required" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large. Max 5MB." }, { status: 400 });
    }

    if (!(await ensureOwnership(assetId, userId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const owned = await prisma.jobAsset.findUnique({
      where: { id: assetId },
      select: { positionId: true },
    });

    const count = await prisma.jobAssetPhoto.count({ where: { assetId } });
    if (count >= MAX_PER_ASSET) {
      return NextResponse.json({ error: `Max ${MAX_PER_ASSET} photos per asset` }, { status: 400 });
    }

    if (isCover) {
      await prisma.jobAssetPhoto.updateMany({
        where: { assetId, isCover: true },
        data: { isCover: false },
      });
    }

    const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
    const filename = `ja-${crypto.randomBytes(8).toString("hex")}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "job-assets");
    await mkdir(uploadDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadDir, filename), buffer);

    const photo = await prisma.jobAssetPhoto.create({
      data: {
        assetId,
        filePath: `/uploads/job-assets/${filename}`,
        fileName: file.name,
        fileMime: file.type,
        fileSize: file.size,
        caption,
        isCover: isCover || count === 0,
        sortOrder: count,
      },
    });

    // Phase B implicit logging — photo on a job asset implies "worked on it today".
    try {
      await ensureAutoLog({
        userId,
        source: "photo-asset",
        assetIds: [assetId],
        positionId: owned?.positionId ?? null,
      });
    } catch (e) {
      console.warn("[ensureAutoLog/photo-asset] failed", e);
    }

    return NextResponse.json(photo, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PATCH JSON: { id, caption?, isCover?, focalX?, focalY?, zoom?, rotation?, flipH?, flipV? }
export async function PATCH(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { id, caption, isCover, focalX, focalY, zoom, rotation, flipH, flipV } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const existing = await prisma.jobAssetPhoto.findUnique({
      where: { id },
      include: { asset: { select: { userId: true } } },
    });
    if (!existing || existing.asset.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (isCover) {
      await prisma.jobAssetPhoto.updateMany({
        where: { assetId: existing.assetId, isCover: true },
        data: { isCover: false },
      });
    }

    const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
    const updated = await prisma.jobAssetPhoto.update({
      where: { id },
      data: {
        ...(caption !== undefined && { caption: caption || null }),
        ...(isCover !== undefined && { isCover }),
        ...(typeof focalX === "number" && { focalX: Math.round(clamp(focalX, 0, 100)) }),
        ...(typeof focalY === "number" && { focalY: Math.round(clamp(focalY, 0, 100)) }),
        ...(typeof zoom === "number" && { zoom: clamp(zoom, 1, 4) }),
        ...(typeof rotation === "number" && { rotation: ((Math.round(rotation / 90) * 90) % 360 + 360) % 360 }),
        ...(typeof flipH === "boolean" && { flipH }),
        ...(typeof flipV === "boolean" && { flipV }),
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PUT JSON: { assetId, order: string[] }  -- reorder photos
export async function PUT(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { assetId, order } = body as { assetId?: string; order?: unknown };
    if (!assetId || !Array.isArray(order)) {
      return NextResponse.json({ error: "assetId and order[] required" }, { status: 400 });
    }
    if (!(await ensureOwnership(assetId, userId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const ids = order.filter((x): x is string => typeof x === "string");
    const owned = await prisma.jobAssetPhoto.findMany({
      where: { assetId, id: { in: ids } },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map((p) => p.id));
    const filtered = ids.filter((id) => ownedSet.has(id));

    await prisma.$transaction(
      filtered.map((id, idx) =>
        prisma.jobAssetPhoto.update({
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

// DELETE /api/job-assets/photos?id=...
export async function DELETE(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const existing = await prisma.jobAssetPhoto.findUnique({
      where: { id },
      include: { asset: { select: { userId: true } } },
    });
    if (!existing || existing.asset.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (existing.filePath.startsWith("/uploads/")) {
      try {
        await unlink(path.join(process.cwd(), "public", existing.filePath));
      } catch {
        // ignore missing files
      }
    }

    await prisma.jobAssetPhoto.delete({ where: { id } });

    if (existing.isCover) {
      const next = await prisma.jobAssetPhoto.findFirst({
        where: { assetId: existing.assetId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      if (next) {
        await prisma.jobAssetPhoto.update({ where: { id: next.id }, data: { isCover: true } });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
