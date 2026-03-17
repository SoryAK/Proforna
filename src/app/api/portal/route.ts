import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - public endpoint: return portal data (profile, skills, resume availability)
export async function GET() {
  try {
    let profile = await prisma.userProfile.findFirst();
    if (!profile) {
      return NextResponse.json({ error: "Portal not configured" }, { status: 404 });
    }

    const skills = profile.showSkills
      ? await prisma.skill.findMany({ orderBy: { category: "asc" } })
      : [];

    const certifications = profile.showCertifications
      ? await prisma.certification.findMany({ orderBy: { issueDate: "desc" } })
      : [];

    const hasActiveResume = profile.showResume
      ? (await prisma.resumeVersion.count({ where: { isActive: true } })) > 0
      : false;

    const currentPosition = profile.showCurrentRole
      ? await prisma.currentPosition.findFirst({ where: { isActive: true }, orderBy: { startDate: "desc" } })
      : null;

    return NextResponse.json({
      fullName: profile.fullName,
      headline: profile.headline,
      avatarUrl: profile.avatarUrl,
      email: profile.email,
      linkedinUrl: profile.linkedinUrl,
      githubUrl: profile.githubUrl,
      portfolioUrl: profile.portfolioUrl,
      city: profile.city,
      state: profile.state,
      availability: profile.availability,
      bio: profile.bio,
      preferredRoles: profile.preferredRoles,
      targetSalaryMin: profile.targetSalaryMin,
      targetSalaryMax: profile.targetSalaryMax,
      currency: profile.currency,
      locationPreference: profile.locationPreference,
      showSkills: profile.showSkills,
      showResume: profile.showResume,
      showCertifications: profile.showCertifications,
      showCurrentRole: profile.showCurrentRole,
      skills,
      certifications,
      hasActiveResume,
      currentPosition,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST - recruiter submits contact info + job opportunity
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.recruiterName || !body.recruiterEmail || !body.jobTitle) {
      return NextResponse.json(
        { error: "Name, email, and job title are required" },
        { status: 400 }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.recruiterEmail)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    // Auto-create Contact
    const contact = await prisma.contact.create({
      data: {
        name: body.recruiterName,
        email: body.recruiterEmail,
        company: body.company || null,
        linkedinUrl: body.linkedinUrl || null,
        relationship: "recruiter",
        notes: `Auto-imported from recruiter portal submission`,
      },
    });

    // Auto-create Application
    const application = await prisma.jobApplication.create({
      data: {
        company: body.company || "Unknown Company",
        role: body.jobTitle,
        location: body.location || null,
        type: body.jobType || "remote",
        status: "wishlist",
        salaryMin: body.salaryMin || null,
        salaryMax: body.salaryMax || null,
        notes: `Submitted via recruiter portal by ${body.recruiterName}${body.message ? `\n\nMessage: ${body.message}` : ""}${body.jobDescription ? `\n\nJob Description: ${body.jobDescription}` : ""}`,
      },
    });

    // Create the submission record
    const submission = await prisma.recruiterSubmission.create({
      data: {
        recruiterName: body.recruiterName,
        recruiterEmail: body.recruiterEmail,
        company: body.company || null,
        linkedinUrl: body.linkedinUrl || null,
        jobTitle: body.jobTitle,
        jobDescription: body.jobDescription || null,
        salaryMin: body.salaryMin || null,
        salaryMax: body.salaryMax || null,
        location: body.location || null,
        jobType: body.jobType || null,
        message: body.message || null,
        status: "new",
        contactId: contact.id,
        applicationId: application.id,
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        entityType: "submission",
        entityId: submission.id,
        action: "created",
        description: `New recruiter submission from ${body.recruiterName} (${body.company || "N/A"}) for ${body.jobTitle}`,
      },
    });

    return NextResponse.json(
      { success: true, message: "Submission received successfully!" },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
