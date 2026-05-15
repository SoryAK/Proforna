import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

/**
 * Deep search across the user's work-history graph and personal inventory.
 * Powers the work-mapping Ctrl+/ palette so it can surface matches inside
 * equipment, attachments, gallery photos, photo annotations, and personal
 * inventory items — not just the WorkHistory text fields.
 *
 * Hits are scoped to the authenticated user via positionId / workHistoryId
 * joins (or userId for PersonalEquipment).
 */
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ hits: [] });

  const ci = (s: string) => ({ contains: s, mode: "insensitive" as const });
  const text = q;
  const limit = 25;

  const [equipment, attachments, gallery, annotations, personal, personalPhotos] = await Promise.all([
    // Job-scoped equipment / tools
    prisma.equipment.findMany({
      where: {
        position: { userId },
        OR: [
          { name: ci(text) },
          { manufacturer: ci(text) },
          { model: ci(text) },
          { serialNumber: ci(text) },
          { assetTag: ci(text) },
          { notes: ci(text) },
          { category: ci(text) },
        ],
      },
      select: {
        id: true,
        name: true,
        category: true,
        manufacturer: true,
        model: true,
        notes: true,
        positionId: true,
        position: { select: { company: true, title: true } },
        photos: {
          select: { filePath: true, isCover: true },
          orderBy: [{ isCover: "desc" }, { createdAt: "asc" }],
          take: 1,
        },
      },
      take: limit,
    }),
    // Attachments (offer letters, W-2s, contracts, certs, etc.)
    prisma.attachment.findMany({
      where: {
        position: { userId },
        OR: [
          { label: ci(text) },
          { fileName: ci(text) },
          { category: ci(text) },
        ],
      },
      select: {
        id: true,
        label: true,
        category: true,
        fileName: true,
        positionId: true,
        position: { select: { company: true, title: true } },
      },
      take: limit,
    }),
    // Gallery photos — caption/tags
    prisma.galleryPhoto.findMany({
      where: {
        workHistory: { userId },
        OR: [
          { caption: ci(text) },
          { tags: ci(text) },
          { fileName: ci(text) },
        ],
      },
      select: {
        id: true,
        caption: true,
        tags: true,
        fileName: true,
        filePath: true,
        workHistoryId: true,
        workHistory: { select: { company: true, title: true } },
        album: { select: { name: true } },
      },
      take: limit,
    }),
    // Photo annotations — pins/notes drawn on gallery photos
    prisma.mediaAnnotation.findMany({
      where: {
        photo: { workHistory: { userId } },
        OR: [
          { title: ci(text) },
          { body: ci(text) },
          { tags: ci(text) },
        ],
      },
      select: {
        id: true,
        title: true,
        body: true,
        tags: true,
        kind: true,
        photo: {
          select: {
            id: true,
            caption: true,
            filePath: true,
            workHistoryId: true,
            workHistory: { select: { company: true, title: true } },
          },
        },
      },
      take: limit,
    }),
    // Personal inventory (user-scoped, not tied to a job)
    prisma.personalEquipment.findMany({
      where: {
        userId,
        OR: [
          { name: ci(text) },
          { manufacturer: ci(text) },
          { model: ci(text) },
          { serialNumber: ci(text) },
          { notes: ci(text) },
          { category: ci(text) },
          { location: ci(text) },
          { tags: { has: text } },
        ],
      },
      select: {
        id: true,
        name: true,
        category: true,
        manufacturer: true,
        model: true,
        notes: true,
        location: true,
        tags: true,
        photos: {
          select: {
            filePath: true,
            isCover: true,
            focalX: true,
            focalY: true,
            zoom: true,
            rotation: true,
            flipH: true,
            flipV: true,
          },
          orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
          take: 1,
        },
      },
      take: limit,
    }),
    // Personal inventory photo captions
    prisma.personalEquipmentPhoto.findMany({
      where: {
        equipment: { userId },
        OR: [
          { caption: ci(text) },
          { fileName: ci(text) },
        ],
      },
      select: {
        id: true,
        caption: true,
        fileName: true,
        filePath: true,
        focalX: true,
        focalY: true,
        zoom: true,
        rotation: true,
        flipH: true,
        flipV: true,
        equipmentId: true,
        equipment: { select: { name: true, category: true } },
      },
      take: limit,
    }),
  ]);

  type Hit = {
    key: string;
    group: "Tools" | "Files" | "Photos" | "Notes" | "Inventory";
    title: string;
    subtitle?: string | null;
    snippet?: string | null;
    /** Work-history id when the hit belongs to a job; clicking focuses that job. */
    itemId?: string;
    /** Optional route to navigate to (e.g. /inventory#id) when not job-scoped. */
    href?: string;
    /** Sub-record kind so the client can deep-link into the matching side panel. */
    targetKind?: "equipment" | "attachment" | "galleryPhoto" | "annotation" | "personalEquipment" | "personalEquipmentPhoto";
    /** Sub-record id (matches data-search-highlight-id on the rendered row). */
    targetId?: string;
    /** For annotations: the parent gallery photo id so the gallery panel can scroll to the photo. */
    targetPhotoId?: string;
    /** Optional preview thumbnail URL for image-bearing hits (photos, annotations, equipment photos). */
    thumbnailUrl?: string | null;
    /** Optional focal/zoom/orientation data so the client can frame the thumb the same way the source UI does. */
    thumbFocalX?: number | null;
    thumbFocalY?: number | null;
    thumbZoom?: number | null;
    thumbRotation?: number | null;
    thumbFlipH?: boolean | null;
    thumbFlipV?: boolean | null;
  };

  const stripHtml = (s: string | null | undefined) =>
    (s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const subtitleFor = (company?: string | null, title?: string | null) =>
    [company, title].filter(Boolean).join(" · ") || null;

  const hits: Hit[] = [
    ...equipment.map<Hit>((e) => ({
      key: `eq-${e.id}`,
      group: "Tools",
      title: e.name,
      subtitle: subtitleFor(e.position?.company, [e.manufacturer, e.model].filter(Boolean).join(" ") || e.category),
      snippet: e.notes || null,
      itemId: e.positionId,
      targetKind: "equipment",
      targetId: e.id,
      thumbnailUrl: e.photos?.[0]?.filePath ?? null,
    })),
    ...attachments.map<Hit>((a) => ({
      key: `att-${a.id}`,
      group: "Files",
      title: a.label || a.fileName,
      subtitle: subtitleFor(a.position?.company, a.category),
      snippet: a.fileName,
      itemId: a.positionId,
      targetKind: "attachment",
      targetId: a.id,
    })),
    ...gallery.map<Hit>((g) => ({
      key: `gp-${g.id}`,
      group: "Photos",
      title: g.caption || g.fileName,
      subtitle: subtitleFor(g.workHistory?.company, g.album?.name || null),
      snippet: g.tags || null,
      itemId: g.workHistoryId,
      targetKind: "galleryPhoto",
      targetId: g.id,
      thumbnailUrl: g.filePath,
    })),
    ...annotations
      .filter((a) => a.photo) // annotations without photos are out of scope here
      .map<Hit>((a) => ({
        key: `an-${a.id}`,
        group: "Notes",
        title: a.title || (a.kind ? `${a.kind} annotation` : "Annotation"),
        subtitle: subtitleFor(a.photo!.workHistory?.company, a.photo!.caption),
        snippet: stripHtml(a.body) || a.tags || null,
        itemId: a.photo!.workHistoryId,
        targetKind: "annotation",
        targetId: a.id,
        targetPhotoId: a.photo!.id,
        thumbnailUrl: a.photo!.filePath,
      })),
    ...personal.map<Hit>((p) => {
      const cover = p.photos?.[0];
      return {
        key: `pi-${p.id}`,
        group: "Inventory",
        title: p.name,
        subtitle: [p.category, [p.manufacturer, p.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || null,
        snippet: p.notes || (p.tags && p.tags.length ? p.tags.join(", ") : null),
        href: `/inventory#${p.id}`,
        targetKind: "personalEquipment",
        targetId: p.id,
        thumbnailUrl: cover?.filePath ?? null,
        thumbFocalX: cover?.focalX ?? null,
        thumbFocalY: cover?.focalY ?? null,
        thumbZoom: cover?.zoom ?? null,
        thumbRotation: cover?.rotation ?? null,
        thumbFlipH: cover?.flipH ?? null,
        thumbFlipV: cover?.flipV ?? null,
      };
    }),
    ...personalPhotos.map<Hit>((p) => ({
      key: `pip-${p.id}`,
      group: "Inventory",
      title: p.caption || p.fileName,
      subtitle: p.equipment ? `${p.equipment.name} · ${p.equipment.category}` : null,
      href: `/inventory#${p.equipmentId}`,
      targetKind: "personalEquipmentPhoto",
      targetId: p.equipmentId,
      thumbnailUrl: p.filePath,
      thumbFocalX: p.focalX,
      thumbFocalY: p.focalY,
      thumbZoom: p.zoom,
      thumbRotation: p.rotation,
      thumbFlipH: p.flipH,
      thumbFlipV: p.flipV,
    })),
  ];

  return NextResponse.json({ hits });
}
