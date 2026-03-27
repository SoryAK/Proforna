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

/* ── POST — company submits a new job posting (public, no auth required) ── */
export async function POST(req: NextRequest) {
  // Companies can submit without a Resumsify account
  // Optionally link to an authenticated user if logged in
  const userId = await getUserId().catch(() => null);

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
    expiresAt,
  } = body;

  if (!company?.trim() || !role?.trim() || !description?.trim() || !contactEmail?.trim()) {
    return NextResponse.json(
      { error: "Company, role, description, and contact email are required" },
      { status: 400 }
    );
  }

  // Validate contact email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
    return NextResponse.json({ error: "Invalid contact email" }, { status: 400 });
  }

  const posting = await prisma.jobPosting.create({
    data: {
      userId: userId || undefined,
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
      contactEmail: contactEmail.trim(),
      ein: ein?.trim() || null,
      isPublished: false, // Always starts unpublished — requires review
      isFeatured: false,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });

  return NextResponse.json(posting, { status: 201 });
}
