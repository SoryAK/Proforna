import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

/**
 * GET /api/email-leads
 * Returns all non-expired email leads for the current user.
 * Query params: ?source=indeed (optional filter)
 *
 * DELETE /api/email-leads
 * Prune expired leads or delete all: ?expired=true or ?all=true
 */
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source");

  const leads = await prisma.emailLead.findMany({
    where: {
      userId,
      expiresAt: { gt: new Date() },
      ...(source ? { source } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ leads, count: leads.length });
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const pruneExpired = searchParams.get("expired") === "true";
  const deleteAll = searchParams.get("all") === "true";

  if (deleteAll) {
    const { count } = await prisma.emailLead.deleteMany({ where: { userId } });
    return NextResponse.json({ deleted: count });
  }

  if (pruneExpired) {
    const { count } = await prisma.emailLead.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });
    return NextResponse.json({ pruned: count });
  }

  return NextResponse.json({ error: "Specify ?expired=true or ?all=true" }, { status: 400 });
}
