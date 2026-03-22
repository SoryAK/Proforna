import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

export async function PATCH(
  request: Request,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json();
  if (body.enrolledAt) body.enrolledAt = new Date(body.enrolledAt);
  if (body.expiresAt) body.expiresAt = new Date(body.expiresAt);
  const updated = await prisma.benefit.update({ where: { id }, data: body });
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.benefit.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
