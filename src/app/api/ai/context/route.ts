import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

/**
 * One context block sent to the AI as part of its system prompt.
 *
 * Slices were introduced by ADR-0046 Phase A so the chat panel can show the
 * user what context the AI is consuming and let them remove individual slices
 * on a per-thread basis. Each removable slice maps to a chip in the chat UI;
 * the user can click the chip's X to suppress that slice for the next send.
 */
export interface AIContextSlice {
  /** Stable identifier; kept short and kebab-cased for chip rendering. */
  id: string;
  /** Human-readable label shown on the chip. */
  label: string;
  /** Markdown body for this slice (the text the AI actually sees). */
  prompt: string;
  /** Whether the user is allowed to drop this slice (`false` for the base prompt). */
  removable: boolean;
}

/**
 * GET /api/ai/context
 *
 * Returns the user's career context as a list of removable slices plus the
 * concatenated `systemPrompt` (kept for back-compat with any consumer still
 * reading the legacy shape).
 *
 * URL-aware ambient (ADR-0046 follow-up D): callers may pass
 * `?activeWorklogId=...&activeJobId=...` to override the recency heuristic
 * with a userId-scoped lookup of the exact entity the user is viewing.
 * Foreign IDs silently fall back to the heuristic (no info leak).
 *
 * Response shape:
 *   {
 *     slices: AIContextSlice[],
 *     systemPrompt: string,
 *     ambient: { activeJob, activeWorklog, activeSkill },
 *   }
 */
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // URL-aware ambient hints. Both params are optional; when present the
  // server uses them to override the recency heuristic for `activeJob` /
  // `activeWorklog`. Lookups are userId-scoped so a foreign id leaks
  // nothing — it just falls back to the heuristic.
  const url = new URL(request.url);
  const activeJobIdParam = url.searchParams.get("activeJobId") || null;
  const activeWorklogIdParam = url.searchParams.get("activeWorklogId") || null;

  const [
    profile,
    heuristicPosition,
    applications,
    skills,
    goals,
    certifications,
    interviews,
    heuristicWorklog,
    urlPosition,
    urlWorklog,
  ] = await Promise.all([
    prisma.userProfile.findFirst({ where: { userId } }),
    prisma.workHistory.findFirst({ where: { userId, isActive: true } }),
    prisma.jobApplication.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        company: true,
        role: true,
        status: true,
        appliedDate: true,
      },
    }),
    prisma.skill.findMany({ where: { userId }, take: 30, orderBy: { proficiency: "desc" } }),
    prisma.careerGoal.findMany({
      where: { userId, status: { not: "completed" } },
      take: 10,
    }),
    prisma.certification.findMany({ where: { userId }, take: 10 }),
    prisma.interview.findMany({
      where: { userId, scheduledAt: { gte: new Date() } },
      take: 5,
      include: { jobApplication: { select: { company: true, role: true } } },
    }),
    // Ambient activeWorklog (ADR-0046 Phase D.2): the most-recently-updated
    // WorkLog within the last 24h. Used by the action-target resolver as a
    // "what was the user just editing" signal when the chat panel asks who
    // a code-block should land on. URL-aware override (Phase D follow-up D)
    // below trumps this when the user is actually on a worklog editor page.
    prisma.workLog.findFirst({
      where: {
        userId,
        updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        archivedAt: null,
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true },
    }),
    // URL-aware ambient overrides (ADR-0046 follow-up D). Both are
    // userId-scoped so an unknown / foreign id silently falls back to the
    // recency heuristic above. We mirror the heuristic's `select` shape
    // (default for WorkHistory — the prompt-building block reads many
    // fields; explicit select for WorkLog to keep the ambient payload tiny).
    activeJobIdParam
      ? prisma.workHistory.findFirst({
          where: { id: activeJobIdParam, userId },
        })
      : Promise.resolve(null),
    activeWorklogIdParam
      ? prisma.workLog.findFirst({
          where: {
            id: activeWorklogIdParam,
            userId,
            archivedAt: null,
          },
          select: { id: true, title: true },
        })
      : Promise.resolve(null),
  ]);

  // URL override wins when present and userId-scoped lookup succeeded.
  // Otherwise fall back to the recency heuristic. Either may still be null
  // (no signal at all — e.g. on `/dashboard` with no recent activity).
  const position = urlPosition ?? heuristicPosition;
  const recentWorklog = urlWorklog ?? heuristicWorklog;

  const slices: AIContextSlice[] = [];

  slices.push({
    id: "base",
    label: "Base prompt",
    removable: false,
    prompt:
      "You are Resumsify AI, a career assistant embedded in the user's personal career management app. " +
      "You have access to the user's real career data shown below. Use it to give personalized, actionable advice. " +
      "Be concise, helpful, and direct. Format responses with markdown when helpful. " +
      "Focus on career development, job search strategy, interview prep, salary negotiation, and skill growth.",
  });

  if (profile) {
    const lines = ["## User Profile"];
    if (profile.fullName) lines.push(`- Name: ${profile.fullName}`);
    if (profile.headline) lines.push(`- Headline: ${profile.headline}`);
    if (profile.city || profile.state) lines.push(`- Location: ${[profile.city, profile.state].filter(Boolean).join(", ")}`);
    if (profile.availability) lines.push(`- Availability: ${profile.availability.replace(/_/g, " ")}`);
    if (profile.preferredRoles) lines.push(`- Preferred Roles: ${profile.preferredRoles}`);
    if (profile.targetSalaryMin || profile.targetSalaryMax) {
      lines.push(`- Target Salary: ${profile.currency} ${profile.targetSalaryMin?.toLocaleString() ?? "?"} – ${profile.targetSalaryMax?.toLocaleString() ?? "?"}`);
    }
    if (profile.bio) lines.push(`- Bio: ${profile.bio}`);
    slices.push({ id: "profile", label: "Profile", removable: true, prompt: lines.join("\n") });
  }

  if (position) {
    const lines = ["## Current Position"];
    lines.push(`- Role: ${position.title} at ${position.company}`);
    if (position.department) lines.push(`- Department: ${position.department}`);
    if (position.location) lines.push(`- Location: ${position.location}`);
    lines.push(`- Type: ${position.workMode}`);
    lines.push(`- Start Date: ${position.startDate}`);
    if (position.salaryAmount) lines.push(`- Salary: ${position.salaryCurrency} ${position.salaryAmount.toLocaleString()}`);
    if (position.payType && position.payRate) lines.push(`- Pay: ${position.payType} @ $${position.payRate}/hr, ${position.payFrequency}`);
    if (position.techStack) lines.push(`- Tech Stack: ${position.techStack}`);
    slices.push({ id: "position", label: "Current position", removable: true, prompt: lines.join("\n") });
  }

  if (skills.length > 0) {
    const grouped: Record<string, string[]> = {};
    for (const s of skills) {
      const cat = s.category || "other";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(`${s.name} (${s.proficiency})`);
    }
    const lines = ["## Skills"];
    for (const [cat, items] of Object.entries(grouped)) {
      lines.push(`- ${cat}: ${items.join(", ")}`);
    }
    slices.push({ id: "skills", label: "Skills", removable: true, prompt: lines.join("\n") });
  }

  if (applications.length > 0) {
    const byStatus: Record<string, number> = {};
    for (const a of applications) {
      byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
    }
    const lines = [`## Job Search (${applications.length} recent applications)`];
    lines.push(`- Pipeline: ${Object.entries(byStatus).map(([s, c]) => `${s}: ${c}`).join(", ")}`);
    const recent = applications.slice(0, 5);
    lines.push(`- Recent: ${recent.map((a) => `${a.role} @ ${a.company} (${a.status})`).join("; ")}`);
    slices.push({ id: "applications", label: "Applications", removable: true, prompt: lines.join("\n") });
  }

  if (goals.length > 0) {
    const lines = ["## Active Goals"];
    for (const g of goals) {
      lines.push(`- ${g.title} (${g.priority} priority, ${g.status})${g.targetDate ? ` — due ${g.targetDate.toISOString().split("T")[0]}` : ""}`);
    }
    slices.push({ id: "goals", label: "Goals", removable: true, prompt: lines.join("\n") });
  }

  if (certifications.length > 0) {
    const lines = ["## Certifications"];
    for (const c of certifications) {
      const expiry = c.expiryDate ? ` (expires ${c.expiryDate.toISOString().split("T")[0]})` : "";
      lines.push(`- ${c.name} — ${c.issuer}${expiry}`);
    }
    slices.push({ id: "certifications", label: "Certifications", removable: true, prompt: lines.join("\n") });
  }

  if (interviews.length > 0) {
    const lines = ["## Upcoming Interviews"];
    for (const i of interviews) {
      lines.push(`- ${i.type} for ${i.jobApplication.role} @ ${i.jobApplication.company} on ${i.scheduledAt.toISOString().split("T")[0]}`);
    }
    slices.push({ id: "interviews", label: "Upcoming interviews", removable: true, prompt: lines.join("\n") });
  }

  // Legacy `systemPrompt` field is the concatenation of every slice's prompt.
  // Kept for back-compat with the previous monolithic shape; new consumers
  // should build the prompt themselves from unsuppressed slices on the client.
  const systemPrompt = slices.map((s) => s.prompt).join("\n\n");

  // Ambient entity refs (ADR-0046 Phase D.2). Consumed by the chat panel
  // when running the action-target resolver. Each ref is `null` when the
  // server has no signal.
  const activeJob = position
    ? {
        type: "job" as const,
        id: position.id,
        label: position.title
          ? `${position.title} @ ${position.company}`
          : position.company,
      }
    : null;
  const activeWorklog = recentWorklog
    ? {
        type: "worklog" as const,
        id: recentWorklog.id,
        label: recentWorklog.title,
      }
    : null;
  const ambient = {
    activeJob,
    activeWorklog,
    // Reserved — no reliable server-side signal yet. The chat panel can
    // still populate from the thread context, so this stays in the contract
    // for forward compatibility.
    activeSkill: null,
  };

  return NextResponse.json({ slices, systemPrompt, ambient });
}

