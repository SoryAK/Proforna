import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

/* ── GET — list the authenticated user's job postings ── */
export async function GET() {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const postings = await prisma.jobPosting.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(postings);
}

/* ── POST — create a new job posting ── */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  const {
    company,
    companyLogo,
    role,
    department,
    location,
    type,
    employmentType,
    experienceLevel,
    salaryMin,
    salaryMax,
    currency,
    payFrequency,
    description,
    requirements,
    niceToHave,
    benefits,
    techStack,
    applicationUrl,
    contactEmail,
    ein,
    isPublished,
    isFeatured,
    expiresAt,
  } = body;

  if (!company?.trim() || !role?.trim() || !description?.trim()) {
    return NextResponse.json(
      { error: "Company, role, and description are required" },
      { status: 400 }
    );
  }

  const posting = await prisma.jobPosting.create({
    data: {
      userId,
      company: company.trim(),
      companyLogo: companyLogo || null,
      role: role.trim(),
      department: department?.trim() || null,
      location: location?.trim() || null,
      type: type || "remote",
      employmentType: employmentType || "full_time",
      experienceLevel: experienceLevel || "mid",
      salaryMin: salaryMin ? parseInt(salaryMin) : null,
      salaryMax: salaryMax ? parseInt(salaryMax) : null,
      currency: currency || "USD",
      payFrequency: payFrequency || "yearly",
      description: description.trim(),
      requirements: requirements?.trim() || null,
      niceToHave: niceToHave?.trim() || null,
      benefits: benefits?.trim() || null,
      techStack: techStack?.trim() || null,
      applicationUrl: applicationUrl?.trim() || null,
      contactEmail: contactEmail?.trim() || null,
      ein: ein?.trim() || null,
      isPublished: isPublished ?? false,
      isFeatured: isFeatured ?? false,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });

  return NextResponse.json(posting, { status: 201 });
}
