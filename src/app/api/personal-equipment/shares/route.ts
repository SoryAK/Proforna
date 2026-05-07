import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

const VALID_SCOPES = new Set(["all", "selected", "kit"]);

function makeToken() {
  // URL-safe base64, ~22 chars
  return randomBytes(16)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// GET /api/personal-equipment/shares — list this user's shares
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const shares = await prisma.personalEquipmentShare.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(shares);
}

// POST /api/personal-equipment/shares — create a new share
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const { label, scope, itemIds, kitId, expiresAt } = body ?? {};

    const safeScope = VALID_SCOPES.has(scope) ? scope : "all";
    let safeItemIds: string[] = [];
    let safeKitId: string | null = null;
    if (safeScope === "selected") {
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return NextResponse.json({ error: "itemIds required for scope=selected" }, { status: 400 });
      }
      // Verify ownership of every item
      const ids = itemIds.filter((v: unknown): v is string => typeof v === "string").slice(0, 500);
      const owned = await prisma.personalEquipment.findMany({
        where: { id: { in: ids }, userId },
        select: { id: true },
      });
      if (owned.length === 0) {
        return NextResponse.json({ error: "No matching items owned by user" }, { status: 400 });
      }
      safeItemIds = owned.map((i) => i.id);
    } else if (safeScope === "kit") {
      if (typeof kitId !== "string" || !kitId) {
        return NextResponse.json({ error: "kitId required for scope=kit" }, { status: 400 });
      }
      const kit = await prisma.equipmentKit.findFirst({ where: { id: kitId, userId }, select: { id: true } });
      if (!kit) return NextResponse.json({ error: "Kit not found" }, { status: 404 });
      safeKitId = kit.id;
    }

    let exp: Date | null = null;
    if (expiresAt) {
      const d = new Date(expiresAt);
      if (!isNaN(d.getTime())) exp = d;
    }

    const share = await prisma.personalEquipmentShare.create({
      data: {
        userId,
        token: makeToken(),
        label: typeof label === "string" && label.trim() ? label.trim().slice(0, 120) : null,
        scope: safeScope,
        itemIds: safeItemIds,
        kitId: safeKitId,
        expiresAt: exp,
      },
    });
    return NextResponse.json(share, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create share" }, { status: 500 });
  }
}
