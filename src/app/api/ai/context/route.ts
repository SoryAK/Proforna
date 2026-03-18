import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/ai/context
 *
 * Gathers the user's career data and returns a system prompt
 * that gives the AI full context about the user's situation.
 */
export async function GET() {
  const [
    profile,
    position,
    applications,
    skills,
    goals,
    certifications,
    interviews,
  ] = await Promise.all([
    prisma.userProfile.findFirst(),
    prisma.currentPosition.findFirst({ where: { isActive: true } }),
    prisma.jobApplication.findMany({
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        company: true,
        role: true,
        status: true,
        appliedDate: true,
      },
    }),
    prisma.skill.findMany({ take: 30, orderBy: { proficiency: "desc" } }),
    prisma.careerGoal.findMany({
      where: { status: { not: "completed" } },
      take: 10,
    }),
    prisma.certification.findMany({ take: 10 }),
    prisma.interview.findMany({
      where: { scheduledAt: { gte: new Date() } },
      take: 5,
      include: { jobApplication: { select: { company: true, role: true } } },
    }),
  ]);

  const parts: string[] = [];

  parts.push(
    "You are Resumsify AI, a career assistant embedded in the user's personal career management app. " +
    "You have access to the user's real career data shown below. Use it to give personalized, actionable advice. " +
    "Be concise, helpful, and direct. Format responses with markdown when helpful. " +
    "Focus on career development, job search strategy, interview prep, salary negotiation, and skill growth."
  );

  if (profile) {
    const lines = [`\n## User Profile`];
    if (profile.fullName) lines.push(`- Name: ${profile.fullName}`);
    if (profile.headline) lines.push(`- Headline: ${profile.headline}`);
    if (profile.city || profile.state) lines.push(`- Location: ${[profile.city, profile.state].filter(Boolean).join(", ")}`);
    if (profile.availability) lines.push(`- Availability: ${profile.availability.replace(/_/g, " ")}`);
    if (profile.preferredRoles) lines.push(`- Preferred Roles: ${profile.preferredRoles}`);
    if (profile.targetSalaryMin || profile.targetSalaryMax) {
      lines.push(`- Target Salary: ${profile.currency} ${profile.targetSalaryMin?.toLocaleString() ?? "?"} – ${profile.targetSalaryMax?.toLocaleString() ?? "?"}`);
    }
    if (profile.bio) lines.push(`- Bio: ${profile.bio}`);
    parts.push(lines.join("\n"));
  }

  if (position) {
    const lines = [`\n## Current Position`];
    lines.push(`- Role: ${position.role} at ${position.company}`);
    if (position.department) lines.push(`- Department: ${position.department}`);
    if (position.location) lines.push(`- Location: ${position.location}`);
    lines.push(`- Type: ${position.type}`);
    lines.push(`- Start Date: ${position.startDate.toISOString().split("T")[0]}`);
    if (position.salary) lines.push(`- Salary: ${position.currency} ${position.salary.toLocaleString()}`);
    if (position.payType && position.payRate) lines.push(`- Pay: ${position.payType} @ $${position.payRate}/hr, ${position.payFrequency}`);
    if (position.techStack) lines.push(`- Tech Stack: ${position.techStack}`);
    parts.push(lines.join("\n"));
  }

  if (skills.length > 0) {
    const grouped: Record<string, string[]> = {};
    for (const s of skills) {
      const cat = s.category || "other";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(`${s.name} (${s.proficiency})`);
    }
    const lines = [`\n## Skills`];
    for (const [cat, items] of Object.entries(grouped)) {
      lines.push(`- ${cat}: ${items.join(", ")}`);
    }
    parts.push(lines.join("\n"));
  }

  if (applications.length > 0) {
    const byStatus: Record<string, number> = {};
    for (const a of applications) {
      byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
    }
    const lines = [`\n## Job Search (${applications.length} recent applications)`];
    lines.push(`- Pipeline: ${Object.entries(byStatus).map(([s, c]) => `${s}: ${c}`).join(", ")}`);
    const recent = applications.slice(0, 5);
    lines.push(`- Recent: ${recent.map((a) => `${a.role} @ ${a.company} (${a.status})`).join("; ")}`);
    parts.push(lines.join("\n"));
  }

  if (goals.length > 0) {
    const lines = [`\n## Active Goals`];
    for (const g of goals) {
      lines.push(`- ${g.title} (${g.priority} priority, ${g.status})${g.targetDate ? ` — due ${g.targetDate.toISOString().split("T")[0]}` : ""}`);
    }
    parts.push(lines.join("\n"));
  }

  if (certifications.length > 0) {
    const lines = [`\n## Certifications`];
    for (const c of certifications) {
      const expiry = c.expiryDate ? ` (expires ${c.expiryDate.toISOString().split("T")[0]})` : "";
      lines.push(`- ${c.name} — ${c.issuer}${expiry}`);
    }
    parts.push(lines.join("\n"));
  }

  if (interviews.length > 0) {
    const lines = [`\n## Upcoming Interviews`];
    for (const i of interviews) {
      lines.push(`- ${i.type} for ${i.jobApplication.role} @ ${i.jobApplication.company} on ${i.scheduledAt.toISOString().split("T")[0]}`);
    }
    parts.push(lines.join("\n"));
  }

  const systemPrompt = parts.join("\n");

  return NextResponse.json({ systemPrompt });
}
