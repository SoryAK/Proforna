import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import {
  getOrCreateRecruiterId,
  readRecruiterId,
  setRecruiterCookie,
} from "@/lib/recruiter-cookie";

/**
 * Recruiter private notes per IR.
 *
 *   GET   /api/recruiter/notes?slug=...   -> { body, updatedAt }
 *   PUT   /api/recruiter/notes            -> upsert  body: { irSlug, body }
 */

const MAX_NOTE_LENGTH = 8000;

async function resolveSlug(slug: string): Promise<boolean> {
  const profile = await prisma.userProfile.findUnique({
    where: { irSlug: slug },
    select: { id: true },
  });
  if (profile) return true;
  const legacy = await prisma.interactiveResume.findUnique({
    where: { slug },
    select: { id: true },
  });
  return !!legacy;
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug")?.trim();
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const viewerKey = readRecruiterId(req);
  if (!viewerKey) return NextResponse.json({ body: "", updatedAt: null });

  const row = await prisma.recruiterNote.findUnique({
    where: { viewerKey_irSlug: { viewerKey, irSlug: slug } },
    select: { body: true, updatedAt: true },
  });

  return NextResponse.json({
    body: row?.body ?? "",
    updatedAt: row?.updatedAt ?? null,
  });
}

export async function PUT(req: NextRequest) {
  let body: { irSlug?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const irSlug = typeof body.irSlug === "string" ? body.irSlug.trim() : "";
  const noteBody = typeof body.body === "string" ? body.body.slice(0, MAX_NOTE_LENGTH) : "";
  if (!irSlug) return NextResponse.json({ error: "Missing irSlug" }, { status: 400 });
  if (!(await resolveSlug(irSlug))) {
    return NextResponse.json({ error: "Unknown slug" }, { status: 404 });
  }

  const viewerKey = getOrCreateRecruiterId(req);

  if (noteBody.trim().length === 0) {
    await prisma.recruiterNote.deleteMany({ where: { viewerKey, irSlug } });
    const res = NextResponse.json({ body: "", updatedAt: null });
    setRecruiterCookie(res, viewerKey);
    return res;
  }

  const row = await prisma.recruiterNote.upsert({
    where: { viewerKey_irSlug: { viewerKey, irSlug } },
    create: { viewerKey, irSlug, body: noteBody },
    update: { body: noteBody },
  });

  const res = NextResponse.json({ body: row.body, updatedAt: row.updatedAt });
  setRecruiterCookie(res, viewerKey);
  return res;
}
