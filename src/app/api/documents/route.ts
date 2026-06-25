import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { createDocument } from "@/lib/documents/storage";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
];

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");
  const folderIdParam = searchParams.get("folderId");

  // Always scope to the authenticated user — fixes horizontal privilege escalation.
  const where: Record<string, unknown> = { userId };
  if (category) where.category = category;
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  // folderId param semantics:
  //   absent       → return docs across all folders (used by search/global views)
  //   "root"       → return docs at root only (folderId IS NULL)
  //   "<uuid>"     → return docs in that folder
  if (folderIdParam === "root") {
    where.folderId = null;
  } else if (folderIdParam) {
    where.folderId = folderIdParam;
  }

  const docs = await prisma.document.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      fileName: true,
      fileSize: true,
      mimeType: true,
      category: true,
      entityType: true,
      entityId: true,
      folderId: true,
      notes: true,
      createdAt: true,
    },
  });

  return NextResponse.json(docs);
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const name = formData.get("name") as string | null;
    const category = (formData.get("category") as string) || "other";
    const entityType = formData.get("entityType") as string | null;
    const entityId = formData.get("entityId") as string | null;
    const notes = formData.get("notes") as string | null;
    const folderIdRaw = formData.get("folderId") as string | null;
    const folderId = folderIdRaw && folderIdRaw !== "root" ? folderIdRaw : null;

    // If folderId is provided, verify it belongs to this user (prevents cross-user folder targeting).
    if (folderId) {
      const folder = await prisma.documentFolder.findFirst({
        where: { id: folderId, userId },
        select: { id: true },
      });
      if (!folder) {
        return NextResponse.json({ error: "Folder not found" }, { status: 404 });
      }
    }

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File exceeds 10 MB limit" }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `File type ${file.type} not allowed` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // ADR-0051 sprint α' commit 2: new uploads go to disk via the storage
    // service. The `data` column is left null on every new row; only legacy
    // pre-substrate documents still carry inline base64.
    const doc = await createDocument({
      userId,
      name: name || file.name,
      fileName: file.name,
      mimeType: file.type,
      bytes: buffer,
      category,
      entityType: entityType || null,
      entityId: entityId || null,
      notes: notes || null,
      folderId,
    });

    await logActivity("document", doc.id, "created", `Uploaded document: ${doc.name}`);

    return NextResponse.json(doc, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
