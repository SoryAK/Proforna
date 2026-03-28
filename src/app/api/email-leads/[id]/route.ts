import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

/**
 * DELETE /api/email-leads/[id]
 * Delete a single email lead by ID.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const lead = await prisma.emailLead.findUnique({ where: { id } });
  if (!lead || lead.userId !== userId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.emailLead.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
