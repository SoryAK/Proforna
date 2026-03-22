import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const VALID_TYPES = ["manual", "troubleshooting", "operations", "safety", "maintenance", "parts", "training"];

// PUT — update a resource (FormData with optional file replacement)
export async function PUT(
  request: Request,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const formData = await request.formData();
    const title = formData.get("title") as string | null;
    const type = formData.get("type") as string | null;
    const content = formData.get("content") as string | null;
    const url = formData.get("url") as string | null;
    const file = formData.get("file") as File | null;
    const removeFile = formData.get("removeFile") === "true";

    const data: Record<string, unknown> = {
      type: VALID_TYPES.includes(type ?? "") ? type : undefined,
      title,
      content: content ?? null,
      url: url ?? null,
    };

    if (file && file.size > 0) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: "File must be under 10 MB" }, { status: 400 });
      }
      const ab = await file.arrayBuffer() as ArrayBuffer;
      data.fileData = new Uint8Array(ab);
      data.fileName = file.name;
      data.fileMime = file.type || "application/octet-stream";
    } else if (removeFile) {
      data.fileData = null;
      data.fileName = null;
      data.fileMime = null;
    }

    const resource = await prisma.equipmentResource.update({ where: { id }, data });
    const { fileData: _fd, ...rest } = resource;
    return NextResponse.json({ ...rest, hasFile: !!_fd });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE — remove a resource
export async function DELETE(
  _request: Request,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    await prisma.equipmentResource.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
