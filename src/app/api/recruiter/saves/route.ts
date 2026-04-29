import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import {
  getOrCreateRecruiterId,
  readRecruiterId,
  setRecruiterCookie,
} from "@/lib/recruiter-cookie";
import { checkRateLimit } from "@/lib/rate-limit";

/** Build a rate-limit key from cookie viewerKey or fallback IP. */
function rlKey(req: NextRequest): string {
  const id = readRecruiterId(req);
  if (id) return `rec:${id}`;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return `rec-ip:${ip}`;
}

/**
 * Recruiter "save candidate" endpoint.
 *
 *   GET    /api/recruiter/saves?slug=...      -> { saved, savedAt, tag }
 *   POST   /api/recruiter/saves               -> create/restore save
 *      body: { irSlug, candidateName?, candidateHeadline?, tag? }
 *   PATCH  /api/recruiter/saves               -> update tag only
 *      body: { irSlug, tag: "hot"|"maybe"|"no_go"|null }
 *   DELETE /api/recruiter/saves?slug=...      -> archive save
 */

const ALLOWED_TAGS = new Set(["hot", "maybe", "no_go"]);
function normalizeTag(t: unknown): string | null {
  if (typeof t !== "string") return null;
  return ALLOWED_TAGS.has(t) ? t : null;
}

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
  if (!viewerKey) return NextResponse.json({ saved: false });

  const row = await prisma.recruiterSavedCandidate.findUnique({
    where: { viewerKey_irSlug: { viewerKey, irSlug: slug } },
    select: { savedAt: true, archivedAt: true, tag: true },
  });

  return NextResponse.json({
    saved: !!row && !row.archivedAt,
    savedAt: row?.savedAt ?? null,
    tag: row?.tag ?? null,
  });
}

export async function POST(req: NextRequest) {
  // 60 saves per hour per recruiter cookie/IP — prevents runaway bookmarking scripts.
  const rl = checkRateLimit(`saves:post:${rlKey(req)}`, { limit: 60, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many saves. Try again later." },
      { status: 429, headers: rl.headers },
    );
  }

  let body: {
    irSlug?: string;
    candidateName?: string | null;
    candidateHeadline?: string | null;
    tag?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const irSlug = typeof body.irSlug === "string" ? body.irSlug.trim() : "";
  if (!irSlug) return NextResponse.json({ error: "Missing irSlug" }, { status: 400 });
  if (!(await resolveSlug(irSlug))) {
    return NextResponse.json({ error: "Unknown slug" }, { status: 404 });
  }

  const viewerKey = getOrCreateRecruiterId(req);
  const candidateName = body.candidateName?.toString().slice(0, 200) ?? null;
  const candidateHeadline = body.candidateHeadline?.toString().slice(0, 300) ?? null;
  const tag = normalizeTag(body.tag);

  const row = await prisma.recruiterSavedCandidate.upsert({
    where: { viewerKey_irSlug: { viewerKey, irSlug } },
    create: { viewerKey, irSlug, candidateName, candidateHeadline, tag },
    update: { archivedAt: null, candidateName, candidateHeadline },
  });

  const res = NextResponse.json({ saved: true, savedAt: row.savedAt, tag: row.tag });
  setRecruiterCookie(res, viewerKey);
  return res;
}

export async function PATCH(req: NextRequest) {
  const rl = checkRateLimit(`saves:patch:${rlKey(req)}`, { limit: 120, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many tag updates. Try again later." },
      { status: 429, headers: rl.headers },
    );
  }
  let body: { irSlug?: string; tag?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const irSlug = typeof body.irSlug === "string" ? body.irSlug.trim() : "";
  if (!irSlug) return NextResponse.json({ error: "Missing irSlug" }, { status: 400 });

  const viewerKey = readRecruiterId(req);
  if (!viewerKey) return NextResponse.json({ error: "Not saved" }, { status: 404 });

  const tag = body.tag === null ? null : normalizeTag(body.tag);

  const result = await prisma.recruiterSavedCandidate.updateMany({
    where: { viewerKey, irSlug, archivedAt: null },
    data: { tag },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not saved" }, { status: 404 });
  }
  return NextResponse.json({ tag });
}

export async function DELETE(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug")?.trim();
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const viewerKey = readRecruiterId(req);
  if (!viewerKey) return NextResponse.json({ saved: false });

  await prisma.recruiterSavedCandidate.updateMany({
    where: { viewerKey, irSlug: slug, archivedAt: null },
    data: { archivedAt: new Date() },
  });

  return NextResponse.json({ saved: false });
}
