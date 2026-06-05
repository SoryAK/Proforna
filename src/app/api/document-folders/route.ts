import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { Prisma } from "@prisma/client";

const NAME_MAX = 120;

function isValidName(name: unknown): name is string {
  return typeof name === "string" && name.trim().length > 0 && name.length <= NAME_MAX;
}

/**
 * GET /api/document-folders
 * Returns ALL folders for the user (flat list — client builds the tree).
 * Each folder includes _count so the UI can render sibling/child counts.
 */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const folders = await prisma.documentFolder.findMany({
    where: { userId },
    orderBy: [{ parentId: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      parentId: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { children: true, documents: true } },
    },
  });

  return NextResponse.json(folders);
}

/**
 * POST /api/document-folders
 * Body: { name: string, parentId?: string | null }
 * Sibling-name uniqueness is enforced by the DB (composite unique + partial unique for root).
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, parentId } = (body ?? {}) as { name?: unknown; parentId?: unknown };
  if (!isValidName(name)) {
    return NextResponse.json({ error: "Invalid folder name" }, { status: 400 });
  }
  const trimmed = name.trim();
  const resolvedParentId =
    typeof parentId === "string" && parentId.length > 0 ? parentId : null;

  // If a parent is given, verify it belongs to this user.
  if (resolvedParentId) {
    const parent = await prisma.documentFolder.findFirst({
      where: { id: resolvedParentId, userId },
      select: { id: true },
    });
    if (!parent) {
      return NextResponse.json({ error: "Parent folder not found" }, { status: 404 });
    }
  }

  try {
    const folder = await prisma.documentFolder.create({
      data: { userId, name: trimmed, parentId: resolvedParentId },
      select: {
        id: true,
        name: true,
        parentId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json(folder, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "A folder with that name already exists here" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
  }
}
