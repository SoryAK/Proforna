import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ALLOWED_FIELDS = new Set(["title", "content", "tags", "hours"]);

function isMissingWorkLogDraftTableError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2021"
  );
}

export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const workLogId = searchParams.get("workLogId");
  if (!workLogId) {
    return NextResponse.json({ error: "workLogId is required" }, { status: 400 });
  }

  const workLog = await prisma.workLog.findFirst({
    where: { id: workLogId, userId },
    select: { id: true },
  });
  if (!workLog) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date();

  try {
    // Lazy prune expired drafts for this note before loading current rows.
    await prisma.workLogDraft.deleteMany({
      where: {
        userId,
        workLogId,
        expiresAt: { lt: now },
      },
    });

    const drafts = await prisma.workLogDraft.findMany({
      where: { userId, workLogId },
      select: {
        field: true,
        valueJson: true,
        updatedAt: true,
        expiresAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(drafts);
  } catch (error) {
    if (isMissingWorkLogDraftTableError(error)) {
      return NextResponse.json([]);
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const workLogId = body.workLogId as string | undefined;
    const field = body.field as string | undefined;
    const value = body.value;

    if (!workLogId || !field) {
      return NextResponse.json({ error: "workLogId and field are required" }, { status: 400 });
    }
    if (!ALLOWED_FIELDS.has(field)) {
      return NextResponse.json({ error: "Invalid draft field" }, { status: 400 });
    }

    const workLog = await prisma.workLog.findFirst({
      where: { id: workLogId, userId },
      select: { id: true },
    });
    if (!workLog) return NextResponse.json({ error: "Not found" }, { status: 404 });

    try {
      const row = await prisma.workLogDraft.upsert({
        where: {
          userId_workLogId_field: {
            userId,
            workLogId,
            field,
          },
        },
        create: {
          userId,
          workLogId,
          field,
          valueJson: value,
          expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
        },
        update: {
          valueJson: value,
          expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
        },
        select: {
          field: true,
          valueJson: true,
          updatedAt: true,
          expiresAt: true,
        },
      });

      return NextResponse.json(row);
    } catch (error) {
      if (isMissingWorkLogDraftTableError(error)) {
        return NextResponse.json({
          field,
          valueJson: value,
          updatedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + DRAFT_TTL_MS).toISOString(),
        });
      }
      throw error;
    }
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const workLogId = searchParams.get("workLogId");
  const field = searchParams.get("field");

  if (!workLogId) {
    return NextResponse.json({ error: "workLogId is required" }, { status: 400 });
  }
  if (field && !ALLOWED_FIELDS.has(field)) {
    return NextResponse.json({ error: "Invalid draft field" }, { status: 400 });
  }

  const workLog = await prisma.workLog.findFirst({
    where: { id: workLogId, userId },
    select: { id: true },
  });
  if (!workLog) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await prisma.workLogDraft.deleteMany({
      where: {
        userId,
        workLogId,
        ...(field ? { field } : {}),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isMissingWorkLogDraftTableError(error)) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
