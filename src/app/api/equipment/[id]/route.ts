import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PUT — update equipment item
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const item = await prisma.equipment.update({
      where: { id },
      data: {
        name: body.name,
        category: body.category,
        manufacturer: body.manufacturer || null,
        model: body.model || null,
        serialNumber: body.serialNumber || null,
        assetTag: body.assetTag || null,
        assignedDate: body.assignedDate ? new Date(body.assignedDate) : null,
        returnedDate: body.returnedDate ? new Date(body.returnedDate) : null,
        condition: body.condition,
        licenseKey: body.licenseKey || null,
        version: body.version || null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        notes: body.notes || null,
      },
    });

    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE — remove equipment item
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.equipment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
