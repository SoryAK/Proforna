import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// GET - fetch profile (auto-create default if none exists)
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    let profile = await prisma.userProfile.findFirst({ where: { userId } });
    if (!profile) {
      profile = await prisma.userProfile.create({ data: { userId } });
    }
    return NextResponse.json(profile);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PATCH - update profile settings
export async function PATCH(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    let profile = await prisma.userProfile.findFirst({ where: { userId } });
    if (!profile) {
      profile = await prisma.userProfile.create({ data: { userId } });
    }
    // Whitelist allowed fields
    const allowed = [
      "fullName", "headline", "email", "phone", "city", "state",
      "linkedinUrl", "githubUrl", "portfolioUrl", "avatarUrl",
      "availability", "bio", "preferredRoles", "targetSalaryMin", "targetSalaryMax",
      "currency", "locationPreference", "showSkills", "showResume", "showCertifications",
      "showCurrentRole", "portalSlug", "filingStatus", "federalTaxRate", "stateTaxRate",
      "monthlyExpenses",
    ];
    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) data[key] = body[key];
    }
    const updated = await prisma.userProfile.update({
      where: { id: profile.id },
      data,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
