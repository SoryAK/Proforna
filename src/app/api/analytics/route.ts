import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [applications, interviews] = await Promise.all([
    prisma.jobApplication.findMany({
      select: {
        id: true,
        company: true,
        role: true,
        status: true,
        type: true,
        salaryMin: true,
        salaryMax: true,
        appliedDate: true,
        createdAt: true,
        updatedAt: true,
        offerSalary: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.interview.findMany({
      select: {
        id: true,
        type: true,
        status: true,
        scheduledAt: true,
        jobApplicationId: true,
        rating: true,
      },
    }),
  ]);

  const total = applications.length;
  const statusCounts: Record<string, number> = {};
  const companyResponseMap: Record<string, { applied: number; responded: number }> = {};
  const roleResponseMap: Record<string, { applied: number; responded: number }> = {};
  const monthlyApplications: Record<string, number> = {};
  const salaryByRole: Record<string, { min: number[]; max: number[]; offers: number[] }> = {};
  const respondedStatuses = new Set(["screening", "interviewing", "offer", "accepted", "rejected"]);

  for (const app of applications) {
    // Status distribution
    statusCounts[app.status] = (statusCounts[app.status] || 0) + 1;

    // Response rate by company
    if (!companyResponseMap[app.company]) {
      companyResponseMap[app.company] = { applied: 0, responded: 0 };
    }
    companyResponseMap[app.company].applied++;
    if (respondedStatuses.has(app.status)) {
      companyResponseMap[app.company].responded++;
    }

    // Response rate by role keyword (first word of role)
    const roleKey = app.role.split(/\s+/).slice(0, 2).join(" ");
    if (!roleResponseMap[roleKey]) {
      roleResponseMap[roleKey] = { applied: 0, responded: 0 };
    }
    roleResponseMap[roleKey].applied++;
    if (respondedStatuses.has(app.status)) {
      roleResponseMap[roleKey].responded++;
    }

    // Monthly applications
    const dateKey = (app.appliedDate || app.createdAt)
      ? new Date(app.appliedDate || app.createdAt).toISOString().slice(0, 7)
      : "unknown";
    if (dateKey !== "unknown") {
      monthlyApplications[dateKey] = (monthlyApplications[dateKey] || 0) + 1;
    }

    // Salary data by role type
    const salaryRole = app.type; // remote, hybrid, onsite
    if (!salaryByRole[salaryRole]) {
      salaryByRole[salaryRole] = { min: [], max: [], offers: [] };
    }
    if (app.salaryMin) salaryByRole[salaryRole].min.push(app.salaryMin);
    if (app.salaryMax) salaryByRole[salaryRole].max.push(app.salaryMax);
    if (app.offerSalary) salaryByRole[salaryRole].offers.push(app.offerSalary);
  }

  // Pipeline stage timing (days between stages based on activity logs)
  // Approximate using: applied → interview → offer timing
  const pipelineStages: Record<string, number[]> = {
    "Applied → Interview": [],
    "Interview → Offer": [],
    "Applied → Offer": [],
  };

  for (const app of applications) {
    const appInterviews = interviews.filter(
      (iv) => iv.jobApplicationId === app.id
    );
    const appliedDate = app.appliedDate
      ? new Date(app.appliedDate)
      : new Date(app.createdAt);

    if (appInterviews.length > 0) {
      const firstInterview = appInterviews.sort(
        (a, b) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      )[0];
      const days = Math.max(
        0,
        (new Date(firstInterview.scheduledAt).getTime() - appliedDate.getTime()) /
          (1000 * 60 * 60 * 24)
      );
      pipelineStages["Applied → Interview"].push(Math.round(days));
    }

    if (["offer", "accepted"].includes(app.status) && appInterviews.length > 0) {
      const lastInterview = appInterviews.sort(
        (a, b) =>
          new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
      )[0];
      const daysToOffer = Math.max(
        0,
        (new Date(app.updatedAt).getTime() -
          new Date(lastInterview.scheduledAt).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      pipelineStages["Interview → Offer"].push(Math.round(daysToOffer));

      const totalDays = Math.max(
        0,
        (new Date(app.updatedAt).getTime() - appliedDate.getTime()) /
          (1000 * 60 * 60 * 24)
      );
      pipelineStages["Applied → Offer"].push(Math.round(totalDays));
    }
  }

  // Calculate averages
  function avg(arr: number[]) {
    return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  }

  // Top companies by # applications
  const companyResponse = Object.entries(companyResponseMap)
    .sort((a, b) => b[1].applied - a[1].applied)
    .slice(0, 15)
    .map(([company, data]) => ({
      company,
      applied: data.applied,
      responded: data.responded,
      rate: data.applied > 0 ? Math.round((data.responded / data.applied) * 100) : 0,
    }));

  // Top roles by # applications
  const roleResponse = Object.entries(roleResponseMap)
    .sort((a, b) => b[1].applied - a[1].applied)
    .slice(0, 15)
    .map(([role, data]) => ({
      role,
      applied: data.applied,
      responded: data.responded,
      rate: data.applied > 0 ? Math.round((data.responded / data.applied) * 100) : 0,
    }));

  // Offer ratio
  const offers = applications.filter((a) =>
    ["offer", "accepted"].includes(a.status)
  ).length;
  const applied = applications.filter((a) => a.status !== "wishlist").length;
  const offerRate = applied > 0 ? Math.round((offers / applied) * 100) : 0;

  // Interview stats
  const totalInterviews = interviews.length;
  const completedInterviews = interviews.filter(
    (iv) => iv.status === "completed"
  ).length;
  const avgRating =
    interviews.filter((iv) => iv.rating).length > 0
      ? (
          interviews
            .filter((iv) => iv.rating)
            .reduce((sum, iv) => sum + iv.rating!, 0) /
          interviews.filter((iv) => iv.rating).length
        ).toFixed(1)
      : null;

  // Salary summary by type
  const salaryTrends = Object.entries(salaryByRole).map(([type, data]) => ({
    type,
    avgMin: avg(data.min),
    avgMax: avg(data.max),
    avgOffer: avg(data.offers),
    count: data.min.length + data.max.length,
  }));

  // Monthly timeline
  const timeline = Object.entries(monthlyApplications)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));

  // Pipeline avg days
  const pipelineAvg = Object.entries(pipelineStages).map(([stage, days]) => ({
    stage,
    avgDays: avg(days),
    count: days.length,
  }));

  return NextResponse.json({
    total,
    applied,
    offers,
    offerRate,
    totalInterviews,
    completedInterviews,
    avgRating,
    statusCounts,
    companyResponse,
    roleResponse,
    salaryTrends,
    timeline,
    pipelineAvg,
  });
}
