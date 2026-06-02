import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";

const ALLOWED_PROVIDERS = new Set(["ics", "github"]);

// GET /api/integrations — list this user's connections
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items = await prisma.integrationConnection.findMany({
    where: { userId },
    orderBy: [{ provider: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(items);
}

// POST /api/integrations — { provider, label?, config }
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const provider = String(body.provider ?? "").toLowerCase();
    if (!ALLOWED_PROVIDERS.has(provider)) {
      return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
    }
    const label = body.label ? String(body.label).slice(0, 80) : null;
    const config = (body.config && typeof body.config === "object") ? body.config : {};

    if (provider === "ics") {
      const url = String(config.url ?? "").trim();
      if (!/^https?:\/\//i.test(url)) {
        return NextResponse.json({ error: "ICS url must start with http(s)://" }, { status: 400 });
      }
    } else if (provider === "github") {
      const username = String(config.username ?? "").trim();
      if (!/^[a-z0-9-]{1,39}$/i.test(username)) {
        return NextResponse.json({ error: "Invalid GitHub username" }, { status: 400 });
      }
    }

    const item = await prisma.integrationConnection.create({
      data: { userId, provider, label, config },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (e: unknown) {
    const msg = (e as { code?: string; message?: string })?.code === "P2002"
      ? "A connection with that label already exists for this provider"
      : String((e as Error)?.message ?? e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// PATCH /api/integrations — { id, label?, config?, enabled? }
export async function PATCH(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const existing = await prisma.integrationConnection.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const data: { label?: string | null; config?: object; enabled?: boolean } = {};
    if (body.label !== undefined) data.label = body.label ? String(body.label).slice(0, 80) : null;
    if (body.config !== undefined && typeof body.config === "object") data.config = body.config;
    if (typeof body.enabled === "boolean") data.enabled = body.enabled;
    const item = await prisma.integrationConnection.update({ where: { id }, data });
    return NextResponse.json(item);
  } catch (e: unknown) {
    return NextResponse.json({ error: String((e as Error)?.message ?? e) }, { status: 400 });
  }
}

// DELETE /api/integrations?id=...
export async function DELETE(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const existing = await prisma.integrationConnection.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.integrationConnection.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
