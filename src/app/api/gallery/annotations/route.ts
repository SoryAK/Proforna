import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitizeAnnotationHtml } from "@/lib/sanitize-html";

const VALID_KINDS = new Set(["pin", "rect", "circle", "arrow", "line", "freehand", "text", "ruler", "scale"]);
const MAX_TITLE = 200;
const MAX_BODY = 20_000; // 20KB of HTML
const MAX_GEOMETRY = 50_000; // freehand can be a lot of points

type GeometryShape =
  | { kind: "pin"; x: number; y: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number }
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "arrow"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "freehand"; points: Array<{ x: number; y: number }> };

function validateGeometry(kind: string, raw: unknown): { ok: true; json: string } | { ok: false; reason: string } {
  if (raw == null || typeof raw !== "object") return { ok: false, reason: "geometry must be an object" };
  const g = raw as Record<string, unknown>;
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const inUnit = (v: unknown) => num(v) && (v as number) >= -0.05 && (v as number) <= 1.05; // tiny slop for drawing edges
  switch (kind) {
    case "pin":
      if (!inUnit(g.x) || !inUnit(g.y)) return { ok: false, reason: "pin needs x,y in [0,1]" };
      break;
    case "rect":
      if (![g.x, g.y, g.w, g.h].every(inUnit)) return { ok: false, reason: "rect needs x,y,w,h in [0,1]" };
      break;
    case "circle":
      if (!inUnit(g.cx) || !inUnit(g.cy) || !num(g.r) || (g.r as number) <= 0)
        return { ok: false, reason: "circle needs cx,cy,r" };
      break;
    case "arrow":
      if (![g.x1, g.y1, g.x2, g.y2].every(inUnit)) return { ok: false, reason: "arrow needs x1,y1,x2,y2 in [0,1]" };
      break;
    case "line":
      if (![g.x1, g.y1, g.x2, g.y2].every(inUnit)) return { ok: false, reason: "line needs x1,y1,x2,y2 in [0,1]" };
      break;
    case "ruler":
      if (![g.x1, g.y1, g.x2, g.y2].every(inUnit)) return { ok: false, reason: "ruler needs x1,y1,x2,y2 in [0,1]" };
      break;
    case "text": {
      if (!inUnit(g.x) || !inUnit(g.y)) return { ok: false, reason: "text needs x,y in [0,1]" };
      if (typeof g.text !== "string" || g.text.length === 0 || g.text.length > 500) return { ok: false, reason: "text content 1..500 chars" };
      if (g.fontSize != null && (!num(g.fontSize) || (g.fontSize as number) < 6 || (g.fontSize as number) > 200))
        return { ok: false, reason: "text fontSize 6..200" };
      break;
    }
    case "scale": {
      if (![g.x1, g.y1, g.x2, g.y2].every(inUnit)) return { ok: false, reason: "scale needs x1,y1,x2,y2 in [0,1]" };
      if (!num(g.realWorld) || (g.realWorld as number) <= 0) return { ok: false, reason: "scale needs realWorld > 0" };
      const u = g.unit;
      if (typeof u !== "string" || !["mm", "cm", "m", "in", "ft"].includes(u)) return { ok: false, reason: "scale unit must be mm|cm|m|in|ft" };
      break;
    }
    case "freehand": {
      const pts = g.points;
      if (!Array.isArray(pts) || pts.length < 2 || pts.length > 2000)
        return { ok: false, reason: "freehand needs 2..2000 points" };
      for (const p of pts) {
        const pp = p as Record<string, unknown>;
        if (!inUnit(pp?.x) || !inUnit(pp?.y)) return { ok: false, reason: "freehand point out of range" };
      }
      break;
    }
    default:
      return { ok: false, reason: "unknown kind" };
  }
  // Optional strokeWidth on any geometry (rendered shapes use it; ignored for pin/text/scale).
  if (g.strokeWidth != null && (!num(g.strokeWidth) || (g.strokeWidth as number) < 1 || (g.strokeWidth as number) > 20)) {
    return { ok: false, reason: "strokeWidth must be 1..20" };
  }
  const json = JSON.stringify(raw);
  if (json.length > MAX_GEOMETRY) return { ok: false, reason: "geometry too large" };
  return { ok: true, json };
}

async function assertPhotoOwned(photoId: string, userId: string) {
  return prisma.galleryPhoto.findFirst({
    where: { id: photoId, workHistory: { userId } },
    select: { id: true },
  });
}

async function assertAnnotationOwned(id: string, userId: string) {
  return prisma.mediaAnnotation.findFirst({
    where: { id, photo: { workHistory: { userId } } },
    select: { id: true, photoId: true },
  });
}

