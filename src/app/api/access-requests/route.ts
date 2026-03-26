import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import crypto from "crypto";

// GET - list access requests for the current user's profile
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  if (!profile) return NextResponse.json([]);

  const requests = await prisma.accessRequest.findMany({
    where: { profileId: profile.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(requests);
}

// POST - recruiter submits an access request (public, no auth required)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { profileId, name, email, company, linkedin, message } = body;

  if (!profileId || !name || !email) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const profile = await prisma.userProfile.findUnique({ where: { id: profileId } });
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // Check blocked domains
  if (profile.blockedDomains) {
    const blocked: string[] = JSON.parse(profile.blockedDomains);
    const domain = email.split("@")[1]?.toLowerCase();
    if (domain && blocked.some((d) => d.toLowerCase() === domain)) {
      return NextResponse.json({ error: "Request could not be submitted" }, { status: 403 });
    }
  }

  // Prevent duplicate pending requests from same email
  const existing = await prisma.accessRequest.findFirst({
    where: { profileId, requesterEmail: email, status: "pending" },
  });
  if (existing) {
    return NextResponse.json({ error: "You already have a pending request" }, { status: 409 });
  }

  const request = await prisma.accessRequest.create({
    data: {
      profileId,
      requesterName: name,
      requesterEmail: email,
      requesterCompany: company || null,
      requesterLinkedin: linkedin || null,
      message: message || null,
    },
  });

  return NextResponse.json(request, { status: 201 });
}
