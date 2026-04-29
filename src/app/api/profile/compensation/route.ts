import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";

const PERIODS = new Set(["annual", "hourly", "monthly"]);
const REMOTE = new Set(["any", "remote", "hybrid", "onsite"]);
const VISIBILITY = new Set(["public", "recruiters", "hidden"]);
const EMPLOYMENT = new Set(["full_time", "part_time", "contract", "1099", "internship", "temp"]);

function jsonArray(input: unknown, allowed?: Set<string>): string | null {
  if (input == null) return null;
  if (!Array.isArray(input)) return null;
  const cleaned = input
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean);
  if (allowed) {
    for (const v of cleaned) if (!allowed.has(v)) return null;
  }
  return JSON.stringify(cleaned);
}

function intOrNull(v: unknown): number | null | undefined {
  if (v === undefined) return undefined; // not provided
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n) || n < 0 || n > 100_000_000) return null;
  return Math.round(n);
}

// GET - return the current user's compensation preferences (creates a default empty row if missing)
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const comp = await prisma.compensationPreference.upsert({
    where: { profileId: profile.id },
    create: { profileId: profile.id },
    update: {},
  });

  return NextResponse.json({
    ...comp,
    employmentTypes: comp.employmentTypes ? safeParse(comp.employmentTypes) : [],
    benefitsMustHaves: comp.benefitsMustHaves ? safeParse(comp.benefitsMustHaves) : [],
  });
}

// PUT - replace the user's compensation preferences
export async function PUT(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 30 writes per hour per user — generous for normal editing, blocks runaway scripts.
  const rl = checkRateLimit(`comp:put:${userId}`, { limit: 30, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many comp updates. Try again later." },
      { status: 429, headers: rl.headers },
    );
  }

  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  if ("period" in body) {
    const v = String(body.period);
    if (!PERIODS.has(v)) return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    data.period = v;
  }
  if ("currency" in body && typeof body.currency === "string") {
    const c = body.currency.trim().toUpperCase().slice(0, 3);
    if (c) data.currency = c;
  }
  for (const key of ["salaryMin", "salaryTarget", "salaryMax", "hardFloor"] as const) {
    if (key in body) {
      const n = intOrNull(body[key]);
      if (n !== undefined) data[key] = n;
    }
  }
  if ("employmentTypes" in body) {
    const j = jsonArray(body.employmentTypes, EMPLOYMENT);
    data.employmentTypes = j;
  }
  if ("benefitsMustHaves" in body) {
    const j = jsonArray(body.benefitsMustHaves);
    data.benefitsMustHaves = j;
  }
  for (const flag of ["openToRelocation", "openToEquity", "openToBonus", "openToSignOn"] as const) {
    if (flag in body) data[flag] = !!body[flag];
  }
  if ("remotePreference" in body) {
    const v = String(body.remotePreference);
    if (!REMOTE.has(v)) return NextResponse.json({ error: "Invalid remotePreference" }, { status: 400 });
    data.remotePreference = v;
  }
  if ("visibility" in body) {
    const v = String(body.visibility);
    if (!VISIBILITY.has(v)) return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
    data.visibility = v;
  }
  if ("notes" in body) {
    if (body.notes === null || body.notes === "") data.notes = null;
    else if (typeof body.notes === "string") data.notes = body.notes.slice(0, 1000);
  }

  // Cross-field sanity: min <= target <= max
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const min = num(data.salaryMin);
  const tgt = num(data.salaryTarget);
  const max = num(data.salaryMax);
  if (min != null && max != null && min > max) {
    return NextResponse.json({ error: "salaryMin cannot exceed salaryMax" }, { status: 400 });
  }
  if (tgt != null && min != null && tgt < min) {
    return NextResponse.json({ error: "salaryTarget cannot be below salaryMin" }, { status: 400 });
  }
  if (tgt != null && max != null && tgt > max) {
    return NextResponse.json({ error: "salaryTarget cannot exceed salaryMax" }, { status: 400 });
  }

  const updated = await prisma.compensationPreference.upsert({
    where: { profileId: profile.id },
    create: { profileId: profile.id, ...data },
    update: data,
  });

  // Backward-compat sync: mirror salary range + currency onto UserProfile so legacy
  // consumers (career-direction-model, recruiter portal endpoint) keep working.
  // Only mirror when comp is publicly visible — recruiters/hidden should not leak via legacy fields.
  const mirror: Record<string, unknown> = {};
  if (updated.visibility === "public") {
    mirror.targetSalaryMin = updated.salaryMin;
    mirror.targetSalaryMax = updated.salaryMax;
    mirror.currency = updated.currency;
  } else {
    // Clear legacy fields so they don't leak when the user moved comp to recruiters/hidden.
    mirror.targetSalaryMin = null;
    mirror.targetSalaryMax = null;
  }
  await prisma.userProfile.update({
    where: { id: profile.id },
    data: mirror,
  });

  return NextResponse.json({
    ...updated,
    employmentTypes: updated.employmentTypes ? safeParse(updated.employmentTypes) : [],
    benefitsMustHaves: updated.benefitsMustHaves ? safeParse(updated.benefitsMustHaves) : [],
  });
}

function safeParse(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
