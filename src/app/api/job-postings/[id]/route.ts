import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

type Ctx = { params: Promise<{ id: string }> };

/* ── GET — single posting (public if published, owner always) ── */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;

  const posting = await prisma.jobPosting.findUnique({ where: { id } });
  if (!posting)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // If not published, only owner can view
  if (!posting.isPublished) {
    const userId = await getUserId();
    if (userId !== posting.userId)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(posting);
}

/* ── PATCH — update a job posting ── */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  const existing = await prisma.jobPosting.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  const data: Record<string, unknown> = {};
  const stringFields = [
    "company", "companyLogo", "role", "department", "location", "type",
    "employmentType", "experienceLevel", "currency", "payFrequency",
    "description", "requirements", "niceToHave", "benefits", "techStack",
    "applicationUrl", "contactEmail", "ein",
  ];

  for (const key of stringFields) {
    if (key in body) data[key] = body[key]?.trim?.() || null;
  }

  if ("salaryMin" in body) data.salaryMin = body.salaryMin ? parseInt(body.salaryMin) : null;
  if ("salaryMax" in body) data.salaryMax = body.salaryMax ? parseInt(body.salaryMax) : null;
  if ("isPublished" in body) data.isPublished = !!body.isPublished;
  if ("isFeatured" in body) data.isFeatured = !!body.isFeatured;
  if ("expiresAt" in body) data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

  const updated = await prisma.jobPosting.update({
    where: { id },
    data,
  });

  return NextResponse.json(updated);
}

/* ── DELETE — remove a job posting ── */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  const existing = await prisma.jobPosting.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.jobPosting.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
