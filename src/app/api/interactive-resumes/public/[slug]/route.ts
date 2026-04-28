import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// Public: get interactive resume data by slug
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const accessToken = req.nextUrl.searchParams.get("token");

  const resume = await prisma.interactiveResume.findUnique({ where: { slug } });
  if (!resume || !resume.isPublished) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const profile = await prisma.userProfile.findFirst({ where: { userId: resume.userId } });
  const visibility = profile?.visibility || "public";

  // ── Private: disabled entirely ──
  if (visibility === "private") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ── Check employer blocking by email domain ──
  // (Only effective when a domain-based token is available from access request)

  // ── Check single-use link token ──
  let singleUseAccess = false;
  if (accessToken && accessToken.length > 40) {
    const link = await prisma.singleUseLink.findUnique({ where: { token: accessToken } });
    if (link && !link.viewedAt && link.expiresAt > new Date() && link.profileId === profile?.id) {
      singleUseAccess = true;
      // Mark as used
      await prisma.singleUseLink.update({
        where: { id: link.id },
        data: { viewedAt: new Date(), viewedBy: req.headers.get("user-agent") || "unknown" },
      });
    }
  }

  // ── Check approved access token ──
  let approvedAccess = false;
  if (accessToken && !singleUseAccess) {
    const request = await prisma.accessRequest.findUnique({ where: { accessToken } });
    if (request && request.status === "approved" && request.profileId === profile?.id) {
      if (!request.tokenExpiresAt || request.tokenExpiresAt > new Date()) {
        approvedAccess = true;
      }
    }
  }

  const hasFullAccess = visibility === "public" || singleUseAccess || approvedAccess;

  // Parse sections config
  type SectionConfig = { type: string; visible: boolean; order: number };
  const sections: SectionConfig[] = resume.sections
    ? JSON.parse(resume.sections)
    : [
        { type: "summary", visible: true, order: 0 },
        { type: "experience", visible: true, order: 1 },
        { type: "skills", visible: true, order: 2 },
        { type: "certifications", visible: true, order: 3 },
        { type: "contact", visible: true, order: 4 },
      ];

  const visibleTypes = new Set(
    sections.filter((s) => s.visible).map((s) => s.type)
  );

  // Fetch data based on visible sections (scoped to resume owner)
  const skills = visibleTypes.has("skills")
    ? await prisma.skill.findMany({ where: { userId: resume.userId }, orderBy: { category: "asc" } })
    : [];

  const certifications = visibleTypes.has("certifications")
    ? await prisma.certification.findMany({ where: { userId: resume.userId }, orderBy: { issueDate: "desc" } })
    : [];

  const experience = visibleTypes.has("experience")
    ? await prisma.workHistory.findMany({
        where: { userId: resume.userId },
        orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
        include: {
          galleryPhotos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] },
          attachments: { orderBy: { createdAt: "desc" } },
          equipment: { include: { photos: { orderBy: { isCover: "desc" } } } },
        },
      })
    : [];

  // ── Build response based on visibility ──

  if (hasFullAccess) {
    // Full access — return everything (but still respect hideCurrentEmployer)
    const expData = profile?.hideCurrentEmployer
      ? experience.map((pos) => ({
          ...pos,
          company: pos.isActive ? "Current Employer" : pos.company,
        }))
      : experience;

    return NextResponse.json({
      visibility: "public",
      resume: { title: resume.title, targetRole: resume.targetRole, summary: resume.summary, theme: resume.theme, sections, updatedAt: resume.updatedAt },
      profile: profile
        ? {
            fullName: profile.fullName,
            headline: profile.headline,
            avatarUrl: profile.avatarUrl,
            email: visibleTypes.has("contact") ? profile.email : null,
            linkedinUrl: visibleTypes.has("contact") ? profile.linkedinUrl : null,
            githubUrl: visibleTypes.has("contact") ? profile.githubUrl : null,
            portfolioUrl: visibleTypes.has("contact") ? profile.portfolioUrl : null,
            city: profile.city,
            state: profile.state,
          }
        : null,
      skills,
      certifications,
      experience: expData,
    });
  }

  // ── Stealth: show value but hide identity ──
  if (visibility === "stealth") {
    return NextResponse.json({
      visibility: "stealth",
      profileId: profile?.id,
      resume: { title: resume.title, targetRole: resume.targetRole, summary: resume.summary, theme: resume.theme, sections, updatedAt: resume.updatedAt },
      profile: {
        fullName: profile?.anonymousTitle || `Verified Professional #${profile?.id?.slice(-4).toUpperCase()}`,
        headline: profile?.headline,
        avatarUrl: null,
        email: null,
        linkedinUrl: null,
        githubUrl: null,
        portfolioUrl: null,
        city: profile?.city,
        state: profile?.state,
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
  return NextResponse.json({
    visibility: "anonymous",
    profileId: profile?.id,
    resume: {
      title: profile?.anonymousTitle || `Verified Professional #${profile?.id?.slice(-4).toUpperCase()}`,
      targetRole: resume.targetRole,
      summary: null,
      theme: resume.theme,
      sections: sections.filter((s) => s.type === "skills" || s.type === "certifications"),
      updatedAt: resume.updatedAt,
    },
    profile: {
      fullName: profile?.anonymousTitle || `Verified Professional #${profile?.id?.slice(-4).toUpperCase()}`,
      headline: profile?.headline,
      avatarUrl: null,
      email: null,
      linkedinUrl: null,
      githubUrl: null,
      portfolioUrl: null,
      city: profile?.state ? `${profile.state} area` : null,
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
