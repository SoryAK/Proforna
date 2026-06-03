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
      "linkedinUrl", "githubUrl", "portfolioUrl", "schedulingUrl", "avatarUrl",
      "contactCtaMessage",
      "maxCommuteMiles",
      "availability", "bio", "preferredRoles", "targetSalaryMin", "targetSalaryMax",
      "salaryPeriod", "currency", "locationPreference", "showSkills", "showResume", "showCertifications",
      "showCurrentRole", "portalSlug", "filingStatus", "federalTaxRate", "stateTaxRate",
      "monthlyExpenses",
      // Stealth mode fields
      "visibility", "hideCurrentEmployer", "anonymousTitle", "blockedEins", "blockedDomains",
      // Home address & commute/vehicle fields
      "homeAddress", "homeLat", "homeLng",
      "vehicleYear", "vehicleMake", "vehicleModel", "vehicleId", "vehicleMpg",
      "gasPricePerGallon", "daysInOffice",
      // Skill graph
      "industryGroup",
      // Adaptive Interactive Resume config
      "irSlug", "irTheme", "irSections", "irTargetRole",
      // Banner slideshow preference
      "bannerSlideshowEnabled",
    ];
    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) data[key] = body[key];
    }

    // Normalize / validate irSlug if provided
    if (typeof data.irSlug === "string") {
      const cleaned = data.irSlug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
      if (!cleaned) {
        data.irSlug = null;
      } else if (cleaned.length < 3 || cleaned.length > 60) {
        return NextResponse.json({ error: "Slug must be 3–60 characters." }, { status: 400 });
      } else {
        data.irSlug = cleaned;
        // Reserved slugs that collide with app routes
        const RESERVED = new Set(["api", "app", "admin", "dashboard", "settings", "auth", "login", "signup", "signin", "r", "u", "portal"]);
        if (RESERVED.has(cleaned)) {
          return NextResponse.json({ error: "That slug is reserved." }, { status: 400 });
        }
      }
    }

    try {
      const updated = await prisma.userProfile.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
      return NextResponse.json(updated);
    } catch (e: unknown) {
      // Prisma unique constraint failure on irSlug
      if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "P2002") {
        return NextResponse.json({ error: "That slug is already taken." }, { status: 409 });
      }
      throw e;
    }
  } catch (error) {
    console.error("[PATCH /api/profile] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
