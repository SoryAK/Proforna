import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  if (body.enrolledAt) body.enrolledAt = new Date(body.enrolledAt);
  if (body.expiresAt) body.expiresAt = new Date(body.expiresAt);
  const updated = await prisma.benefit.update({ where: { id }, data: body });
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.benefit.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
