import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

const VALID_CATEGORIES = new Set([
  "hardware",
  "software",
  "vehicle",
  "safety",
  "tool",
  "instrument",
  "other",
]);
const VALID_OWNERSHIP = new Set(["personal", "shared", "borrowed", "rental"]);
const VALID_CONDITIONS = new Set(["new", "good", "fair", "poor"]);

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

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
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 20) break;
  }
  return out;
}

// GET /api/personal-equipment
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.personalEquipment.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { photos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
  return NextResponse.json(items);
}

// POST /api/personal-equipment
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { name, category, ownership, manufacturer, model, serialNumber, condition, proficiency, purchaseDate, purchasePrice, currentValue, location, isPrivate, notes, tags } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const prof = num(proficiency);
    const item = await prisma.personalEquipment.create({
      data: {
        userId,
        name: name.trim().slice(0, 200),
        category: VALID_CATEGORIES.has(category) ? category : "tool",
        ownership: VALID_OWNERSHIP.has(ownership) ? ownership : "personal",
        manufacturer: manufacturer || null,
        model: model || null,
        serialNumber: serialNumber || null,
        condition: VALID_CONDITIONS.has(condition) ? condition : "good",
        proficiency: prof !== null ? Math.max(1, Math.min(5, Math.round(prof))) : null,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
        purchasePrice: num(purchasePrice),
        currentValue: num(currentValue),
        location: location || null,
        isPrivate: isPrivate !== false,
        notes: notes || null,
        tags: normalizeTags(tags) ?? [],
      },
      include: { photos: true },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PATCH /api/personal-equipment
export async function PATCH(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const existing = await prisma.personalEquipment.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (fields.name != null) data.name = String(fields.name).trim().slice(0, 200);
    if (fields.category != null && VALID_CATEGORIES.has(fields.category)) data.category = fields.category;
    if (fields.ownership != null && VALID_OWNERSHIP.has(fields.ownership)) data.ownership = fields.ownership;
    if (fields.condition != null && VALID_CONDITIONS.has(fields.condition)) data.condition = fields.condition;
    if (fields.manufacturer !== undefined) data.manufacturer = fields.manufacturer || null;
    if (fields.model !== undefined) data.model = fields.model || null;
    if (fields.serialNumber !== undefined) data.serialNumber = fields.serialNumber || null;
    if (fields.location !== undefined) data.location = fields.location || null;
    if (fields.notes !== undefined) data.notes = fields.notes || null;
    if (fields.isPrivate !== undefined) data.isPrivate = !!fields.isPrivate;
    if (fields.isDraft !== undefined) data.isDraft = !!fields.isDraft;
    if (fields.proficiency !== undefined) {
      const p = num(fields.proficiency);
      data.proficiency = p !== null ? Math.max(1, Math.min(5, Math.round(p))) : null;
    }
    if (fields.purchaseDate !== undefined) data.purchaseDate = fields.purchaseDate ? new Date(fields.purchaseDate) : null;
    if (fields.purchasePrice !== undefined) data.purchasePrice = num(fields.purchasePrice);
    if (fields.currentValue !== undefined) data.currentValue = num(fields.currentValue);
    if (fields.tags !== undefined) {
      const tags = normalizeTags(fields.tags);
      if (tags) data.tags = tags;
    }
    if (fields.tagsAdd !== undefined) {
      const add = normalizeTags(fields.tagsAdd) ?? [];
      if (add.length) {
        const existing = await prisma.personalEquipment.findUnique({ where: { id }, select: { tags: true } });
        const merged = Array.from(new Set([...(existing?.tags ?? []), ...add])).slice(0, 20);
        data.tags = merged;
      }
    }
    if (fields.tagsRemove !== undefined) {
      const rem = new Set(normalizeTags(fields.tagsRemove) ?? []);
      if (rem.size) {
        const existing = await prisma.personalEquipment.findUnique({ where: { id }, select: { tags: true } });
        data.tags = (existing?.tags ?? []).filter((t) => !rem.has(t));
      }
    }

    const item = await prisma.personalEquipment.update({
      where: { id },
      data,
      include: { photos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
    });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE /api/personal-equipment?id=...
export async function DELETE(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const existing = await prisma.personalEquipment.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.personalEquipment.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
