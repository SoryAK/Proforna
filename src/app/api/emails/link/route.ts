import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// Common email provider domains that should NOT match company names
const GENERIC_DOMAINS = new Set([
  "gmail", "yahoo", "hotmail", "outlook", "aol", "icloud", "protonmail",
  "mail", "zoho", "yandex", "live", "msn", "comcast", "att", "verizon",
  "me", "fastmail", "hey",
]);

function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co|company|group|technologies|tech|software|solutions|consulting|services|global|international)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/** Extract the domain name (without TLD) from an email address */
function extractDomain(sender: string): string | null {
  // Handle "Name <email@domain.com>" or plain "email@domain.com"
  const emailMatch = sender.match(/<([^>]+)>/) || sender.match(/[\w.+-]+@[\w.-]+/);
  const email = emailMatch ? (emailMatch[1] || emailMatch[0]) : null;
  if (!email) return null;

  const atIdx = email.lastIndexOf("@");
  if (atIdx === -1) return null;

  const domain = email.slice(atIdx + 1).toLowerCase();
  // Get the main part (e.g., "google" from "google.com" or "mail.google.co.uk")
  const parts = domain.split(".");
  // For domains like "recruiting.google.com", pick the second-to-last meaningful part
  const mainPart = parts.length >= 3 ? parts[parts.length - 3] : parts[0];
  const fallback = parts[0];
  const domainName = GENERIC_DOMAINS.has(fallback) ? null : (parts.length >= 3 && !GENERIC_DOMAINS.has(mainPart) ? mainPart : fallback);
  
  if (!domainName || GENERIC_DOMAINS.has(domainName)) return null;
  return domainName;
}

// POST — auto-link unlinked emails to applications by matching company names
// in sender addresses, email domains, and subjects
export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const applications = await prisma.jobApplication.findMany({
    select: { id: true, company: true, role: true },
  });

  if (!applications.length) {
    return NextResponse.json({ linked: 0 });
  }

  // Build maps for matching
  const normalizedMap = new Map<string, string>();  // normalized company → app id
  const domainMap = new Map<string, string>();        // company domain-style key → app id

  for (const app of applications) {
    const key = normalizeCompany(app.company);
    if (key) {
      normalizedMap.set(key, app.id);
      domainMap.set(key, app.id);
    }
    // Also map common domain abbreviations (e.g., "JPMorgan Chase" → "jpmorgan")
    const firstWord = app.company.toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, "");
    if (firstWord && firstWord.length >= 3) {
      domainMap.set(firstWord, app.id);
    }
  }

  // Fetch all unlinked emails
  const unlinked = await prisma.email.findMany({
    where: { applicationId: null },
    select: { id: true, sender: true, subject: true },
  });

  let linked = 0;
  const updates: { id: string; applicationId: string }[] = [];

  for (const email of unlinked) {
    const haystack = `${email.sender ?? ""} ${email.subject ?? ""}`.toLowerCase();
    let matched = false;

    // Strategy 1: Match sender email domain against company names
    const senderDomain = extractDomain(email.sender ?? "");
    if (senderDomain) {
      const appId = domainMap.get(senderDomain);
      if (appId) {
        updates.push({ id: email.id, applicationId: appId });
        linked++;
        matched = true;
      }
    }

    if (matched) continue;

    // Strategy 2: Match normalized company name in sender+subject text
    for (const [key, appId] of normalizedMap) {
      const app = applications.find((a) => a.id === appId)!;
      if (
        haystack.includes(key) ||
        haystack.includes(app.company.toLowerCase())
      ) {
        updates.push({ id: email.id, applicationId: appId });
        linked++;
        matched = true;
        break;
      }
    }

    if (matched) continue;

    // Strategy 3: Match role/job title keywords in subject
    for (const app of applications) {
      if (!app.role) continue;
      const roleWords = app.role.toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
      const subject = (email.subject ?? "").toLowerCase();
      // Require at least 2 role keywords or the full role in the subject
      if (subject.includes(app.role.toLowerCase())) {
        updates.push({ id: email.id, applicationId: app.id });
        linked++;
        break;
      }
      if (roleWords.length >= 2) {
        const matchCount = roleWords.filter((w) => subject.includes(w)).length;
        if (matchCount >= 2) {
          updates.push({ id: email.id, applicationId: app.id });
          linked++;
          break;
        }
      }
    }
  }

  // Batch update
  for (const u of updates) {
    await prisma.email.update({
      where: { id: u.id },
      data: { applicationId: u.applicationId },
    });
  }

  return NextResponse.json({ linked });
}
