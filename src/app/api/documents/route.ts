import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { NextRequest, NextResponse } from "next/server";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

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
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");

  const where: Record<string, string> = {};
  if (category) where.category = category;
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;

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
      notes: true,
      createdAt: true,
    },
  });

  return NextResponse.json(docs);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const name = formData.get("name") as string | null;
    const category = (formData.get("category") as string) || "other";
    const entityType = formData.get("entityType") as string | null;
    const entityId = formData.get("entityId") as string | null;
    const notes = formData.get("notes") as string | null;

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
    const base64 = buffer.toString("base64");

    const doc = await prisma.document.create({
      data: {
        name: name || file.name,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        data: base64,
        category,
        entityType: entityType || null,
        entityId: entityId || null,
        notes: notes || null,
      },
    });

    await logActivity("document", doc.id, "created", `Uploaded document: ${doc.name}`);

    return NextResponse.json(doc, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
