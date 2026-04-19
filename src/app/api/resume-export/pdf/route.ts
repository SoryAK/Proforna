import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import ReactPDF from "@react-pdf/renderer";
import { ResumePdfDocument } from "@/lib/resume-pdf-template";
import { getUserId } from "@/lib/auth-utils";

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const resumeId = sp.get("resumeId");

  // Gather all resume data in parallel
  const [profile, positions, skills, certifications, resume] = await Promise.all([
    prisma.userProfile.findFirst(),
    prisma.workHistory.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.skill.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] }),
    prisma.certification.findMany({ orderBy: { issueDate: "desc" } }),
    resumeId ? prisma.resumeVersion.findUnique({ where: { id: resumeId } }) : null,
  ]);

  if (!profile) {
    return NextResponse.json(
      { error: "Profile not found. Please set up your profile first." },
      { status: 404 }
    );
  }

  const data = {
    profile: {
      fullName: profile.fullName || "Your Name",
      headline: profile.headline || "",
      email: profile.email || "",
      phone: profile.phone || "",
      city: profile.city || "",
      state: profile.state || "",
      linkedinUrl: profile.linkedinUrl || "",
      githubUrl: profile.githubUrl || "",
      portfolioUrl: profile.portfolioUrl || "",
      bio: profile.bio || "",
    },
    experience: positions.map((p) => ({
      company: p.company,
      role: p.title || p.company,
      department: p.department,
      location: p.location,
      type: p.workMode || "onsite",
      startDate: p.startDate || "",
      endDate: p.endDate || null,
      isActive: p.isActive,
      techStack: p.techStack,
      description: p.description,
      responsibilities: p.responsibilities,
    })),
    skills: skills.map((s) => ({
      name: s.name,
      category: s.category,
      proficiency: s.proficiency,
    })),
    certifications: certifications.map((c) => ({
      name: c.name,
      issuer: c.issuer,
      issueDate: c.issueDate.toISOString(),
      expiryDate: c.expiryDate?.toISOString() || null,
    })),
    targetRole: resume?.targetRole || null,
  };

  const pdfStream = await ReactPDF.renderToStream(ResumePdfDocument({ data }));

  // Collect into buffer
  const chunks: Uint8Array[] = [];
  for await (const chunk of pdfStream) {
    chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
  }
  const buffer = Buffer.concat(chunks);

  const filename = resume?.name
    ? `${resume.name.replace(/[^a-zA-Z0-9-_ ]/g, "")}.pdf`
    : `${(profile.fullName || "resume").replace(/\s+/g, "_")}_Resume.pdf`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
