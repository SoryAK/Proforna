import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  if (body.effectiveDate) body.effectiveDate = new Date(body.effectiveDate);
  const updated = await prisma.compensationEvent.update({ where: { id }, data: body });
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.compensationEvent.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
