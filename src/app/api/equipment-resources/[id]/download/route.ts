import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

// GET — download the file attachment for a resource
export async function GET(
  _request: Request,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const resource = await prisma.equipmentResource.findUnique({
      where: { id },
      select: { fileData: true, fileName: true, fileMime: true },
    });

    if (!resource?.fileData) {
      return NextResponse.json({ error: "No file attached" }, { status: 404 });
    }

    return new Response(resource.fileData, {
      headers: {
        "Content-Type": resource.fileMime || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${(resource.fileName || "file").replace(/"/g, "'")}"`,
        "Content-Length": String(resource.fileData.length),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
