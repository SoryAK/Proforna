import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// Public: track a resume view
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const resume = await prisma.interactiveResume.findUnique({ where: { slug } });
  if (!resume || !resume.isPublished) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));

  await prisma.resumeView.create({
    data: {
      resumeId: resume.id,
      referrer: body.referrer || null,
      userAgent: body.userAgent || null,
      sectionsViewed: body.sectionsViewed || null,
      durationSeconds: body.durationSeconds || null,
    },
  });

  return NextResponse.json({ ok: true });
}
