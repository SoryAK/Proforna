import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// GET — list resources for an equipment item
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const equipmentId = searchParams.get("equipmentId");

  if (!equipmentId) {
    return NextResponse.json({ error: "equipmentId required" }, { status: 400 });
  }

  const resources = await prisma.equipmentResource.findMany({
    where: { equipmentId },
    orderBy: [{ type: "asc" }, { createdAt: "desc" }],
  });

  // Strip binary fileData from list response (just send metadata)
  const items = resources.map(({ fileData, ...rest }) => ({
    ...rest,
    hasFile: !!fileData,
  }));

  return NextResponse.json(items);
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const VALID_TYPES = ["manual", "troubleshooting", "operations", "safety", "maintenance", "parts", "training"];

// POST — create a resource (FormData with optional file upload)
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await request.formData();
    const equipmentId = formData.get("equipmentId") as string | null;
    const title = formData.get("title") as string | null;
    const type = formData.get("type") as string | null;
    const content = formData.get("content") as string | null;
    const url = formData.get("url") as string | null;
    const file = formData.get("file") as File | null;

    if (!equipmentId || !title) {
      return NextResponse.json({ error: "equipmentId and title are required" }, { status: 400 });
    }

    const resourceType = VALID_TYPES.includes(type ?? "") ? type! : "manual";

    let fileData: Uint8Array<ArrayBuffer> | null = null;
    let fileName: string | null = null;
    let fileMime: string | null = null;

    if (file && file.size > 0) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: "File must be under 10 MB" }, { status: 400 });
      }
      const ab = await file.arrayBuffer() as ArrayBuffer;
      fileData = new Uint8Array(ab);
      fileName = file.name;
      fileMime = file.type || "application/octet-stream";
    }

    const resource = await prisma.equipmentResource.create({
      data: {
        equipmentId,
        type: resourceType,
        title,
        content: content || null,
        url: url || null,
        fileData,
        fileName,
        fileMime,
      },
    });

    const { fileData: _fd, ...rest } = resource;
    return NextResponse.json({ ...rest, hasFile: !!_fd }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
