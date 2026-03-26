import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import crypto from "crypto";

// PATCH - approve or deny an access request
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { status } = await req.json();

  if (!["approved", "denied"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Verify ownership
  const request = await prisma.accessRequest.findUnique({
    where: { id },
    include: { profile: true },
  });
  if (!request || request.profile.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = { status };

  if (status === "approved") {
    const token = crypto.randomBytes(32).toString("hex");
    updateData.accessToken = token;
    updateData.approvedAt = new Date();
    // Token valid for 30 days
    updateData.tokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }

  const updated = await prisma.accessRequest.update({ where: { id }, data: updateData });
  return NextResponse.json(updated);
}

// DELETE - remove an access request
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const request = await prisma.accessRequest.findUnique({
    where: { id },
    include: { profile: true },
  });
  if (!request || request.profile.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.accessRequest.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
