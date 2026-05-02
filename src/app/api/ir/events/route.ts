import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

/**
 * IR engagement-events ingest endpoint.
 *
 * Accepts a batch of events from the public Interactive Resume page (/r/<slug>),
 * persists them as IrViewEvent rows, and (re)issues a long-lived anonymous
 * `ir_viewer_session` cookie so we can correlate events from the same viewer
 * across visits.
 *
 * Body: { irSlug, accessRequestId?, events: [{ eventType, eventData?, ts? }] }
 *
 * Rate-limit: a single in-memory token bucket per (sessionId|ip) at 60 events/min.
 */

const SESSION_COOKIE = "ir_viewer_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year
const MAX_EVENTS_PER_REQUEST = 50;
const RATE_LIMIT_PER_MINUTE = 60;

const ALLOWED_EVENT_TYPES = new Set([
  "view",
  "role_click",
  "contact_open",
  "contact_method_click",
  "education_click",
  "journey_play",
  "comp_view",
  "annot_view",
  "tour_complete",
  "session_heartbeat",
]);

type EventInput = {
  eventType?: string;
  eventData?: unknown;
};

const buckets = new Map<string, { count: number; windowStart: number }>();
function rateLimited(key: string, n: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > 60_000) {
    buckets.set(key, { count: n, windowStart: now });
    return false;
  }
  bucket.count += n;
  return bucket.count > RATE_LIMIT_PER_MINUTE;
}

export async function POST(req: NextRequest) {
  let body: {
    irSlug?: string;
    accessRequestId?: string | null;
    events?: EventInput[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const irSlug = typeof body.irSlug === "string" ? body.irSlug.trim() : "";
  const events = Array.isArray(body.events) ? body.events : [];

  if (!irSlug || events.length === 0) {
    return NextResponse.json({ error: "Missing irSlug or events" }, { status: 400 });
  }
  if (events.length > MAX_EVENTS_PER_REQUEST) {
    return NextResponse.json({ error: "Too many events" }, { status: 413 });
  }

  // Verify slug exists (guard against analytics spam to bogus slugs)
  const profile = await prisma.userProfile.findUnique({
    where: { irSlug },
    select: { id: true },
  });
  if (!profile) {
    const legacy = await prisma.interactiveResume.findUnique({
      where: { slug: irSlug },
      select: { id: true },
    });
    if (!legacy) {
      return NextResponse.json({ error: "Unknown slug" }, { status: 404 });
    }
  }

  // Resolve / mint session id from cookie
  const existingSession = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionId =
    existingSession && /^[a-f0-9-]{20,40}$/i.test(existingSession)
      ? existingSession
      : randomUUID();

  // Rate limiting
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "anon";
  if (rateLimited(`${sessionId}|${ip}`, events.length)) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const referrer = req.headers.get("referer") || null;
  const userAgent = req.headers.get("user-agent") || null;
  const accessRequestId =
    typeof body.accessRequestId === "string" && body.accessRequestId.length > 0
      ? body.accessRequestId
      : null;

  const rows = events
    .filter((e) => typeof e?.eventType === "string" && ALLOWED_EVENT_TYPES.has(e.eventType))
    .map((e) => ({
      irSlug,
      sessionId,
      accessRequestId,
      eventType: e.eventType as string,
      eventData:
        e.eventData !== undefined && e.eventData !== null
          ? JSON.stringify(e.eventData).slice(0, 2000)
          : null,
      referrer: referrer ? referrer.slice(0, 500) : null,
      userAgent: userAgent ? userAgent.slice(0, 500) : null,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, accepted: 0 });
  }

  await prisma.irViewEvent.createMany({ data: rows });

  const res = NextResponse.json({ ok: true, accepted: rows.length });

  // (Re)issue cookie so it stays fresh
  res.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return res;
}
