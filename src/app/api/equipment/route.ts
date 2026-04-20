import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// GET — list equipment for a position
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const positionId = searchParams.get("positionId");

  if (!positionId) {
    return NextResponse.json({ error: "positionId required" }, { status: 400 });
  }

  const items = await prisma.equipment.findMany({
    where: { positionId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(items);
}

// POST — add equipment
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { positionId, name, category, manufacturer, model, serialNumber, assetTag, assignedDate, returnedDate, condition, licenseKey, version, expiresAt, notes, usage } = body;

    if (!positionId || !name) {
      return NextResponse.json({ error: "positionId and name are required" }, { status: 400 });
    }

    const item = await prisma.equipment.create({
      data: {
        positionId,
        name,
        category: category || "hardware",
        usage: usage === "worked-on" ? "worked-on" : "used",
        manufacturer: manufacturer || null,
        model: model || null,
        serialNumber: serialNumber || null,
        assetTag: assetTag || null,
        assignedDate: assignedDate ? new Date(assignedDate) : null,
        returnedDate: returnedDate ? new Date(returnedDate) : null,
        condition: condition || "good",
        licenseKey: licenseKey || null,
        version: version || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        notes: notes || null,
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PATCH — update equipment
export async function PATCH(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { id, ...fields } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Verify ownership through position
    const existing = await prisma.equipment.findUnique({
      where: { id },
      include: { position: { select: { userId: true } } },
    });
    if (!existing || existing.position.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (fields.name != null) data.name = fields.name;
    if (fields.category != null) data.category = fields.category;
    if (fields.usage != null) data.usage = fields.usage === "worked-on" ? "worked-on" : "used";
    if (fields.manufacturer !== undefined) data.manufacturer = fields.manufacturer || null;
    if (fields.model !== undefined) data.model = fields.model || null;
    if (fields.serialNumber !== undefined) data.serialNumber = fields.serialNumber || null;
    if (fields.assetTag !== undefined) data.assetTag = fields.assetTag || null;
    if (fields.condition != null) data.condition = fields.condition;
    if (fields.notes !== undefined) data.notes = fields.notes || null;
    if (fields.licenseKey !== undefined) data.licenseKey = fields.licenseKey || null;
    if (fields.version !== undefined) data.version = fields.version || null;

    const item = await prisma.equipment.update({ where: { id }, data });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE — remove equipment
export async function DELETE(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    // Verify ownership through position
    const existing = await prisma.equipment.findUnique({
      where: { id },
      include: { position: { select: { userId: true } } },
    });
    if (!existing || existing.position.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.equipment.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
