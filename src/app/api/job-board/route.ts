import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/* ── GET — public job board feed (no auth required) ── */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const search = searchParams.get("q")?.trim() || "";
  const type = searchParams.get("type") || "";
  const level = searchParams.get("level") || "";
  const employment = searchParams.get("employment") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));

  const where: Record<string, unknown> = {
    isPublished: true,
    OR: undefined as unknown,
  };

  // Filter out expired postings
  where.OR = [
    { expiresAt: null },
    { expiresAt: { gt: new Date() } },
  ];

  if (type) where.type = type;
  if (level) where.experienceLevel = level;
  if (employment) where.employmentType = employment;

  if (search) {
    where.AND = [
      {
        OR: [
          { role: { contains: search, mode: "insensitive" } },
          { company: { contains: search, mode: "insensitive" } },
          { location: { contains: search, mode: "insensitive" } },
          { techStack: { contains: search, mode: "insensitive" } },
        ],
      },
    ];
  }

  const [postings, total] = await Promise.all([
    prisma.jobPosting.findMany({
      where,
      orderBy: [
        { isFeatured: "desc" },
        { createdAt: "desc" },
      ],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        slug: true,
        company: true,
        companyLogo: true,
        role: true,
        department: true,
        location: true,
        type: true,
        employmentType: true,
        experienceLevel: true,
        salaryMin: true,
        salaryMax: true,
        currency: true,
        payFrequency: true,
        description: true,
        techStack: true,
        applicationUrl: true,
        isFeatured: true,
        createdAt: true,
        expiresAt: true,
      },
    }),
    prisma.jobPosting.count({ where }),
  ]);

  return NextResponse.json({
    postings,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}
