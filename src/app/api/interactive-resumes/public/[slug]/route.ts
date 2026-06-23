import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_SECTIONS: SectionConfig[] = [
  { type: "summary", visible: true, order: 0 },
  { type: "experience", visible: true, order: 1 },
  { type: "skills", visible: true, order: 2 },
  { type: "certifications", visible: true, order: 3 },
  { type: "inventory", visible: false, order: 4 },
  { type: "contact", visible: true, order: 5 },
];

type SectionConfig = {
  type: string;
  visible: boolean;
  order: number;
  settings?: Record<string, unknown>;
};

// Public: get the adaptive Interactive Resume by slug.
// Resolution order:
//   1. UserProfile.irSlug    (new, profile-driven IR)
//   2. InteractiveResume.slug (legacy — kept alive so old shared links still work)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const accessToken = req.nextUrl.searchParams.get("token");

  // 1. Try profile-driven IR first
  let profile = await prisma.userProfile.findUnique({ where: { irSlug: slug } });
  let legacyResume: Awaited<ReturnType<typeof prisma.interactiveResume.findUnique>> = null;

  if (!profile) {
    legacyResume = await prisma.interactiveResume.findUnique({ where: { slug } });
    if (legacyResume && legacyResume.isPublished) {
      profile = await prisma.userProfile.findFirst({ where: { userId: legacyResume.userId } });
    }
  }

  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const visibility = profile.visibility || "public";
  if (visibility === "private") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ── Resolve token-based access (single-use links + approved access requests) ──
  let singleUseAccess = false;
  let viewerOverride: { targetRole: string | null; focusSections: string[] | null } | null = null;

  if (accessToken && accessToken.length > 40) {
    const link = await prisma.singleUseLink.findUnique({ where: { token: accessToken } });
    if (link && !link.viewedAt && link.expiresAt > new Date() && link.profileId === profile.id) {
      singleUseAccess = true;
      viewerOverride = {
        targetRole: link.targetRole,
        focusSections: link.focusSections ? safeParseArray(link.focusSections) : null,
      };
      await prisma.singleUseLink.update({
        where: { id: link.id },
        data: { viewedAt: new Date(), viewedBy: req.headers.get("user-agent") || "unknown" },
      });
    }
  }

  let approvedAccess = false;
  if (accessToken && !singleUseAccess) {
    const request = await prisma.accessRequest.findUnique({ where: { accessToken } });
    if (request && request.status === "approved" && request.profileId === profile.id) {
      if (!request.tokenExpiresAt || request.tokenExpiresAt > new Date()) {
        approvedAccess = true;
        viewerOverride = {
          targetRole: request.targetRole,
          focusSections: request.focusSections ? safeParseArray(request.focusSections) : null,
        };
      }
    }
  }

  const hasFullAccess = visibility === "public" || singleUseAccess || approvedAccess;

  // ── Resolve sections + theme + summary, preferring profile config but falling back to legacy IR ──
  const sectionsRaw = profile.irSections ?? legacyResume?.sections ?? null;
  const sections: SectionConfig[] = sectionsRaw ? safeParseSections(sectionsRaw) : DEFAULT_SECTIONS;
  const theme = profile.irTheme || legacyResume?.theme || "modern";
  const targetRole = viewerOverride?.targetRole || profile.irTargetRole || legacyResume?.targetRole || null;
  // Adaptive summary = bio (canonical), with legacy resume.summary as fallback
  const summary = profile.bio || legacyResume?.summary || null;
  const title = legacyResume?.title || profile.fullName || "Interactive Resume";
  const updatedAt = legacyResume?.updatedAt || profile.updatedAt;

  const visibleTypes = new Set(sections.filter((s) => s.visible).map((s) => s.type));

  // ── Load published snapshot (frozen copy of profile + comp + work history). ──
  // If present, the IR shows snapshot data only — unpublished edits stay hidden.
  // We still rely on LIVE control fields (visibility/irSlug/hideCurrentEmployer)
  // so the user can yank the IR offline immediately without republishing.
  const published = await prisma.publishedProfile.findUnique({
    where: { userId: profile.userId },
  });

  // ── Fetch only the data we need ──
  const [skills, certifications, experienceLive, compRawLive, inventoryLive] = await Promise.all([
    visibleTypes.has("skills")
      ? prisma.skill.findMany({ where: { userId: profile.userId }, orderBy: { category: "asc" } })
      : Promise.resolve([]),
    visibleTypes.has("certifications")
      ? prisma.certification.findMany({ where: { userId: profile.userId }, orderBy: { issueDate: "desc" } })
      : Promise.resolve([]),
    visibleTypes.has("experience")
      ? prisma.workHistory.findMany({
          where: { userId: profile.userId },
          orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
          include: {
            galleryPhotos: {
              orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
              include: {
                annotations: {
                  where: { isPrivate: false },
                  orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                },
              },
            },
            attachments: { orderBy: { createdAt: "desc" } },
            equipment: { include: { photos: { orderBy: { isCover: "desc" } } } },
            locations: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
          },
        })
      : Promise.resolve([]),
    prisma.compensationPreference.findUnique({ where: { profileId: profile.id } }),
    visibleTypes.has("inventory")
      ? prisma.personalEquipment.findMany({
          where: { userId: profile.userId, isPrivate: false, isDraft: false },
          orderBy: [{ category: "asc" }, { name: "asc" }],
          include: { photos: { orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }] } },
        })
      : Promise.resolve([]),
  ]);

  // Apply snapshot overrides if user has published.
  // Profile snapshot fields override the live profile object for viewer-facing data.
  let experience = experienceLive;
  let compRaw = compRawLive as typeof compRawLive | null;
  let snapshotComp: ReturnType<typeof identitySnapshotComp> | null = null;
  function identitySnapshotComp(c: unknown) { return c as Record<string, unknown> | null; }
  if (published) {
    const ps = (published.profileSnapshot ?? {}) as Record<string, unknown>;
    // Mutate the local profile object — keep id/userId/irSlug/visibility/hideCurrentEmployer (live control fields).
    const liveControl = {
      id: profile.id,
      userId: profile.userId,
      irSlug: profile.irSlug,
      visibility: profile.visibility,
      hideCurrentEmployer: profile.hideCurrentEmployer,
      anonymousTitle: profile.anonymousTitle,
      updatedAt: published.publishedAt,
    };
    Object.assign(profile, ps, liveControl);
    if (Array.isArray(published.workHistorySnapshot)) {
      experience = published.workHistorySnapshot as typeof experience;
    }
    if (published.compensationSnapshot) {
      // Snapshot comp is already in final public shape — use directly.
      snapshotComp = identitySnapshotComp(published.compensationSnapshot);
      compRaw = null; // skip live comp processing below
    }
  }

  // updatedAt should reflect publish time when we have a snapshot.
  const effectiveUpdatedAt = published?.publishedAt ?? updatedAt;

  // Sanitize compensation for public consumption
  // - Always strip the private hardFloor exact value
  // - Respect comp.visibility: "hidden" → omit entirely; "recruiters" → only when token-based access
  const compSourceVisibility = (snapshotComp?.visibility as string | undefined) ?? compRaw?.visibility;
  const compVisible =
    (snapshotComp || compRaw) &&
    compSourceVisibility !== "hidden" &&
    (compSourceVisibility !== "recruiters" || singleUseAccess || approvedAccess);
  const compensation = compVisible
    ? snapshotComp
      ? snapshotComp
      : {
        period: compRaw!.period,
        currency: compRaw!.currency,
        salaryMin: compRaw!.salaryMin,
        salaryTarget: compRaw!.salaryTarget,
        salaryMax: compRaw!.salaryMax,
        // hardFloor itself is private — only signal that one exists so the IR can render a "verified floor" badge
        hasHardFloor: compRaw!.hardFloor != null,
        employmentTypes: safeParseArray(compRaw!.employmentTypes ?? "") ?? [],
        openToRelocation: compRaw!.openToRelocation,
        openToEquity: compRaw!.openToEquity,
        openToBonus: compRaw!.openToBonus,
        openToSignOn: compRaw!.openToSignOn,
        remotePreference: compRaw!.remotePreference,
        benefitsMustHaves: safeParseArray(compRaw!.benefitsMustHaves ?? "") ?? [],
        notes: compRaw!.notes,
        visibility: compRaw!.visibility,
      }
    : null;

  // ── Publicize gallery photos: drop private photos; clear annotations when annotationsPublic=false ──
  // Gallery-only helper. Earlier this was a generic `publicizeGallery<T>(pos: T): T`
  // wrapper, but TS erases `T` when the function is passed by reference to
  // `.map(publicizeGallery)` and downstream callers lost access to sibling
  // fields like `isActive` / `company`. Inlining the transformation at each
  // call site keeps the full position type intact.
  type GalleryPhotoIn = { isPrivate: boolean; annotationsPublic: boolean; annotations?: unknown[] };
  function publicizeGalleryPhotos<P extends GalleryPhotoIn>(photos: P[]): P[] {
    return photos
      .filter((p) => !p.isPrivate)
      .map((p) => ({ ...p, annotations: p.annotationsPublic ? (p.annotations ?? []) : [] }));
  }

  // ── Inventory (Personal Equipment): redact serial numbers + private notes for public viewers ──
  const inventory = (inventoryLive ?? []).map((it) => ({
    id: it.id,
    name: it.name,
    category: it.category,
    ownership: it.ownership,
    manufacturer: it.manufacturer,
    model: it.model,
    condition: it.condition,
    proficiency: it.proficiency,
    location: it.location,
    purchaseDate: it.purchaseDate,
    purchasePrice: it.purchasePrice,
    currentValue: it.currentValue,
    notes: it.notes,
    tags: it.tags,
    photos: (it.photos ?? []).map((p) => ({
      id: p.id,
      filePath: p.filePath,
      caption: p.caption,
      isCover: p.isCover,
      focalX: p.focalX,
      focalY: p.focalY,
      zoom: p.zoom,
    })),
  }));

  // ── Build response based on visibility ──
  if (hasFullAccess) {
    const expData = (profile.hideCurrentEmployer
      ? experience.map((pos) => ({ ...pos, company: pos.isActive ? "Current Employer" : pos.company }))
      : experience
    ).map((pos) => ({ ...pos, galleryPhotos: publicizeGalleryPhotos(pos.galleryPhotos) }));

    return NextResponse.json({
      visibility: "public",
      resume: { title, targetRole, summary, theme, sections, updatedAt: effectiveUpdatedAt },
      viewerOverride,
      profile: {
        fullName: profile.fullName,
        headline: profile.headline,
        avatarUrl: profile.avatarUrl,
        email: visibleTypes.has("contact") ? profile.email : null,
        phone: visibleTypes.has("contact") ? profile.phone : null,
        linkedinUrl: visibleTypes.has("contact") ? profile.linkedinUrl : null,
        githubUrl: visibleTypes.has("contact") ? profile.githubUrl : null,
        portfolioUrl: visibleTypes.has("contact") ? profile.portfolioUrl : null,
        schedulingUrl: visibleTypes.has("contact") ? profile.schedulingUrl : null,
        contactCtaMessage: visibleTypes.has("contact") ? profile.contactCtaMessage : null,
        city: profile.city,
        state: profile.state,
      },
      skills,
      certifications,
      experience: expData,
      inventory,
      compensation,
      recruitMeta: {
        // Coords rounded to ~1km grid for privacy; sufficient for radius circle.
        homeLat: profile.homeLat != null ? Math.round(profile.homeLat * 100) / 100 : null,
        homeLng: profile.homeLng != null ? Math.round(profile.homeLng * 100) / 100 : null,
        maxCommuteMiles: profile.maxCommuteMiles ?? null,
      },
    });
  }

  // ── Stealth: show value but hide identity ──
  if (visibility === "stealth") {
    const anonName = profile.anonymousTitle || `Verified Professional #${profile.id.slice(-4).toUpperCase()}`;
    return NextResponse.json({
      visibility: "stealth",
      profileId: profile.id,
      resume: { title, targetRole, summary, theme, sections, updatedAt: effectiveUpdatedAt },
      viewerOverride: null,
      profile: {
        fullName: anonName,
        headline: profile.headline,
        avatarUrl: null,
        email: null,
        linkedinUrl: null,
        githubUrl: null,
        portfolioUrl: null,
        city: profile.city,
        state: profile.state,
      },
      skills,
      certifications,
      experience: experience
        .map((pos) => ({ ...pos, galleryPhotos: publicizeGalleryPhotos(pos.galleryPhotos) }))
        .map((pos) => ({
          ...pos,
          company: pos.isActive ? "Current Employer (Hidden)" : pos.company,
        })),
      inventory,
      compensation,
    });
  }

  // ── Anonymous: fully redacted ──
  const anonName = profile.anonymousTitle || `Verified Professional #${profile.id.slice(-4).toUpperCase()}`;
  return NextResponse.json({
    visibility: "anonymous",
    profileId: profile.id,
    resume: {
      title: anonName,
      targetRole,
      summary: null,
      theme,
      sections: sections.filter((s) => s.type === "skills" || s.type === "certifications"),
      updatedAt: effectiveUpdatedAt,
    },
    viewerOverride: null,
    profile: {
      fullName: anonName,
      headline: profile.headline,
      avatarUrl: null,
      email: null,
      linkedinUrl: null,
      githubUrl: null,
      portfolioUrl: null,
      city: profile.state ? `${profile.state} area` : null,
      state: null,
    },
    skills,
    certifications,
    experience: experience.map((pos) => ({
      ...pos,
      company: "Industry Employer",
      role: pos.title,
      location: null,
      description: null,
      techStack: null,
    })),
  });
}

function safeParseSections(raw: string): SectionConfig[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as SectionConfig[];
  } catch {}
  return DEFAULT_SECTIONS;
}

function safeParseArray(raw: string): string[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === "string");
  } catch {}
  return null;
}
