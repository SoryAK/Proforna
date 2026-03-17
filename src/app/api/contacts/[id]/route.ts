import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await req.json();
  const contact = await prisma.contact.update({ where: { id }, data });
  await logActivity("contact", id, "updated", `Updated contact: ${contact.name}`);
  return NextResponse.json(contact);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.contact.delete({ where: { id } });
  await logActivity("contact", id, "deleted", "Deleted contact");
  return NextResponse.json({ success: true });
}
