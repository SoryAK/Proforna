import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";

interface ImportPayload {
  applications?: Record<string, unknown>[];
  contacts?: Record<string, unknown>[];
  skills?: Record<string, unknown>[];
  goals?: Record<string, unknown>[];
  certifications?: Record<string, unknown>[];
}

function parseDate(val: unknown): Date | undefined {
  if (!val) return undefined;
  const d = new Date(val as string);
  return isNaN(d.getTime()) ? undefined : d;
}

function parseNum(val: unknown): number | undefined {
  if (val === null || val === undefined || val === "") return undefined;
  const n = Number(val);
  return isNaN(n) ? undefined : n;
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") || "json";

  try {
    if (format === "json") {
      return await importJson(req);
    } else if (format === "csv") {
      return await importCsv(req);
    }
    return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function importJson(req: NextRequest) {
  const body: ImportPayload = await req.json();
  const results: Record<string, number> = {};

  if (body.applications?.length) {
    for (const a of body.applications) {
      const app = await prisma.jobApplication.create({
        data: {
          company: String(a.company || ""),
          role: String(a.role || ""),
          url: a.url ? String(a.url) : null,
          location: a.location ? String(a.location) : null,
          type: String(a.type || "remote"),
          status: String(a.status || "wishlist"),
          salaryMin: parseNum(a.salaryMin),
          salaryMax: parseNum(a.salaryMax),
          currency: String(a.currency || "USD"),
          appliedDate: parseDate(a.appliedDate),
          notes: a.notes ? String(a.notes) : null,
        },
      });
      await logActivity("application", app.id, "created", `Imported application: ${app.company} - ${app.role}`);
    }
    results.applications = body.applications.length;
  }

  if (body.contacts?.length) {
    for (const c of body.contacts) {
      await prisma.contact.create({
        data: {
          name: String(c.name || ""),
          email: c.email ? String(c.email) : null,
          phone: c.phone ? String(c.phone) : null,
          company: c.company ? String(c.company) : null,
          role: c.role ? String(c.role) : null,
          linkedinUrl: c.linkedinUrl ? String(c.linkedinUrl) : null,
          relationship: String(c.relationship || "other"),
          notes: c.notes ? String(c.notes) : null,
          lastContactedAt: parseDate(c.lastContactedAt),
        },
      });
    }
    results.contacts = body.contacts.length;
  }

  if (body.skills?.length) {
    for (const s of body.skills) {
      await prisma.skill.create({
        data: {
          name: String(s.name || ""),
          category: String(s.category || "technical"),
          proficiency: String(s.proficiency || "intermediate"),
        },
      });
    }
    results.skills = body.skills.length;
  }

  if (body.goals?.length) {
    for (const g of body.goals) {
      await prisma.careerGoal.create({
        data: {
          title: String(g.title || ""),
          description: g.description ? String(g.description) : null,
          targetDate: parseDate(g.targetDate),
          status: String(g.status || "not_started"),
          priority: String(g.priority || "medium"),
        },
      });
    }
    results.goals = body.goals.length;
  }

  if (body.certifications?.length) {
    for (const c of body.certifications) {
      await prisma.certification.create({
        data: {
          name: String(c.name || ""),
          issuer: String(c.issuer || ""),
          issueDate: parseDate(c.issueDate) || new Date(),
          expiryDate: parseDate(c.expiryDate),
          credentialUrl: c.credentialUrl ? String(c.credentialUrl) : null,
        },
      });
    }
    results.certifications = body.certifications.length;
  }

  return NextResponse.json({ imported: results });
}

async function importCsv(req: NextRequest) {
  const text = await req.text();
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return NextResponse.json({ error: "CSV must have header + data rows" }, { status: 400 });

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  let imported = 0;

  // Auto-detect type by headers
  if (headers.includes("company") && headers.includes("role") && headers.includes("status")) {
    // Applications CSV
    for (let i = 1; i < lines.length; i++) {
      const vals = parseCsvLine(lines[i]);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => (row[h] = vals[idx]?.trim() || ""));

      const app = await prisma.jobApplication.create({
        data: {
          company: row.company || "",
          role: row.role || "",
          status: row.status || "wishlist",
          type: row.type || "remote",
          location: row.location || null,
          salaryMin: parseNum(row["salary min"]),
          salaryMax: parseNum(row["salary max"]),
          currency: row.currency || "USD",
          appliedDate: parseDate(row["applied date"]),
          url: row.url || null,
          notes: row.notes || null,
        },
      });
      await logActivity("application", app.id, "created", `CSV import: ${app.company} - ${app.role}`);
      imported++;
    }
    return NextResponse.json({ imported: { applications: imported } });
  }

  if (headers.includes("name") && headers.includes("email") && headers.includes("relationship")) {
    // Contacts CSV
    for (let i = 1; i < lines.length; i++) {
      const vals = parseCsvLine(lines[i]);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => (row[h] = vals[idx]?.trim() || ""));

      await prisma.contact.create({
        data: {
          name: row.name || "",
          email: row.email || null,
          phone: row.phone || null,
          company: row.company || null,
          role: row.role || null,
          relationship: row.relationship || "other",
          linkedinUrl: row.linkedin || row.linkedinurl || null,
          notes: row.notes || null,
        },
      });
      imported++;
    }
    return NextResponse.json({ imported: { contacts: imported } });
  }

  return NextResponse.json({ error: "Unrecognized CSV format. Supported: applications (company,role,status), contacts (name,email,relationship)" }, { status: 400 });
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}
