import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

const VALID_DOC_TYPES = new Set([
  "manual", "wiring_diagram", "spec_sheet", "safety_sheet", "parts_list", "other",
]);

// GET /api/job-assets/[id]/documents
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

  const docs = await prisma.assetDocument.findMany({
    where: { assetId: id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(docs);
}

// POST /api/job-assets/[id]/documents
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
    const { title, docType, url, notes } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (!url && !body.filePath) {
      return NextResponse.json({ error: "url or filePath is required" }, { status: 400 });
    }

    const doc = await prisma.assetDocument.create({
      data: {
        assetId: id,
        title: title.trim().slice(0, 200),
        docType: VALID_DOC_TYPES.has(docType) ? docType : "other",
        url: url?.trim() || null,
        filePath: body.filePath?.trim() || null,
        notes: notes?.trim() || null,
      },
    });

    return NextResponse.json(doc, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE /api/job-assets/[id]/documents?docId=...
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
  const docId = searchParams.get("docId");
  if (!docId) return NextResponse.json({ error: "docId required" }, { status: 400 });

  const doc = await prisma.assetDocument.findUnique({ where: { id: docId } });
  if (!doc || doc.assetId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.assetDocument.delete({ where: { id: docId } });
  return NextResponse.json({ ok: true });
}
