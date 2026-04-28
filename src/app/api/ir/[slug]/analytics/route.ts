import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

/**
 * GET /api/ir/[slug]/analytics
 *
 * Returns aggregated engagement analytics for an IR slug.
 * Only the IR owner can see this — verified via UserProfile.userId
 * (or via legacy InteractiveResume.userId for old slugs).
 *
 * Response:
 *   {
 *     totals: { sessions, events, byType: {type: count} },
 *     byDay:  [{ date, sessions, events }],
 *     viewers: [{ sessionId, firstSeen, lastSeen, eventCount,
 *                 referrer, accessRequestId, topEvents: {type: count} }]
 *   }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;

  // Ownership check: profile-driven IR or legacy IR
  const profile = await prisma.userProfile.findUnique({
    where: { irSlug: slug },
    select: { userId: true },
  });
  let ownerId = profile?.userId ?? null;
  if (!ownerId) {
    const legacy = await prisma.interactiveResume.findUnique({
      where: { slug },
      select: { userId: true },
    });
    ownerId = legacy?.userId ?? null;
  }
  if (!ownerId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ownerId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Pull last 5000 events (90-day window)
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const events = await prisma.irViewEvent.findMany({
    where: { irSlug: slug, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const totalsByType: Record<string, number> = {};
  const sessions = new Map<
    string,
    {
      sessionId: string;
      firstSeen: Date;
      lastSeen: Date;
      eventCount: number;
      referrer: string | null;
      accessRequestId: string | null;
      eventTypes: Record<string, number>;
    }
  >();
  const byDay = new Map<string, { sessions: Set<string>; events: number }>();

  // Per-workItem role-engagement counts (role_click + education_click)
  const roleClicks = new Map<string, { clicks: number; viewers: Set<string>; label: string | null; kind: "role" | "education" }>();
  // Contact method tap counts
  const contactMethods = new Map<string, number>();
  // Funnel: sessions that reached each step
  const funnelSessions = {
    view: new Set<string>(),
    role_click: new Set<string>(),
    contact_open: new Set<string>(),
    contact_method_click: new Set<string>(),
  };

  for (const e of events) {
    totalsByType[e.eventType] = (totalsByType[e.eventType] || 0) + 1;

    const day = e.createdAt.toISOString().slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, { sessions: new Set(), events: 0 });
    const dBucket = byDay.get(day)!;
    dBucket.sessions.add(e.sessionId);
    dBucket.events += 1;

    // Funnel — track which sessions reached which step
    if (e.eventType in funnelSessions) {
      funnelSessions[e.eventType as keyof typeof funnelSessions].add(e.sessionId);
    }

    // Per-role engagement
    if (e.eventType === "role_click" || e.eventType === "education_click") {
      let workItemId: string | null = null;
      let label: string | null = null;
      if (e.eventData) {
        try {
          const parsed = JSON.parse(e.eventData) as { workItemId?: unknown; label?: unknown };
          if (typeof parsed.workItemId === "string") workItemId = parsed.workItemId;
          if (typeof parsed.label === "string") label = parsed.label;
        } catch {
          /* ignore malformed */
        }
      }
      if (workItemId) {
        if (!roleClicks.has(workItemId)) {
          roleClicks.set(workItemId, {
            clicks: 0,
            viewers: new Set(),
            label,
            kind: e.eventType === "education_click" ? "education" : "role",
          });
        }
        const r = roleClicks.get(workItemId)!;
        r.clicks += 1;
        r.viewers.add(e.sessionId);
        if (!r.label && label) r.label = label;
      }
    }

    // Contact method breakdown
    if (e.eventType === "contact_method_click" && e.eventData) {
      try {
        const parsed = JSON.parse(e.eventData) as { method?: unknown };
        if (typeof parsed.method === "string") {
          contactMethods.set(parsed.method, (contactMethods.get(parsed.method) || 0) + 1);
        }
      } catch {
        /* ignore */
      }
    }

    const sess = sessions.get(e.sessionId);
    if (!sess) {
      sessions.set(e.sessionId, {
        sessionId: e.sessionId,
        firstSeen: e.createdAt,
        lastSeen: e.createdAt,
        eventCount: 1,
        referrer: e.referrer,
        accessRequestId: e.accessRequestId,
        eventTypes: { [e.eventType]: 1 },
      });
    } else {
      sess.eventCount += 1;
      if (e.createdAt < sess.firstSeen) sess.firstSeen = e.createdAt;
      if (e.createdAt > sess.lastSeen) sess.lastSeen = e.createdAt;
      sess.eventTypes[e.eventType] = (sess.eventTypes[e.eventType] || 0) + 1;
      if (!sess.referrer && e.referrer) sess.referrer = e.referrer;
      if (!sess.accessRequestId && e.accessRequestId) sess.accessRequestId = e.accessRequestId;
    }
  }

  const viewers = [...sessions.values()]
    .sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())
    .slice(0, 50)
    .map((s) => ({
      sessionId: s.sessionId,
      firstSeen: s.firstSeen.toISOString(),
      lastSeen: s.lastSeen.toISOString(),
      eventCount: s.eventCount,
      durationSec: Math.max(0, Math.round((s.lastSeen.getTime() - s.firstSeen.getTime()) / 1000)),
      referrer: s.referrer,
      accessRequestId: s.accessRequestId,
      topEvents: s.eventTypes,
    }));

  const topRoles = [...roleClicks.entries()]
    .map(([workItemId, r]) => ({
      workItemId,
      kind: r.kind,
      label: r.label,
      clicks: r.clicks,
      uniqueSessions: r.viewers.size,
    }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10);

  const viewerCount = funnelSessions.view.size || sessions.size;
  const contactOpens = funnelSessions.contact_open.size;
  const contactClicks = funnelSessions.contact_method_click.size;
  const funnel = {
    viewers: viewerCount,
    roleEngaged: funnelSessions.role_click.size,
    contactOpens,
    contactClicks,
    contactOpenRate: viewerCount > 0 ? contactOpens / viewerCount : 0,
    contactClickRate: contactOpens > 0 ? contactClicks / contactOpens : 0,
  };

  const contactMethodBreakdown = [...contactMethods.entries()]
    .map(([method, count]) => ({ method, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    totals: {
      sessions: sessions.size,
      events: events.length,
      byType: totalsByType,
    },
    byDay: [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, b]) => ({ date, sessions: b.sessions.size, events: b.events })),
    viewers,
    topRoles,
    funnel,
    contactMethods: contactMethodBreakdown,
  });
}
