import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { getAssetDocumentFile } from "@/lib/documents/asset-document";

// GET /api/asset-documents/[id]/file
//
// Polymorphic download endpoint for AssetDocument-backed files. The
// AssetDocument may be attached to an AssetType (type-level reference)
// or to a JobAsset (instance-level); the owner check resolves whichever
// is set and compares its userId to the session user.
//
// File-bytes resolution is delegated to `getAssetDocumentFile`, which
// covers three branches: (1) linked Document via documentId, (2) legacy
// filePath constrained to public/uploads, (3) url-only → 404 here
// (caller should follow the AssetDocument.url field directly).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Resolve the AssetDocument + its owning asset/assetType in one round-trip.
  const ad = await prisma.assetDocument.findUnique({
    where: { id },
    select: {
      id: true,
      assetType: { select: { userId: true } },
      asset: { select: { userId: true } },
    },
  });

  if (!ad) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ownerId = ad.assetType?.userId ?? ad.asset?.userId ?? null;
  if (ownerId !== userId) {
    // 404 instead of 403 to avoid revealing existence.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { bytes, mimeType, fileName } = await getAssetDocumentFile(id);
    return new NextResponse(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  } catch {
    // url-only, missing bytes, or unreadable legacy file → 404.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
