import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — list connected email accounts (tokens omitted)
export async function GET() {
  const accounts = await prisma.emailAccount.findMany({
    select: {
      id: true,
      provider: true,
      email: true,
      tokenExpiry: true,
      createdAt: true,
      _count: { select: { emails: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(accounts);
}

// DELETE — disconnect an email account (by id in body)
export async function DELETE(req: NextRequest) {
  const { id } = (await req.json()) as { id: string };
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  await prisma.emailAccount.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
