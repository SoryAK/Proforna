import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import crypto from "crypto";

// GET - list single-use links for the current user
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  if (!profile) return NextResponse.json([]);

  const links = await prisma.singleUseLink.findMany({
    where: { profileId: profile.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(links);
}

// POST - create a new single-use link
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const body = await req.json();
  const token = crypto.randomBytes(32).toString("hex");

  // Default expiry: 7 days
  const expiresInDays = Math.min(Math.max(body.expiresInDays || 7, 1), 90);
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  const link = await prisma.singleUseLink.create({
    data: {
      profileId: profile.id,
      token,
      label: body.label || null,
      expiresAt,
      targetRole: typeof body.targetRole === "string" ? (body.targetRole.trim() || null) : null,
      focusSections: Array.isArray(body.focusSections)
        ? JSON.stringify(body.focusSections.filter((s: unknown) => typeof s === "string"))
        : null,
    },
  });

  return NextResponse.json(link, { status: 201 });
}
