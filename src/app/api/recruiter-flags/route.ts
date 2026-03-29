import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

const CONFIRMATION_THRESHOLD = 3;

/**
 * GET /api/recruiter-flags?companies=acme,globex
 *   → { flags: { "acme": { count: 5, confirmed: true, flaggedByMe: true }, ... } }
 *
 * GET /api/recruiter-flags?all=1
 *   → { confirmed: ["robert half", "randstad", ...] }
 */
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  const { searchParams } = new URL(req.url);

  const allFlag = searchParams.get("all");
  if (allFlag) {
    const rows = await prisma.recruiterFlag.groupBy({
      by: ["companyNorm"],
      _count: { id: true },
      having: { id: { _count: { gte: CONFIRMATION_THRESHOLD } } },
    });
    return NextResponse.json({ confirmed: rows.map((r) => r.companyNorm) });
  }

  const raw = searchParams.get("companies") ?? "";
  const names = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (names.length === 0) return NextResponse.json({ flags: {} });

  const counts = await prisma.recruiterFlag.groupBy({
    by: ["companyNorm"],
    _count: { id: true },
    where: { companyNorm: { in: names } },
  });

  let myFlags = new Set<string>();
  if (userId) {
    const mine = await prisma.recruiterFlag.findMany({
      where: { userId, companyNorm: { in: names } },
      select: { companyNorm: true },
    });
    myFlags = new Set(mine.map((f) => f.companyNorm));
  }

  const flags: Record<string, { count: number; confirmed: boolean; flaggedByMe: boolean }> = {};
  for (const name of names) {
    const row = counts.find((c) => c.companyNorm === name);
    const count = row?._count?.id ?? 0;
    flags[name] = {
      count,
      confirmed: count >= CONFIRMATION_THRESHOLD,
      flaggedByMe: myFlags.has(name),
    };
  }

  return NextResponse.json({ flags });
}

/**
 * POST /api/recruiter-flags  { company: "Insight Global" }
 * Toggle: creates flag if absent, deletes if already flagged.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const company = (body.company ?? "").trim().toLowerCase();
  if (!company) return NextResponse.json({ error: "company required" }, { status: 400 });

  const existing = await prisma.recruiterFlag.findUnique({
    where: { companyNorm_userId: { companyNorm: company, userId } },
  });

  if (existing) {
    await prisma.recruiterFlag.delete({ where: { id: existing.id } });
    const count = await prisma.recruiterFlag.count({ where: { companyNorm: company } });
    return NextResponse.json({ flagged: false, count, confirmed: count >= CONFIRMATION_THRESHOLD });
  }

  await prisma.recruiterFlag.create({ data: { companyNorm: company, userId } });
  const count = await prisma.recruiterFlag.count({ where: { companyNorm: company } });
  return NextResponse.json({ flagged: true, count, confirmed: count >= CONFIRMATION_THRESHOLD });
}
