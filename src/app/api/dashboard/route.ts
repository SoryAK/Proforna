import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify user still exists (handles stale JWT after DB reset)
  const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!userExists) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    // Feature integrations
    learningItems,
    latestSnapshot,
    unreadArticleCount,
    recentArticles,
  ] = await Promise.all([
    prisma.jobApplication.count({ where: { userId } }),
    prisma.jobApplication.count({
      where: { userId, status: { notIn: ["rejected", "withdrawn", "accepted"] } },
    }),
    prisma.interview.count({ where: { userId } }),
    prisma.interview.count({
      where: { userId, scheduledAt: { gte: now }, status: "scheduled" },
    }),
    prisma.contact.count({ where: { userId } }),
    prisma.skill.count({ where: { userId } }),
    prisma.careerGoal.count({ where: { userId, status: { not: "abandoned" } } }),
    prisma.resumeVersion.count({ where: { userId } }),
    prisma.activityLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.jobApplication.groupBy({
      by: ["status"],
      where: { userId },
      _count: { status: true },
    }),
    prisma.currentPosition.findFirst({
      where: { userId, isActive: true },
      orderBy: { startDate: "desc" },
    }),
    prisma.recruiterSubmission.count({ where: { userId, status: "new" } }),
    prisma.userProfile.findFirst({ where: { userId } }),
    prisma.skill.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.certification.findMany({ where: { userId }, orderBy: { issueDate: "desc" }, take: 5 }),
    prisma.careerGoal.findMany({
      where: { userId, status: { not: "abandoned" } },
      include: { milestones: true },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    prisma.careerIncomeYear.findMany({ where: { userId }, orderBy: { year: "asc" } }),
    prisma.wageTier.findMany({ where: { userId }, orderBy: { sortOrder: "asc" } }),
    // Upcoming interviews with application details
    prisma.interview.findMany({
      where: { userId, scheduledAt: { gte: now }, status: "scheduled" },
      include: { jobApplication: { select: { company: true, role: true } } },
      orderBy: { scheduledAt: "asc" },
      take: 5,
    }),
    // Certifications expiring within 30 days or already expired
    prisma.certification.findMany({
      where: { userId, expiryDate: { not: null, lte: thirtyDaysFromNow } },
      orderBy: { expiryDate: "asc" },
      take: 5,
    }),
    // Learning items
    prisma.learningItem.findMany({ where: { userId } }),
    // Latest CDM snapshot with scores
    prisma.careerSnapshot.findFirst({
      where: { userId },
      orderBy: { capturedAt: "desc" },
      include: {
        scores: {
          include: { path: { select: { id: true, title: true } } },
        },
      },
    }),
    // Unread articles count
    prisma.researchArticle.count({ where: { isRead: false, feed: { userId } } }),
    // Recent unread articles for dashboard feed
    prisma.researchArticle.findMany({
      where: { isRead: false, feed: { userId } },
      orderBy: { publishedAt: "desc" },
      take: 6,
      select: {
        id: true,
        title: true,
        url: true,
        source: true,
        summary: true,
        publishedAt: true,
        imageUrl: true,
        feed: { select: { title: true, category: true } },
      },
    }),
  ]);

  const pipeline = statusCounts.map((s: { status: string; _count: { status: number } }) => ({
    status: s.status,
    count: s._count.status,
  }));

  // Compute learning summary
  const learningSummary = {
    total: learningItems.length,
    inProgress: learningItems.filter((l) => l.status === "in_progress").length,
    completed: learningItems.filter((l) => l.status === "completed").length,
    totalHours: learningItems.reduce((s, l) => s + l.hoursSpent, 0),
    recentItems: learningItems
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 3)
      .map((l) => ({
        id: l.id,
        title: l.title,
        status: l.status,
        progress: l.progress,
        provider: l.provider,
      })),
  };

  // CDM summary
  const cdmSummary = latestSnapshot
    ? {
        overallScore: latestSnapshot.overallScore,
        capturedAt: latestSnapshot.capturedAt,
        pathCount: latestSnapshot.scores.length,
        paths: latestSnapshot.scores.map((sc) => ({
          title: sc.path.title,
          score: sc.overallScore,
          skillMatch: sc.skillMatch,
        })),
      }
    : null;

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
    learningSummary,
    cdmSummary,
    unreadArticleCount,
    recentArticles,
  });
}
