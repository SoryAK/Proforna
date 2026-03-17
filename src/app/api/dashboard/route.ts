import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [
    totalApplications,
    activeApplications,
    interviews,
    upcomingInterviews,
    contacts,
    skillCount,
    goals,
    resumes,
    recentActivity,
    statusCounts,
    currentPosition,
    newSubmissions,
    profile,
    topSkills,
    certifications,
    activeGoals,
    incomeYears,
    wageTiers,
    upcomingInterviewDetails,
    expiringCertifications,
  ] = await Promise.all([
    prisma.jobApplication.count(),
    prisma.jobApplication.count({
      where: { status: { notIn: ["rejected", "withdrawn", "accepted"] } },
    }),
    prisma.interview.count(),
    prisma.interview.count({
      where: { scheduledAt: { gte: now }, status: "scheduled" },
    }),
    prisma.contact.count(),
    prisma.skill.count(),
    prisma.careerGoal.count({ where: { status: { not: "abandoned" } } }),
    prisma.resumeVersion.count(),
    prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.jobApplication.groupBy({
      by: ["status"],
      _count: { status: true },
    }),
    prisma.currentPosition.findFirst({
      where: { isActive: true },
      orderBy: { startDate: "desc" },
    }),
    prisma.recruiterSubmission.count({ where: { status: "new" } }),
    prisma.userProfile.findFirst(),
    prisma.skill.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.certification.findMany({ orderBy: { issueDate: "desc" }, take: 5 }),
    prisma.careerGoal.findMany({
      where: { status: { not: "abandoned" } },
      include: { milestones: true },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    prisma.careerIncomeYear.findMany({ orderBy: { year: "asc" } }),
    prisma.wageTier.findMany({ orderBy: { sortOrder: "asc" } }),
    // Upcoming interviews with application details
    prisma.interview.findMany({
      where: { scheduledAt: { gte: now }, status: "scheduled" },
      include: { jobApplication: { select: { company: true, role: true } } },
      orderBy: { scheduledAt: "asc" },
      take: 5,
    }),
    // Certifications expiring within 30 days or already expired
    prisma.certification.findMany({
      where: { expiryDate: { not: null, lte: thirtyDaysFromNow } },
      orderBy: { expiryDate: "asc" },
      take: 5,
    }),
  ]);

  const pipeline = statusCounts.map((s: { status: string; _count: { status: number } }) => ({
    status: s.status,
    count: s._count.status,
  }));

  return NextResponse.json({
    stats: {
      totalApplications,
      activeApplications,
      interviews,
      upcomingInterviews,
      contacts,
      skills: skillCount,
      goals,
      resumes,
      newSubmissions,
    },
    pipeline,
    recentActivity,
    currentPosition,
    profile,
    topSkills,
    certifications,
    activeGoals,
    cfm: { incomeYears, wageTiers },
    upcomingInterviewDetails,
    expiringCertifications,
  });
}
