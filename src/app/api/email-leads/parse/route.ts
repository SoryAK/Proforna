import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { parseJobEmail, dedupeHash } from "@/lib/email-parser";
import { cached, TTL } from "@/lib/cache";

/**
 * POST /api/email-leads/parse
 * Accepts raw email HTML body, parses job leads, geocodes, and stores them.
 * Body: { emailBody: string }
 * Returns: { leads: EmailLead[], parsed: number, stored: number, duplicates: number }
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const emailBody: string = body.emailBody ?? "";

  if (!emailBody || emailBody.length < 20) {
    return NextResponse.json(
      { error: "Provide emailBody (raw email HTML or text)" },
      { status: 400 },
    );
  }

  // Cap input size at 500KB to prevent abuse
  if (emailBody.length > 500_000) {
    return NextResponse.json(
      { error: "Email body too large (max 500KB)" },
      { status: 400 },
    );
  }

  // Parse the email
  const parsed = parseJobEmail(emailBody);
  if (parsed.length === 0) {
    return NextResponse.json({
      leads: [],
      parsed: 0,
      stored: 0,
      duplicates: 0,
      message: "No job leads found in this email. Try pasting the full email HTML source.",
    });
  }

  // Geocode unique locations
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
            return {
              lat: parseFloat(data[0].lat),
              lng: parseFloat(data[0].lon),
            };
          }
          return null;
        },
      );
      if (geo) geoResults[loc] = geo;
    } catch {
      // Skip failed geocodes
    }
  }

  // Store leads — upsert to handle dedup
  const expiresAt = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000); // 45-day TTL
  let stored = 0;
  let duplicates = 0;
  const storedLeads: Array<Record<string, unknown>> = [];

  for (const lead of parsed) {
    const hash = dedupeHash(lead.title, lead.company, lead.location);
    const geo = geoResults[lead.location];

    try {
      const result = await prisma.emailLead.upsert({
        where: {
          userId_dedupeHash: { userId, dedupeHash: hash },
        },
        update: {
          // Refresh expiry on re-import
          expiresAt,
          ...(lead.salaryMin != null ? { salaryMin: lead.salaryMin } : {}),
          ...(lead.salaryMax != null ? { salaryMax: lead.salaryMax } : {}),
          ...(lead.applyUrl ? { applyUrl: lead.applyUrl } : {}),
        },
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

      // Check if it was newly created vs updated (dedup)
      const isNew = result.createdAt.getTime() > Date.now() - 5000;
      if (isNew) {
        stored++;
      } else {
        duplicates++;
      }
      storedLeads.push(result as unknown as Record<string, unknown>);
    } catch {
      // Unique constraint violation or other — count as duplicate
      duplicates++;
    }
  }

  return NextResponse.json({
    leads: storedLeads,
    parsed: parsed.length,
    stored,
    duplicates,
  });
}
