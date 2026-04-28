import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { readRecruiterId } from "@/lib/recruiter-cookie";

/**
 * GET /api/recruiter/list
 * Returns the saved-candidate list for the recruiter cookie, with their
 * private notes and a public profile snapshot for each candidate.
 */
export async function GET(req: NextRequest) {
  const viewerKey = readRecruiterId(req);
  if (!viewerKey) return NextResponse.json({ items: [] });

  const saves = await prisma.recruiterSavedCandidate.findMany({
    where: { viewerKey, archivedAt: null },
    orderBy: { savedAt: "desc" },
    take: 200,
  });

  if (saves.length === 0) return NextResponse.json({ items: [] });

  const slugs = saves.map((s) => s.irSlug);
  const [notes, profiles] = await Promise.all([
    prisma.recruiterNote.findMany({
      where: { viewerKey, irSlug: { in: slugs } },
      select: { irSlug: true, body: true, updatedAt: true },
    }),
    prisma.userProfile.findMany({
      where: { irSlug: { in: slugs } },
      select: {
        irSlug: true,
        fullName: true,
        headline: true,
        avatarUrl: true,
        city: true,
        state: true,
      },
    }),
  ]);

  const noteMap = new Map(notes.map((n) => [n.irSlug, n]));
  const profileMap = new Map(profiles.map((p) => [p.irSlug, p]));

  const items = saves.map((s) => {
    const profile = profileMap.get(s.irSlug);
    const note = noteMap.get(s.irSlug);
    return {
      irSlug: s.irSlug,
      savedAt: s.savedAt,
      tag: s.tag,
      candidateName: profile?.fullName ?? s.candidateName ?? null,
      candidateHeadline: profile?.headline ?? s.candidateHeadline ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
      location: [profile?.city, profile?.state].filter(Boolean).join(", ") || null,
      noteBody: note?.body ?? null,
      noteUpdatedAt: note?.updatedAt ?? null,
    };
  });

  return NextResponse.json({ items });
}
