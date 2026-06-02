import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

const VALID_CATEGORIES = new Set([
  "machine", "vehicle", "system", "structure", "unit", "tool", "other",
]);

function normalizeTags(input: unknown): string[] {
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

// GET /api/asset-types/[id]
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const item = await prisma.assetType.findUnique({
    where: { id },
    include: {
      documents: { orderBy: { createdAt: "asc" } },
      links: { orderBy: { createdAt: "asc" } },
      _count: { select: { instances: true } },
    },
  });

  if (!item || item.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(item);
}

// PATCH /api/asset-types/[id]
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.assetType.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.name != null) data.name = String(body.name).trim().slice(0, 200);
    if (body.category != null && VALID_CATEGORIES.has(body.category)) data.category = body.category;
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.manufacturer !== undefined) data.manufacturer = body.manufacturer?.trim() || null;
    if (body.tags !== undefined) data.tags = normalizeTags(body.tags);

    const item = await prisma.assetType.update({
      where: { id },
      data,
      include: {
        documents: { orderBy: { createdAt: "asc" } },
        links: { orderBy: { createdAt: "asc" } },
        _count: { select: { instances: true } },
      },
    });

    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE /api/asset-types/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.assetType.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Unlink instances before deleting (FK is SET NULL, handled by DB constraint)
  await prisma.assetType.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
