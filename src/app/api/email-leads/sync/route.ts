import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { google } from "googleapis";
import { getValidGoogleToken } from "@/lib/email";
import { parseJobEmail, dedupeHash } from "@/lib/email-parser";
import { cached, TTL } from "@/lib/cache";
import { getUserId } from "@/lib/auth-utils";

/**
 * POST /api/email-leads/sync
 *
 * Pull-based Gmail sync: uses the user's connected Google account to
 * search for job alert emails, extract HTML bodies, parse them through
 * the email-parser, geocode locations, and store as EmailLead records.
 *
 * No public URL / webhook / tunnel required — the server calls Gmail directly.
 */

const JOB_ALERT_SENDERS = [
  "indeed.com",
  "linkedin.com",
  "glassdoor.com",
  "ziprecruiter.com",
  "dice.com",
];

export async function POST() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find user's connected Google email account
  const account = await prisma.emailAccount.findFirst({
    where: { userId, provider: "google" },
  });
  if (!account) {
    return NextResponse.json(
      { error: "No Gmail account connected. Go to Email to connect one." },
      { status: 400 },
    );
  }

  // Get authenticated Gmail client
  const { client, newAccessToken, newExpiry } = await getValidGoogleToken(account);

  if (newAccessToken) {
    await prisma.emailAccount.update({
      where: { id: account.id },
      data: {
        accessToken: newAccessToken,
        ...(newExpiry ? { tokenExpiry: newExpiry } : {}),
      },
    });
  }

  const gmail = google.gmail({ version: "v1", auth: client });

  // Build search query for job alert emails from the last 7 days
  const senderQuery = JOB_ALERT_SENDERS.map((s) => `from:${s}`).join(" OR ");
  const query = `(${senderQuery}) newer_than:7d`;

  // Fetch matching message IDs (up to 50)
  const list = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 50,
  });

  const messageIds = (list.data.messages ?? []).map((m) => m.id!);
  if (!messageIds.length) {
    return NextResponse.json({ parsed: 0, stored: 0, duplicates: 0, emails: 0 });
  }

  // Fetch full messages in batches of 10
  let totalParsed = 0;
  let totalStored = 0;
  let totalDuplicates = 0;
  const expiresAt = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);

  for (let i = 0; i < messageIds.length; i += 10) {
    const batch = messageIds.slice(i, i + 10);
    const results = await Promise.all(
      batch.map((mid) =>
        gmail.users.messages.get({ userId: "me", id: mid, format: "full" }),
      ),
    );

    for (const r of results) {
      const msg = r.data;
      const htmlBody = extractHtmlBody(msg.payload);
      if (!htmlBody || htmlBody.length < 50) continue;

      // Parse job leads from this email's HTML
      const leads = parseJobEmail(htmlBody);
      if (leads.length === 0) continue;

      totalParsed += leads.length;

      // Geocode unique locations from this batch
      const uniqueLocs = [...new Set(leads.map((l) => l.location).filter(Boolean))];
      const geoResults: Record<string, { lat: number; lng: number }> = {};

      for (const loc of uniqueLocs.slice(0, 30)) {
        try {
          const geo = await cached<{ lat: number; lng: number } | null>(
            `geo:${loc}`,
            TTL.GEOCODE,
            async () => {
              await new Promise((resolve) => setTimeout(resolve, 1100));
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
          // skip failed geocodes
        }
      }

      // Store leads
      for (const lead of leads) {
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
          if (isNew) totalStored++;
          else totalDuplicates++;
        } catch {
          totalDuplicates++;
        }
      }
    }
  }

  return NextResponse.json({
    parsed: totalParsed,
    stored: totalStored,
    duplicates: totalDuplicates,
    emails: messageIds.length,
  });
}

/**
 * Extract the HTML body from a Gmail message payload.
 * Handles both single-part and multipart messages.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractHtmlBody(payload: any): string | null {
  if (!payload) return null;

  // Single-part message with HTML
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  // Multipart — recurse into parts
  if (payload.parts) {
    // Prefer text/html
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return Buffer.from(part.body.data, "base64url").toString("utf-8");
      }
    }
    // Recurse into nested multipart
    for (const part of payload.parts) {
      if (part.mimeType?.startsWith("multipart/")) {
        const nested = extractHtmlBody(part);
        if (nested) return nested;
      }
    }
  }

  return null;
}
