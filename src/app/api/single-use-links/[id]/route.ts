import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// DELETE - revoke a single-use link
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const link = await prisma.singleUseLink.findUnique({ where: { id } });
  if (!link || link.profileId !== profile.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.singleUseLink.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