// GET /api/gallery/annotations?photoId=xxx
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const photoId = searchParams.get("photoId");
  if (!photoId) return NextResponse.json({ error: "photoId required" }, { status: 400 });

  const owned = await assertPhotoOwned(photoId, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const items = await prisma.mediaAnnotation.findMany({
    where: { photoId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(items);
}

// POST /api/gallery/annotations
// body: { photoId, kind, geometry, title?, body?, color?, tags?, sortOrder?, isPrivate? }
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = checkRateLimit(`annot:post:${userId}`, { limit: 200, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rl.headers });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { photoId, kind, geometry, title, body: noteBody, color, tags, sortOrder, isPrivate } = body;
  if (!photoId || typeof photoId !== "string") return NextResponse.json({ error: "photoId required" }, { status: 400 });
  if (!VALID_KINDS.has(kind)) return NextResponse.json({ error: "invalid kind" }, { status: 400 });

  const owned = await assertPhotoOwned(photoId, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const geo = validateGeometry(kind, geometry);
  if (!geo.ok) return NextResponse.json({ error: geo.reason }, { status: 400 });

  if (title != null && (typeof title !== "string" || title.length > MAX_TITLE))
    return NextResponse.json({ error: "title too long" }, { status: 400 });
  if (noteBody != null && (typeof noteBody !== "string" || noteBody.length > MAX_BODY))
    return NextResponse.json({ error: "body too long" }, { status: 400 });

  const created = await prisma.mediaAnnotation.create({
    data: {
      photoId,
      kind,
      geometry: geo.json,
      title: title ?? null,
      body: noteBody ? sanitizeAnnotationHtml(noteBody) : null,
      color: typeof color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : "#ef4444",
      tags: Array.isArray(tags) ? JSON.stringify(tags.filter((t) => typeof t === "string").slice(0, 32)) : null,
      sortOrder: typeof sortOrder === "number" ? Math.trunc(sortOrder) : null,
      isPrivate: !!isPrivate,
    },
  });
  return NextResponse.json(created, { status: 201 });
}

// PATCH /api/gallery/annotations
// body: { id, ...partial fields } OR { reorder: [{id, sortOrder}, ...] }
export async function PATCH(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = checkRateLimit(`annot:patch:${userId}`, { limit: 600, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rl.headers });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  // Bulk reorder
  if (Array.isArray(body.reorder)) {
    const ids = body.reorder.map((r: { id: string }) => r.id).filter((x: unknown): x is string => typeof x === "string");
    if (ids.length === 0) return NextResponse.json({ success: true });
    const owned = await prisma.mediaAnnotation.findMany({
      where: { id: { in: ids }, photo: { workHistory: { userId } } },
      select: { id: true },
    });
    if (owned.length !== ids.length) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await prisma.$transaction(
      body.reorder.map((r: { id: string; sortOrder: number | null }) =>
        prisma.mediaAnnotation.update({
          where: { id: r.id },
          data: { sortOrder: r.sortOrder == null ? null : Math.trunc(r.sortOrder) },
        })
      )
    );
    return NextResponse.json({ success: true });
  }

  const { id, kind, geometry, title, body: noteBody, color, tags, sortOrder, isPrivate, expectedUpdatedAt } = body;
  if (!id || typeof id !== "string") return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await assertAnnotationOwned(id, userId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Optimistic concurrency: caller may pass the updatedAt they last saw.
  if (expectedUpdatedAt) {
    const current = await prisma.mediaAnnotation.findUnique({ where: { id }, select: { updatedAt: true } });
    if (current && new Date(expectedUpdatedAt).getTime() !== current.updatedAt.getTime()) {
      return NextResponse.json(
        { error: "Conflict", code: "stale", currentUpdatedAt: current.updatedAt },
        { status: 409 },
      );
    }
  }

  const data: Record<string, unknown> = {};
  if (kind !== undefined) {
    if (!VALID_KINDS.has(kind)) return NextResponse.json({ error: "invalid kind" }, { status: 400 });
    data.kind = kind;
  }
  if (geometry !== undefined) {
    const k = (kind as string) ?? (await prisma.mediaAnnotation.findUnique({ where: { id }, select: { kind: true } }))?.kind;
    if (!k) return NextResponse.json({ error: "kind missing" }, { status: 400 });
    const geo = validateGeometry(k, geometry);
    if (!geo.ok) return NextResponse.json({ error: geo.reason }, { status: 400 });
    data.geometry = geo.json;
  }
  if (title !== undefined) {
    if (title != null && (typeof title !== "string" || title.length > MAX_TITLE))
      return NextResponse.json({ error: "title too long" }, { status: 400 });
    data.title = title ?? null;
  }
  if (noteBody !== undefined) {
    if (noteBody != null && (typeof noteBody !== "string" || noteBody.length > MAX_BODY))
      return NextResponse.json({ error: "body too long" }, { status: 400 });
    data.body = noteBody ? sanitizeAnnotationHtml(noteBody) : null;
  }
  if (color !== undefined) {
    if (color != null && (typeof color !== "string" || !/^#[0-9a-fA-F]{3,8}$/.test(color)))
      return NextResponse.json({ error: "invalid color" }, { status: 400 });
    data.color = color ?? "#ef4444";
  }
  if (tags !== undefined) {
    data.tags = Array.isArray(tags)
      ? JSON.stringify(tags.filter((t: unknown) => typeof t === "string").slice(0, 32))
      : null;
  }
  if (sortOrder !== undefined) {
    data.sortOrder = sortOrder == null ? null : Math.trunc(sortOrder);
  }
  if (isPrivate !== undefined) data.isPrivate = !!isPrivate;

  const updated = await prisma.mediaAnnotation.update({ where: { id }, data });
  return NextResponse.json(updated);
}

// DELETE /api/gallery/annotations?id=xxx
export async function DELETE(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await assertAnnotationOwned(id, userId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.mediaAnnotation.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
