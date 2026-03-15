import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const [
    totalApplications,
    activeApplications,
    interviews,
    upcomingInterviews,
    contacts,
    skills,
    goals,
    recentActivity,
    statusCounts,
    currentPosition,
    newSubmissions,
  ] = await Promise.all([
    prisma.jobApplication.count(),
    prisma.jobApplication.count({
      where: { status: { notIn: ["rejected", "withdrawn", "accepted"] } },
    }),
    prisma.interview.count(),
    prisma.interview.count({
      where: { scheduledAt: { gte: new Date() }, status: "scheduled" },
    }),
    prisma.contact.count(),
    prisma.skill.count(),
    prisma.careerGoal.count({ where: { status: { not: "abandoned" } } }),
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
      skills,
      goals,
      newSubmissions,
    },
    pipeline,
    recentActivity,
    currentPosition,
  });
}
