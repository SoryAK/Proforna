import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// POST /api/interactive-resumes/public/[slug]/contact
// Public endpoint: a recruiter/visitor submits their info on the IR page.
// Persists a RecruiterSubmission for the candidate (userId resolved from slug).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Resolve slug → userId via profile or legacy IR record
  let profile = await prisma.userProfile.findUnique({ where: { irSlug: slug } });
  if (!profile) {
    const legacy = await prisma.interactiveResume.findUnique({ where: { slug } });
    if (legacy && legacy.isPublished) {
      profile = await prisma.userProfile.findFirst({ where: { userId: legacy.userId } });
    }
  }
  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const recruiterName = typeof body.recruiterName === "string" ? body.recruiterName.trim() : "";
  const recruiterEmail = typeof body.recruiterEmail === "string" ? body.recruiterEmail.trim() : "";
  const recruiterPhone = typeof body.recruiterPhone === "string" ? body.recruiterPhone.trim() || null : null;
  const jobTitle = typeof body.jobTitle === "string" ? body.jobTitle.trim() : "";
  const company = typeof body.company === "string" ? body.company.trim() || null : null;
  const message = typeof body.message === "string" ? body.message.trim() || null : null;
  const linkedinUrl = typeof body.linkedinUrl === "string" ? body.linkedinUrl.trim() || null : null;
  const location = typeof body.location === "string" ? body.location.trim() || null : null;
  const jobType = typeof body.jobType === "string" ? body.jobType.trim() || null : null;
  const jobDescription = typeof body.jobDescription === "string" ? body.jobDescription.trim() || null : null;
  const toIntOrNull = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.round(v);
    if (typeof v === "string" && v.trim()) {
      const n = Number(v.replace(/[^0-9.]/g, ""));
      if (Number.isFinite(n) && n >= 0) return Math.round(n);
    }
    return null;
  };
  const salaryMin = toIntOrNull(body.salaryMin);
  const salaryMax = toIntOrNull(body.salaryMax);
  const joinNetwork = body.joinNetwork === true;

  // Recruit Mode metadata (optional)
  const toFloatOrNull = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim()) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return null;
  };
  const jobLat = toFloatOrNull(body.jobLat);
  const jobLng = toFloatOrNull(body.jobLng);
  const commuteMiles = toFloatOrNull(body.commuteMiles);
  const commuteMinutes = toIntOrNull(body.commuteMinutes);
  const withinRange = typeof body.withinRange === "boolean" ? body.withinRange : null;

  if (!recruiterName || !recruiterEmail || !jobTitle) {
    return NextResponse.json(
      { error: "Name, email, and role/job title are required" },
      { status: 400 }
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recruiterEmail)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  try {
    await prisma.recruiterSubmission.create({
      data: {
        userId: profile.userId,
        recruiterName,
        recruiterEmail,
        recruiterPhone,
        company,
        linkedinUrl,
        jobTitle,
        jobDescription,
        location,
        jobType,
        salaryMin,
        salaryMax,
        message,
        joinNetwork,
        jobLat,
        jobLng,
        commuteMiles,
        commuteMinutes,
        withinRange,
        status: "new",
      },
    });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
