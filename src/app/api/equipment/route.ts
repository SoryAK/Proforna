import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — list equipment for a position
export async function GET(request: Request) {
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
  try {
    const body = await request.json();
    const { positionId, name, category, manufacturer, model, serialNumber, assetTag, assignedDate, returnedDate, condition, licenseKey, version, expiresAt, notes } = body;

    if (!positionId || !name) {
      return NextResponse.json({ error: "positionId and name are required" }, { status: 400 });
    }

    const item = await prisma.equipment.create({
      data: {
        positionId,
        name,
        category: category || "hardware",
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
