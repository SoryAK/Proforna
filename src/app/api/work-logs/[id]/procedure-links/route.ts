/**
 * /api/work-logs/[id]/procedure-links — ADR-0030 Unit 8.
 *
 * GET  → returns { outgoing, incoming } describing every ProcedureLink
 *        row that has [id] on either endpoint, joined with the OPPOSITE
 *        endpoint's metadata (so the client can render labels without
 *        a second round-trip).
 * POST → creates a new link from [id] to body.toProcedureId. Validates
 *        relationship vocabulary, ownership of both endpoints, both
 *        endpoints kind='procedure', no self-link. Returns 409 on
 *        duplicate composite (fromProcedureId, toProcedureId, relationship).
 *
 * Owner-scoped: every row touched is checked against `getUserId()`.
 * Cross-user requests cannot enumerate or create links — the WorkLog
 * lookup filters by userId before any ProcedureLink mutation.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { deriveWorklogLabel } from "@/lib/worklog/derive-worklog-label";

/** Locked relationship vocabulary (mirrors schema docstring). */
const VALID_RELATIONSHIPS = ["prereq", "branch", "next", "related"] as const;
type Relationship = (typeof VALID_RELATIONSHIPS)[number];

function isValidRelationship(v: unknown): v is Relationship {
  return typeof v === "string" && (VALID_RELATIONSHIPS as readonly string[]).includes(v);
}

type LinkedProcedure = {
  id: string;
  title: string | null;
  contentJson: unknown;
  date: Date;
};

function toTarget(row: LinkedProcedure) {
  return {
    id: row.id,
    label: deriveWorklogLabel({
      title: row.title,
      contentJson: row.contentJson,
      date: row.date,
    }),
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Owner + kind gate before any link query — keeps cross-user / wrong-kind
  // probes from leaking information about the existence of links.
  const row = await prisma.workLog.findUnique({
    where: { id },
    select: { id: true, userId: true, kind: true },
  });
  if (!row || row.userId !== userId || row.kind !== "procedure") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const linkSelect = {
    id: true,
    fromProcedureId: true,
    toProcedureId: true,
    relationship: true,
    note: true,
    createdAt: true,
    fromProcedure: {
      select: { id: true, title: true, contentJson: true, date: true },
    },
    toProcedure: {
      select: { id: true, title: true, contentJson: true, date: true },
    },
  };

  const [outgoingRows, incomingRows] = await Promise.all([
    prisma.procedureLink.findMany({
      where: { fromProcedureId: id },
      select: linkSelect,
      orderBy: { createdAt: "desc" },
    }),
    prisma.procedureLink.findMany({
      where: { toProcedureId: id },
      select: linkSelect,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  type Row = {
    id: string;
    fromProcedureId: string;
    toProcedureId: string;
    relationship: string;
    note: string | null;
    createdAt: Date;
    fromProcedure: LinkedProcedure;
    toProcedure: LinkedProcedure;
  };

  const outgoing = (outgoingRows as Row[]).map((l) => ({
    id: l.id,
    fromProcedureId: l.fromProcedureId,
    toProcedureId: l.toProcedureId,
    relationship: l.relationship,
    note: l.note,
    createdAt: l.createdAt.toISOString(),
    target: toTarget(l.toProcedure),
  }));
  const incoming = (incomingRows as Row[]).map((l) => ({
    id: l.id,
    fromProcedureId: l.fromProcedureId,
    toProcedureId: l.toProcedureId,
    relationship: l.relationship,
    note: l.note,
    createdAt: l.createdAt.toISOString(),
    target: toTarget(l.fromProcedure),
  }));

  return NextResponse.json({ outgoing, incoming });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as { toProcedureId?: unknown; relationship?: unknown; note?: unknown };
  if (typeof b.toProcedureId !== "string" || b.toProcedureId.length === 0) {
    return NextResponse.json({ error: "toProcedureId is required" }, { status: 400 });
  }
  if (!isValidRelationship(b.relationship)) {
    return NextResponse.json(
      { error: `relationship must be one of: ${VALID_RELATIONSHIPS.join(", ")}` },
      { status: 400 },
    );
  }
  if (b.toProcedureId === id) {
    return NextResponse.json({ error: "Cannot link a procedure to itself" }, { status: 400 });
  }
  const note =
    typeof b.note === "string" && b.note.length > 0 ? b.note.slice(0, 1000) : null;

  // Single round-trip — fetch BOTH endpoints owner-scoped. This collapses
  // the "owned procedure?" check for source + target into one query, so
  // unauthorized probes cost the same as a normal hit (no timing oracle).
  const rows = await prisma.workLog.findMany({
    where: { id: { in: [id, b.toProcedureId] }, userId },
    select: { id: true, userId: true, kind: true },
  });

  const fromRow = rows.find((r) => r.id === id);
  const toRow = rows.find((r) => r.id === b.toProcedureId);

  if (!fromRow || !toRow) {
    return NextResponse.json({ error: "Procedure not found" }, { status: 404 });
  }
  if (fromRow.kind !== "procedure" || toRow.kind !== "procedure") {
    return NextResponse.json(
      { error: "Both endpoints must be procedures" },
      { status: 400 },
    );
  }

  try {
    const link = await prisma.procedureLink.create({
      data: {
        fromProcedureId: id,
        toProcedureId: b.toProcedureId,
        relationship: b.relationship,
        note,
      },
    });
    return NextResponse.json(
      {
        id: link.id,
        fromProcedureId: link.fromProcedureId,
        toProcedureId: link.toProcedureId,
        relationship: link.relationship,
        note: link.note,
        createdAt: link.createdAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2002") {
      return NextResponse.json({ error: "Link already exists" }, { status: 409 });
    }
    throw err;
  }
}
