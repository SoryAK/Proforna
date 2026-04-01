import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json([], { status: 401 });

  const watchlist = await prisma.companyWatchlist.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, companyName: true, createdAt: true },
  });
  return NextResponse.json(watchlist);
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { companyName } = await req.json();
  if (!companyName || typeof companyName !== "string") {
    return NextResponse.json({ error: "companyName required" }, { status: 400 });
  }

  const entry = await prisma.companyWatchlist.upsert({
    where: { userId_companyName: { userId, companyName } },
    update: {},
    create: { userId, companyName },
  });
  return NextResponse.json(entry, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { companyName } = await req.json();
  if (!companyName || typeof companyName !== "string") {
    return NextResponse.json({ error: "companyName required" }, { status: 400 });
  }

  await prisma.companyWatchlist.deleteMany({
    where: { userId, companyName },
  });
  return NextResponse.json({ ok: true });
}
