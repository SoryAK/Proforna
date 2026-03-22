import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contacts = await prisma.contact.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(contacts);
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  const contact = await prisma.contact.create({ data: { ...data, userId } });
  await logActivity("contact", contact.id, "created", `Added contact: ${contact.name}`);
  return NextResponse.json(contact, { status: 201 });
}
