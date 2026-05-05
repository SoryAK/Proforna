import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

/**
 * Snapshot the user's IR-facing data (profile + compensation + work history)
 * into PublishedProfile. The public IR endpoint reads from this snapshot,
 * so unpublished edits never leak.
 */

const PROFILE_FIELDS = [
  "fullName", "headline", "email", "phone", "avatarUrl", "city", "state",
  "linkedinUrl", "githubUrl", "portfolioUrl", "schedulingUrl",
  "contactCtaMessage",
  "homeLat", "homeLng", "maxCommuteMiles",
  "availability", "bio", "preferredRoles", "targetSalaryMin", "targetSalaryMax",
  "currency", "locationPreference", "industryGroup",
  "showSkills", "showResume", "showCertifications", "showCurrentRole",
  "irSlug", "irTheme", "irSections", "irTargetRole",
  "visibility", "hideCurrentEmployer", "anonymousTitle",
] as const;

function pickProfile(profile: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { id: profile.id, updatedAt: profile.updatedAt };
  for (const k of PROFILE_FIELDS) out[k] = profile[k];
  return out;
}

function sanitizeComp(comp: Record<string, unknown> | null) {
  if (!comp) return null;
  // Pre-format into the final public shape:
  //  - strip hardFloor exact value (expose only existence flag)
  //  - parse JSON-encoded array fields
  const safeArr = (raw: unknown): string[] => {
    if (typeof raw !== "string" || !raw) return [];
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
    } catch { return []; }
  };
  return {
    period: comp.period ?? "annual",
    currency: comp.currency ?? "USD",
    salaryMin: comp.salaryMin ?? null,
    salaryTarget: comp.salaryTarget ?? null,
    salaryMax: comp.salaryMax ?? null,
    hasHardFloor: comp.hardFloor != null,
    employmentTypes: safeArr(comp.employmentTypes),
    openToRelocation: !!comp.openToRelocation,
    openToEquity: !!comp.openToEquity,
    openToBonus: !!comp.openToBonus,
    openToSignOn: !!comp.openToSignOn,
    remotePreference: comp.remotePreference ?? "any",
    benefitsMustHaves: safeArr(comp.benefitsMustHaves),
    notes: comp.notes ?? null,
    visibility: comp.visibility ?? "public",
  };
}

// GET — current publish status: has the user ever published, and when?
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const published = await prisma.publishedProfile.findUnique({
    where: { userId },
    select: { publishedAt: true, publishNote: true },
  });

  return NextResponse.json({
    everPublished: !!published,
    publishedAt: published?.publishedAt ?? null,
    publishNote: published?.publishNote ?? null,
  });
}

// POST — take a fresh snapshot of profile + compensation + work history.
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let publishNote: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.publishNote === "string") {
      publishNote = body.publishNote.slice(0, 500) || null;
    }
  } catch { /* ignore */ }

  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const [comp, workHistory] = await Promise.all([
    prisma.compensationPreference.findUnique({ where: { profileId: profile.id } }),
    prisma.workHistory.findMany({
      where: { userId },
      orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
      include: {
        galleryPhotos: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
          include: {
            annotations: {
              where: { isPrivate: false },
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            },
          },
        },
        attachments: { orderBy: { createdAt: "desc" } },
        equipment: { include: { photos: { orderBy: { isCover: "desc" } } } },
        locations: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      },
    }),
  ]);

  const profileSnapshot = pickProfile(profile as unknown as Record<string, unknown>);
  const compensationSnapshot = sanitizeComp(comp as unknown as Record<string, unknown> | null);
  const workHistorySnapshot = workHistory;

  // Server-side dedupe: if the snapshot bytes are identical to the current
  // PublishedProfile and no new note was supplied, skip the write entirely.
  // The button is always-on, so this prevents needless DB writes when the
  // user re-publishes without having changed anything.
  const existing = await prisma.publishedProfile.findUnique({ where: { userId } });
  if (existing && publishNote == null) {
    const sameProfile = JSON.stringify(existing.profileSnapshot) === JSON.stringify(profileSnapshot);
    const sameComp = JSON.stringify(existing.compensationSnapshot ?? null) === JSON.stringify(compensationSnapshot);
    const sameWh = JSON.stringify(existing.workHistorySnapshot ?? null) === JSON.stringify(workHistorySnapshot);
    if (sameProfile && sameComp && sameWh) {
      return NextResponse.json({
        publishedAt: existing.publishedAt,
        publishNote: existing.publishNote,
        noChange: true,
        counts: { workHistory: workHistory.length },
      });
    }
  }

  const saved = await prisma.publishedProfile.upsert({
    where: { userId },
    create: {
      userId,
      profileSnapshot: profileSnapshot as never,
      compensationSnapshot: compensationSnapshot as never,
      workHistorySnapshot: workHistorySnapshot as never,
      publishNote,
    },
    update: {
      profileSnapshot: profileSnapshot as never,
      compensationSnapshot: compensationSnapshot as never,
      workHistorySnapshot: workHistorySnapshot as never,
      publishedAt: new Date(),
      publishNote,
    },
  });

  return NextResponse.json({
    publishedAt: saved.publishedAt,
    publishNote: saved.publishNote,
    noChange: false,
    counts: {
      workHistory: workHistory.length,
    },
  });
}

// DELETE — revert to "never published" state (unpublish).
export async function DELETE() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.publishedProfile.deleteMany({ where: { userId } });
  return NextResponse.json({ ok: true });
}
