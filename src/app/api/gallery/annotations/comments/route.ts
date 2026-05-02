import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_BODY = 5000;

async function assertAnnotationOwned(annotationId: string, userId: string) {
  const annot = await prisma.mediaAnnotation.findUnique({
    where: { id: annotationId },
    select: { id: true, photo: { select: { workHistory: { select: { userId: true } } } } },
  });
  if (!annot || annot.photo?.workHistory?.userId !== userId) return null;
  return annot;
}

// GET /api/gallery/annotations/comments?annotationId=xxx
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const annotationId = searchParams.get("annotationId");
  if (!annotationId) return NextResponse.json({ error: "annotationId required" }, { status: 400 });

  const owned = await assertAnnotationOwned(annotationId, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const items = await prisma.mediaAnnotationComment.findMany({
    where: { annotationId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(items);
}

// POST { annotationId, body }
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = checkRateLimit(`annot:comment:${userId}`, { limit: 200, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rl.headers });

  const body = await request.json();
  const annotationId = body?.annotationId as string | undefined;
  const text = body?.body as string | undefined;
  if (!annotationId || typeof text !== "string") return NextResponse.json({ error: "annotationId and body required" }, { status: 400 });
  const trimmed = text.trim();
  if (trimmed.length === 0) return NextResponse.json({ error: "body cannot be empty" }, { status: 400 });
  if (trimmed.length > MAX_BODY) return NextResponse.json({ error: "body too long" }, { status: 400 });

  const owned = await assertAnnotationOwned(annotationId, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const created = await prisma.mediaAnnotationComment.create({
    data: { annotationId, authorId: userId, body: trimmed },
  });
  return NextResponse.json(created);
}

// PATCH { id, body }
export async function PATCH(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const id = body?.id as string | undefined;
  const text = body?.body as string | undefined;
  if (!id || typeof text !== "string") return NextResponse.json({ error: "id and body required" }, { status: 400 });
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_BODY) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const existing = await prisma.mediaAnnotationComment.findUnique({
    where: { id },
    select: { authorId: true, annotation: { select: { photo: { select: { workHistory: { select: { userId: true } } } } } } },
  });
  if (!existing || existing.annotation.photo?.workHistory?.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.authorId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const updated = await prisma.mediaAnnotationComment.update({ where: { id }, data: { body: trimmed } });
  return NextResponse.json(updated);
}

// DELETE ?id=xxx
export async function DELETE(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await prisma.mediaAnnotationComment.findUnique({
    where: { id },
    select: { authorId: true, annotation: { select: { photo: { select: { workHistory: { select: { userId: true } } } } } } },
  });
  if (!existing || existing.annotation.photo?.workHistory?.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.authorId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.mediaAnnotationComment.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
