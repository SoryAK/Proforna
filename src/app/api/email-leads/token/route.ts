import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import crypto from "crypto";

/**
 * GET /api/email-leads/token
 * Returns the user's ingest token (creates one if it doesn't exist).
 *
 * POST /api/email-leads/token
 * Regenerates the ingest token (invalidates the old one).
 */
export async function GET() {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ingestToken: true },
  });

  let token = user?.ingestToken;

  // Auto-generate on first access
  if (!token) {
    token = crypto.randomBytes(24).toString("base64url");
    await prisma.user.update({
      where: { id: userId },
      data: { ingestToken: token },
    });
  }

  return NextResponse.json({ token });
}

export async function POST() {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = crypto.randomBytes(24).toString("base64url");
  await prisma.user.update({
    where: { id: userId },
    data: { ingestToken: token },
  });

  return NextResponse.json({ token });
}
