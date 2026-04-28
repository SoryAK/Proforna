import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_SECTIONS: SectionConfig[] = [
  { type: "summary", visible: true, order: 0 },
  { type: "experience", visible: true, order: 1 },
  { type: "skills", visible: true, order: 2 },
  { type: "certifications", visible: true, order: 3 },
  { type: "contact", visible: true, order: 4 },
];

type SectionConfig = {
  type: string;
  visible: boolean;
  order: number;
  settings?: Record<string, unknown>;
};

// Public: get the adaptive Interactive Resume by slug.
// Resolution order:
//   1. UserProfile.irSlug    (new, profile-driven IR)
//   2. InteractiveResume.slug (legacy — kept alive so old shared links still work)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const accessToken = req.nextUrl.searchParams.get("token");

  // 1. Try profile-driven IR first
  let profile = await prisma.userProfile.findUnique({ where: { irSlug: slug } });
  let legacyResume: Awaited<ReturnType<typeof prisma.interactiveResume.findUnique>> = null;

  if (!profile) {
    legacyResume = await prisma.interactiveResume.findUnique({ where: { slug } });
    if (legacyResume && legacyResume.isPublished) {
      profile = await prisma.userProfile.findFirst({ where: { userId: legacyResume.userId } });
    }
  }

  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const visibility = profile.visibility || "public";
  if (visibility === "private") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ── Resolve token-based access (single-use links + approved access requests) ──
  let singleUseAccess = false;
  let viewerOverride: { targetRole: string | null; focusSections: string[] | null } | null = null;

  if (accessToken && accessToken.length > 40) {
    const link = await prisma.singleUseLink.findUnique({ where: { token: accessToken } });
    if (link && !link.viewedAt && link.expiresAt > new Date() && link.profileId === profile.id) {
      singleUseAccess = true;
      viewerOverride = {
        targetRole: link.targetRole,
        focusSections: link.focusSections ? safeParseArray(link.focusSections) : null,
      };
      await prisma.singleUseLink.update({
        where: { id: link.id },
        data: { viewedAt: new Date(), viewedBy: req.headers.get("user-agent") || "unknown" },
      });
    }
  }

  let approvedAccess = false;
  if (accessToken && !singleUseAccess) {
    const request = await prisma.accessRequest.findUnique({ where: { accessToken } });
    if (request && request.status === "approved" && request.profileId === profile.id) {
      if (!request.tokenExpiresAt || request.tokenExpiresAt > new Date()) {
        approvedAccess = true;
        viewerOverride = {
          targetRole: request.targetRole,
          focusSections: request.focusSections ? safeParseArray(request.focusSections) : null,
        };
      }
    }
  }

  const hasFullAccess = visibility === "public" || singleUseAccess || approvedAccess;

  // ── Resolve sections + theme + summary, preferring profile config but falling back to legacy IR ──
  const sectionsRaw = profile.irSections ?? legacyResume?.sections ?? null;
  const sections: SectionConfig[] = sectionsRaw ? safeParseSections(sectionsRaw) : DEFAULT_SECTIONS;
  const theme = profile.irTheme || legacyResume?.theme || "modern";
  const targetRole = viewerOverride?.targetRole || profile.irTargetRole || legacyResume?.targetRole || null;
  // Adaptive summary = bio (canonical), with legacy resume.summary as fallback
  const summary = profile.bio || legacyResume?.summary || null;
  const title = legacyResume?.title || profile.fullName || "Interactive Resume";
  const updatedAt = legacyResume?.updatedAt || profile.updatedAt;

  const visibleTypes = new Set(sections.filter((s) => s.visible).map((s) => s.type));

  // ── Fetch only the data we need ──
  const [skills, certifications, experience] = await Promise.all([
    visibleTypes.has("skills")
      ? prisma.skill.findMany({ where: { userId: profile.userId }, orderBy: { category: "asc" } })
      : Promise.resolve([]),
    visibleTypes.has("certifications")
      ? prisma.certification.findMany({ where: { userId: profile.userId }, orderBy: { issueDate: "desc" } })
      : Promise.resolve([]),
    visibleTypes.has("experience")
      ? prisma.workHistory.findMany({
          where: { userId: profile.userId },
          orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
          include: {
            galleryPhotos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] },
            attachments: { orderBy: { createdAt: "desc" } },
            equipment: { include: { photos: { orderBy: { isCover: "desc" } } } },
          },
        })
      : Promise.resolve([]),
  ]);

  // ── Build response based on visibility ──
  if (hasFullAccess) {
    const expData = profile.hideCurrentEmployer
      ? experience.map((pos) => ({ ...pos, company: pos.isActive ? "Current Employer" : pos.company }))
      : experience;

    return NextResponse.json({
      visibility: "public",
      resume: { title, targetRole, summary, theme, sections, updatedAt },
      viewerOverride,
      profile: {
        fullName: profile.fullName,
        headline: profile.headline,
        avatarUrl: profile.avatarUrl,
        email: visibleTypes.has("contact") ? profile.email : null,
        phone: visibleTypes.has("contact") ? profile.phone : null,
        linkedinUrl: visibleTypes.has("contact") ? profile.linkedinUrl : null,
        githubUrl: visibleTypes.has("contact") ? profile.githubUrl : null,
        portfolioUrl: visibleTypes.has("contact") ? profile.portfolioUrl : null,
        schedulingUrl: visibleTypes.has("contact") ? profile.schedulingUrl : null,
        city: profile.city,
        state: profile.state,
      },
      skills,
      certifications,
      experience: expData,
    });
  }

  // ── Stealth: show value but hide identity ──
  if (visibility === "stealth") {
    const anonName = profile.anonymousTitle || `Verified Professional #${profile.id.slice(-4).toUpperCase()}`;
    return NextResponse.json({
      visibility: "stealth",
      profileId: profile.id,
      resume: { title, targetRole, summary, theme, sections, updatedAt },
      viewerOverride: null,
      profile: {
        fullName: anonName,
        headline: profile.headline,
        avatarUrl: null,
        email: null,
        linkedinUrl: null,
        githubUrl: null,
        portfolioUrl: null,
        city: profile.city,
        state: profile.state,
      },
      skills,
      certifications,
      experience: experience.map((pos) => ({
        ...pos,
        company: pos.isActive ? "Current Employer (Hidden)" : pos.company,
      })),
    });
  }

  // ── Anonymous: fully redacted ──
  const anonName = profile.anonymousTitle || `Verified Professional #${profile.id.slice(-4).toUpperCase()}`;
  return NextResponse.json({
    visibility: "anonymous",
    profileId: profile.id,
    resume: {
      title: anonName,
      targetRole,
      summary: null,
      theme,
      sections: sections.filter((s) => s.type === "skills" || s.type === "certifications"),
      updatedAt,
    },
    viewerOverride: null,
    profile: {
      fullName: anonName,
      headline: profile.headline,
      avatarUrl: null,
      email: null,
      linkedinUrl: null,
      githubUrl: null,
      portfolioUrl: null,
      city: profile.state ? `${profile.state} area` : null,
      state: null,
    },
    skills,
    certifications,
    experience: experience.map((pos) => ({
      ...pos,
      company: "Industry Employer",
      role: pos.title,
      location: null,
      description: null,
      techStack: null,
    })),
  });
}

function safeParseSections(raw: string): SectionConfig[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as SectionConfig[];
  } catch {}
  return DEFAULT_SECTIONS;
}

function safeParseArray(raw: string): string[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === "string");
  } catch {}
  return null;
}
