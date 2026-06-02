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

// GET /api/asset-types[?q=search&category=machine]
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const category = searchParams.get("category");

  const items = await prisma.assetType.findMany({
    where: {
      userId,
      ...(category && VALID_CATEGORIES.has(category) ? { category } : {}),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { instances: true, documents: true, links: true } },
    },
  });

  const filtered = q
    ? items.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.manufacturer ?? "").toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.includes(q)),
      )
    : items;

  return NextResponse.json(filtered);
}

// POST /api/asset-types
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { name, category, description, manufacturer, tags } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const item = await prisma.assetType.create({
      data: {
        userId,
        name: name.trim().slice(0, 200),
        category: VALID_CATEGORIES.has(category) ? category : "machine",
        description: description?.trim() || null,
        manufacturer: manufacturer?.trim() || null,
        tags: normalizeTags(tags),
        isPublic: false, // always false in Sprint 1
      },
      include: {
        _count: { select: { instances: true, documents: true, links: true } },
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
