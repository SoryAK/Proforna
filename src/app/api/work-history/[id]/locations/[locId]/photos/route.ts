import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

const MAX_SIZE = 3 * 1024 * 1024; // 3 MB per photo
const MAX_PHOTOS = 5;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** POST — upload a photo to a sub-location (max 5 per location) */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; locId: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, locId } = await params;

  const parent = await prisma.workHistory.findFirst({ where: { id, userId } });
  if (!parent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const loc = await prisma.workHistoryLocation.findFirst({ where: { id: locId, workHistoryId: id } });
  if (!loc) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  // Parse existing photos
  let existing: string[] = [];
  try { existing = loc.photos ? JSON.parse(loc.photos) : []; } catch { existing = []; }

  if (existing.length >= MAX_PHOTOS) {
    return NextResponse.json({ error: `Maximum ${MAX_PHOTOS} photos per location` }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get("photo") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Invalid file type. Use JPEG, PNG, WebP, or GIF." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large. Max 3 MB." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
  const filename = `loc-${crypto.randomBytes(8).toString("hex")}.${ext}`;

  const uploadDir = path.join(process.cwd(), "public", "uploads", "locations");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), buffer);

  const photoUrl = `/uploads/locations/${filename}`;
  existing.push(photoUrl);

  const updated = await prisma.workHistoryLocation.update({
    where: { id: locId },
    data: { photos: JSON.stringify(existing) },
  });

  return NextResponse.json({ photos: JSON.parse(updated.photos ?? "[]"), url: photoUrl }, { status: 201 });
}

/** DELETE — remove a photo from a sub-location by URL */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; locId: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, locId } = await params;

  const parent = await prisma.workHistory.findFirst({ where: { id, userId } });
  if (!parent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const loc = await prisma.workHistoryLocation.findFirst({ where: { id: locId, workHistoryId: id } });
  if (!loc) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const body = await request.json();
  const urlToRemove = body.url;
  if (!urlToRemove) return NextResponse.json({ error: "url is required" }, { status: 400 });

  let existing: string[] = [];
  try { existing = loc.photos ? JSON.parse(loc.photos) : []; } catch { existing = []; }

  const filtered = existing.filter((u: string) => u !== urlToRemove);

  const updated = await prisma.workHistoryLocation.update({
    where: { id: locId },
    data: { photos: filtered.length > 0 ? JSON.stringify(filtered) : null },
  });

  return NextResponse.json({ photos: JSON.parse(updated.photos ?? "[]") });
}
