import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// Helper: ensure user exists before profile operations
async function ensureUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return !!user;
}

// GET - fetch profile (auto-create default if none exists)
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    if (!(await ensureUser(userId))) {
      return NextResponse.json(
        { error: "User not found. Please sign out and sign back in." },
        { status: 401 },
      );
    }
    const profile = await prisma.userProfile.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    return NextResponse.json(profile);
  } catch (error) {
    console.error("[GET /api/profile] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PATCH - update profile settings
export async function PATCH(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    if (!(await ensureUser(userId))) {
      return NextResponse.json(
        { error: "User not found. Please sign out and sign back in." },
        { status: 401 },
      );
    }
    const body = await request.json();
    // Whitelist allowed fields
    const allowed = [
      "fullName", "headline", "email", "phone", "city", "state",
      "linkedinUrl", "githubUrl", "portfolioUrl", "avatarUrl",
      "availability", "bio", "preferredRoles", "targetSalaryMin", "targetSalaryMax",
      "currency", "locationPreference", "showSkills", "showResume", "showCertifications",
      "showCurrentRole", "portalSlug", "filingStatus", "federalTaxRate", "stateTaxRate",
      "monthlyExpenses",
      // Stealth mode fields
      "visibility", "hideCurrentEmployer", "anonymousTitle", "blockedEins", "blockedDomains",
    ];
    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) data[key] = body[key];
    }
    const updated = await prisma.userProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PATCH /api/profile] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
