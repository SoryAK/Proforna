import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const views = await prisma.resumeView.findMany({
    where: { resumeId: id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const totalViews = await prisma.resumeView.count({ where: { resumeId: id } });

  // Aggregate views by day for chart
  const byDay = views.reduce<Record<string, number>>((acc, v) => {
    const day = v.createdAt.toISOString().slice(0, 10);
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {});

  // Top referrers
  const referrerCounts = views.reduce<Record<string, number>>((acc, v) => {
    const ref = v.referrer || "direct";
    acc[ref] = (acc[ref] || 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    totalViews,
    viewsByDay: Object.entries(byDay).map(([date, count]) => ({ date, count })),
    topReferrers: Object.entries(referrerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([referrer, count]) => ({ referrer, count })),
    recentViews: views.slice(0, 20),
  });
}
