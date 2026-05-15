import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

const VALID_TYPES = new Set([
  "machine",
  "vehicle",
  "system",
  "structure",
  "unit",
  "tool",
  "other",
]);
const VALID_STATUS = new Set(["active", "retired", "out-of-service"]);

function normalizeTags(input: unknown): string[] | undefined {
  if (input === undefined) return undefined;
  if (input === null) return [];
  let arr: unknown[] = [];
  if (Array.isArray(input)) arr = input;
  else if (typeof input === "string") arr = input.split(",");
  else return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of arr) {
    if (typeof v !== "string") continue;
    const t = v.trim().toLowerCase().slice(0, 32);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 20) break;
  }
  return out;
}

// GET /api/job-assets[?positionId=...]
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const positionId = searchParams.get("positionId");

  const items = await prisma.jobAsset.findMany({
    where: { userId, ...(positionId ? { positionId } : {}) },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: {
      photos: {
        orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, filePath: true, caption: true, isCover: true, sortOrder: true },
      },
    },
  });
  return NextResponse.json(items);
}

// POST /api/job-assets
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const {
      name,
      assetType,
      identifier,
      manufacturer,
      model,
      serialNumber,
      positionId,
      customerName,
      location,
      status,
      installedAt,
      commissionedAt,
      notes,
      tags,
      isPrivate,
    } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    // If positionId provided, verify it belongs to the user
    if (positionId) {
      const pos = await prisma.workHistory.findUnique({ where: { id: positionId }, select: { userId: true } });
      if (!pos || pos.userId !== userId) {
        return NextResponse.json({ error: "Invalid positionId" }, { status: 400 });
      }
    }

    const item = await prisma.jobAsset.create({
      data: {
        userId,
        name: name.trim().slice(0, 200),
        assetType: VALID_TYPES.has(assetType) ? assetType : "machine",
        identifier: identifier || null,
        manufacturer: manufacturer || null,
        model: model || null,
        serialNumber: serialNumber || null,
        positionId: positionId || null,
        customerName: customerName || null,
        location: location || null,
        status: VALID_STATUS.has(status) ? status : "active",
        installedAt: installedAt ? new Date(installedAt) : null,
        commissionedAt: commissionedAt ? new Date(commissionedAt) : null,
        notes: notes || null,
        tags: normalizeTags(tags) ?? [],
        isPrivate: isPrivate !== false,
      },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PATCH /api/job-assets
export async function PATCH(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const existing = await prisma.jobAsset.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (fields.positionId) {
      const pos = await prisma.workHistory.findUnique({ where: { id: fields.positionId }, select: { userId: true } });
      if (!pos || pos.userId !== userId) {
        return NextResponse.json({ error: "Invalid positionId" }, { status: 400 });
      }
    }

    const data: Record<string, unknown> = {};
    if (fields.name != null) data.name = String(fields.name).trim().slice(0, 200);
    if (fields.assetType != null && VALID_TYPES.has(fields.assetType)) data.assetType = fields.assetType;
    if (fields.status != null && VALID_STATUS.has(fields.status)) data.status = fields.status;
    if (fields.identifier !== undefined) data.identifier = fields.identifier || null;
    if (fields.manufacturer !== undefined) data.manufacturer = fields.manufacturer || null;
    if (fields.model !== undefined) data.model = fields.model || null;
    if (fields.serialNumber !== undefined) data.serialNumber = fields.serialNumber || null;
    if (fields.positionId !== undefined) data.positionId = fields.positionId || null;
    if (fields.customerName !== undefined) data.customerName = fields.customerName || null;
    if (fields.location !== undefined) data.location = fields.location || null;
    if (fields.installedAt !== undefined) data.installedAt = fields.installedAt ? new Date(fields.installedAt) : null;
    if (fields.commissionedAt !== undefined) data.commissionedAt = fields.commissionedAt ? new Date(fields.commissionedAt) : null;
    if (fields.notes !== undefined) data.notes = fields.notes || null;
    if (fields.isPrivate !== undefined) data.isPrivate = !!fields.isPrivate;
    if (fields.isDraft !== undefined) data.isDraft = !!fields.isDraft;
    if (fields.tags !== undefined) {
      const tags = normalizeTags(fields.tags);
      if (tags) data.tags = tags;
    }

    const item = await prisma.jobAsset.update({ where: { id }, data });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE /api/job-assets?id=...
export async function DELETE(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const existing = await prisma.jobAsset.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.jobAsset.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
