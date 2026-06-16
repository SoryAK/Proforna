/**
 * DELETE /api/work-logs/[id]/procedure-links/[linkId] — ADR-0030 Unit 8.
 *
 * Removes a single ProcedureLink row. Authorization gate:
 *   1. user must be signed in (401 otherwise)
 *   2. the link must exist (404 otherwise — also masks cross-user probes)
 *   3. the link's `fromProcedureId` must equal the URL `[id]` (404
 *      otherwise — guards against URL parameter tampering)
 *   4. the link's source procedure must be owned by the user (404
 *      otherwise — same masking treatment as above)
 *
 * Note: only the source-procedure side has authority to remove a link.
 * If a user wants to remove an incoming link from someone else's owned
 * procedure (impossible today since both endpoints must be the same
 * user's procedures, but enforced anyway), they would need to re-issue
 * the request from the source's id.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; linkId: string }> },
) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, linkId } = await params;

  const link = await prisma.procedureLink.findUnique({
    where: { id: linkId },
    select: {
      id: true,
      fromProcedureId: true,
      toProcedureId: true,
      fromProcedure: { select: { userId: true } },
    },
  });

  if (!link) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (link.fromProcedureId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (link.fromProcedure.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.procedureLink.delete({ where: { id: linkId } });
  return new NextResponse(null, { status: 204 });
}
