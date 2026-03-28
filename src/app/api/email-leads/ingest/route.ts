import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseJobEmail, dedupeHash } from "@/lib/email-parser";
import { cached, TTL } from "@/lib/cache";

/**
 * POST /api/email-leads/ingest
 *
 * Public webhook for email forwarding services (SendGrid Inbound Parse, Mailgun, etc.)
 * Auth: token query param `?token=<ingestToken>` — no session required
 *
 * Accepts:
 *  - JSON:          { html: string } or { text: string }
 *  - Form-encoded:  html=<body> (SendGrid Inbound Parse format)
 *
 * Also supports forwarding from email clients that send the email body directly.
 */
export async function POST(req: NextRequest) {
  // ── Auth via ingest token ──
  const token = req.nextUrl.searchParams.get("token");
  if (!token || token.length < 10) {
    return NextResponse.json({ error: "Missing or invalid token" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { ingestToken: token },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const userId = user.id;

  // ── Extract email body from various content types ──
  let emailBody = "";
  const ct = req.headers.get("content-type") ?? "";

  if (ct.includes("application/json")) {
    const body = await req.json();
    emailBody = body.html || body.text || body.emailBody || "";
  } else if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
    // SendGrid Inbound Parse posts form data with html/text fields
    const form = await req.formData();
    emailBody = (form.get("html") as string) || (form.get("text") as string) || "";
  } else {
    // Fallback: try raw text
    emailBody = await req.text();
  }

  if (!emailBody || emailBody.length < 20) {
    return NextResponse.json({ error: "No email body found" }, { status: 400 });
  }

  // Cap at 500KB
  if (emailBody.length > 500_000) {
    return NextResponse.json({ error: "Email body too large (max 500KB)" }, { status: 400 });
  }

  // ── Parse ──
  const parsed = parseJobEmail(emailBody);
  if (parsed.length === 0) {
    return NextResponse.json({ parsed: 0, stored: 0, duplicates: 0 });
  }

  // ── Geocode unique locations ──
  const uniqueLocs = [...new Set(parsed.map((l) => l.location).filter(Boolean))];
  const geoResults: Record<string, { lat: number; lng: number }> = {};

  for (const loc of uniqueLocs.slice(0, 30)) {
    try {
      const geo = await cached<{ lat: number; lng: number } | null>(
        `geo:${loc}`,
        TTL.GEOCODE,
        async () => {
          await new Promise((r) => setTimeout(r, 1100));
          const encoded = encodeURIComponent(loc);
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encoded}`,
            { headers: { "User-Agent": "Resumsify/1.0" } },
          );
          const data = await res.json();
          if (data.length > 0) {
            return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
          }
          return null;
        },
      );
      if (geo) geoResults[loc] = geo;
    } catch {
      // Skip failed geocodes
    }
  }

  // ── Store leads ──
  const expiresAt = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
  let stored = 0;
  let duplicates = 0;

  for (const lead of parsed) {
    const hash = dedupeHash(lead.title, lead.company, lead.location);
    const geo = geoResults[lead.location];

    try {
      const result = await prisma.emailLead.upsert({
        where: { userId_dedupeHash: { userId, dedupeHash: hash } },
        update: { expiresAt },
        create: {
          userId,
          title: lead.title,
          company: lead.company,
          location: lead.location,
          lat: geo?.lat ?? 0,
          lng: geo?.lng ?? 0,
          salaryMin: lead.salaryMin,
          salaryMax: lead.salaryMax,
          applyUrl: lead.applyUrl,
          source: lead.source,
          description: lead.description,
          dedupeHash: hash,
          expiresAt,
        },
      });

      const isNew = result.createdAt.getTime() > Date.now() - 5000;
      if (isNew) stored++;
      else duplicates++;
    } catch {
      duplicates++;
    }
  }

  return NextResponse.json({ parsed: parsed.length, stored, duplicates });
}
