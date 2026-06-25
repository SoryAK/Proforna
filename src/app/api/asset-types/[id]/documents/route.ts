import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { createDocument } from "@/lib/documents/storage";
import {
  attachDocument,
  VALID_DOC_TYPES,
} from "@/lib/documents/asset-document";

// GET /api/asset-types/[id]/documents
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const type = await prisma.assetType.findUnique({ where: { id }, select: { userId: true } });
  if (!type || type.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const docs = await prisma.assetDocument.findMany({
    where: { assetTypeId: id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(docs);
}

// POST /api/asset-types/[id]/documents
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const type = await prisma.assetType.findUnique({ where: { id }, select: { userId: true } });
  if (!type || type.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";

    // ── Branch A: multipart/form-data ─ file upload via storage service ──
    if (contentType.startsWith("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const title = (form.get("title") as string | null)?.trim();
      const docType = (form.get("docType") as string | null) ?? undefined;
      const notes = (form.get("notes") as string | null)?.trim() || null;

      if (!(file instanceof File)) {
        return NextResponse.json({ error: "file is required" }, { status: 400 });
      }
      if (!title) {
        return NextResponse.json({ error: "title is required" }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const doc = await createDocument({
        userId,
        name: title,
        fileName: file.name,
        mimeType: file.type,
        bytes: buffer,
        category: "asset_document",
        entityType: "AssetType",
        entityId: id,
        notes,
        folderId: null,
        // ADR-0050 β1.3: asset-document uploads are the manuals pipeline
        // entry point. The createDocument helper no-ops the enqueue when
        // the MIME isn't extractable (e.g. wiring diagrams as PNGs).
        enqueueExtractJob: true,
      });
      const assetDoc = await attachDocument({
        assetTypeId: id,
        documentId: doc.id,
        title,
        docType,
        notes,
      });
      return NextResponse.json(assetDoc, { status: 201 });
    }

    // ── Branch B: application/json ─ url-only reference (legacy shape) ──
    const body = await request.json();
    const { title, docType, url, notes } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    const doc = await prisma.assetDocument.create({
      data: {
        assetTypeId: id,
        title: title.trim().slice(0, 200),
        docType: VALID_DOC_TYPES.has(docType) ? docType : "other",
        url: url.trim(),
        notes: notes?.trim() || null,
      },
    });

    return NextResponse.json(doc, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE /api/asset-types/[id]/documents?docId=...
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const type = await prisma.assetType.findUnique({ where: { id }, select: { userId: true } });
  if (!type || type.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const docId = searchParams.get("docId");
  if (!docId) return NextResponse.json({ error: "docId required" }, { status: 400 });

  const doc = await prisma.assetDocument.findUnique({ where: { id: docId } });
  if (!doc || doc.assetTypeId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.assetDocument.delete({ where: { id: docId } });
  return NextResponse.json({ ok: true });
}
