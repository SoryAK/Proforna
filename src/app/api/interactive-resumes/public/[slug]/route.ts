import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// Public: get interactive resume data by slug
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const resume = await prisma.interactiveResume.findUnique({ where: { slug } });
  if (!resume || !resume.isPublished) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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

  const profile = await prisma.userProfile.findFirst({ where: { userId: resume.userId } });

  // Fetch data based on visible sections (scoped to resume owner)
  const skills = visibleTypes.has("skills")
    ? await prisma.skill.findMany({ where: { userId: resume.userId }, orderBy: { category: "asc" } })
    : [];

  const certifications = visibleTypes.has("certifications")
    ? await prisma.certification.findMany({ where: { userId: resume.userId }, orderBy: { issueDate: "desc" } })
    : [];

  const experience = visibleTypes.has("experience")
    ? await prisma.currentPosition.findMany({
        where: { userId: resume.userId },
        orderBy: { startDate: "desc" },
      })
    : [];

  return NextResponse.json({
    resume: {
      title: resume.title,
      targetRole: resume.targetRole,
      summary: resume.summary,
      theme: resume.theme,
      sections,
    },
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
    experience,
  });
}
