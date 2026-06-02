import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

const VALID_LINK_TYPES = new Set([
  "supplier", "video", "forum", "article", "datasheet", "other",
]);

// GET /api/job-assets/[id]/links
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const asset = await prisma.jobAsset.findUnique({ where: { id }, select: { userId: true } });
  if (!asset || asset.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const links = await prisma.assetLink.findMany({
    where: { assetId: id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(links);
}

// POST /api/job-assets/[id]/links
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const asset = await prisma.jobAsset.findUnique({ where: { id }, select: { userId: true } });
  if (!asset || asset.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { url, title, linkType, notes } = body;

    if (!url || typeof url !== "string" || !url.trim()) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }
    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const link = await prisma.assetLink.create({
      data: {
        assetId: id,
        url: url.trim(),
        title: title.trim().slice(0, 200),
        linkType: VALID_LINK_TYPES.has(linkType) ? linkType : "other",
        notes: notes?.trim() || null,
      },
    });

    return NextResponse.json(link, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE /api/job-assets/[id]/links?linkId=...
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const asset = await prisma.jobAsset.findUnique({ where: { id }, select: { userId: true } });
  if (!asset || asset.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const linkId = searchParams.get("linkId");
  if (!linkId) return NextResponse.json({ error: "linkId required" }, { status: 400 });

  const link = await prisma.assetLink.findUnique({ where: { id: linkId } });
  if (!link || link.assetId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.assetLink.delete({ where: { id: linkId } });
  return NextResponse.json({ ok: true });
}
