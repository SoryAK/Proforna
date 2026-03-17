import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - fetch a single position with related data
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const position = await prisma.currentPosition.findUnique({
      where: { id },
      include: {
        compensation: { orderBy: { effectiveDate: "desc" } },
        benefits: true,
        timeOff: true,
      },
    });
    if (!position) {
      return NextResponse.json({ error: "Position not found" }, { status: 404 });
    }
    return NextResponse.json(position);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PATCH - update a position
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (body.startDate) body.startDate = new Date(body.startDate);
    if (body.hoursPerWeek != null) body.hoursPerWeek = parseFloat(body.hoursPerWeek);
    if (body.scheduleBHours != null) body.scheduleBHours = parseFloat(body.scheduleBHours);
    if (body.otHoursA != null) body.otHoursA = parseFloat(body.otHoursA);
    if (body.otHoursB != null) body.otHoursB = parseFloat(body.otHoursB);
    if (body.otRate != null) body.otRate = parseFloat(body.otRate);

    const updated = await prisma.currentPosition.update({
      where: { id },
      data: body,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE - remove a position
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.currentPosition.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
