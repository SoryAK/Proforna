import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { ensureAutoLog } from "@/lib/auto-log";
import { parseIcs } from "@/lib/ics";
import { fetchGitHubPublicEvents } from "@/lib/github-events";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// POST /api/integrations/[id]/sync
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const conn = await prisma.integrationConnection.findUnique({ where: { id } });
  if (!conn || conn.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!conn.enabled) {
    return NextResponse.json({ error: "Connection is disabled" }, { status: 400 });
  }

  const since = new Date(Date.now() - NINETY_DAYS_MS);
  const config = (conn.config ?? {}) as Record<string, unknown>;
  let touched = 0;

  try {
    if (conn.provider === "ics") {
      const url = String(config.url ?? "");
      if (!/^https?:\/\//i.test(url)) throw new Error("Invalid ICS url");
      const res = await fetch(url, { headers: { "User-Agent": "Resumsify" }, cache: "no-store" });
      if (!res.ok) throw new Error(`ICS fetch ${res.status}`);
      const text = await res.text();
      const events = parseIcs(text);
      for (const ev of events) {
        if (!ev.uid || !ev.start) continue;
        if (ev.start < since) continue;
        if (ev.start.getTime() > Date.now() + ONE_DAY_MS) continue; // skip future events
        const hours = ev.end ? Math.max(0, (ev.end.getTime() - ev.start.getTime()) / 3_600_000) : undefined;
        await ensureAutoLog({
          userId,
          source: "ics",
          date: ev.start,
          title: ev.summary || "Calendar event",
          content: ev.description ?? undefined,
          hours: hours && hours > 0 ? Math.round(hours * 100) / 100 : undefined,
          externalRef: { source: "ics", id: `${conn.id}:${ev.uid}` },
        });
        touched++;
      }
    } else if (conn.provider === "github") {
      const username = String(config.username ?? "");
      if (!username) throw new Error("Missing GitHub username");
      const events = await fetchGitHubPublicEvents(username);
      for (const ev of events) {
        if (ev.date < since) continue;
        await ensureAutoLog({
          userId,
          source: "github",
          date: ev.date,
          title: ev.title,
          content: ev.url ?? undefined,
          externalRef: { source: "github", id: `${conn.id}:${ev.externalId}` },
        });
        // Lift the row to "notable" for merged PRs / releases — promotion stays manual.
        if (ev.notable) {
          await prisma.workLog.updateMany({
            where: {
              userId,
              externalSource: "github",
              externalId: `${conn.id}:${ev.externalId}`,
            },
            data: { isNotable: true },
          });
        }
        touched++;
      }
    } else {
      return NextResponse.json({ error: `Unsupported provider: ${conn.provider}` }, { status: 400 });
    }

    const updated = await prisma.integrationConnection.update({
      where: { id },
      data: {
        lastSyncedAt: new Date(),
        lastSyncStatus: "ok",
        lastSyncCount: touched,
      },
    });
    return NextResponse.json({ ok: true, touched, connection: updated });
  } catch (e: unknown) {
    const msg = String((e as Error)?.message ?? e);
    await prisma.integrationConnection.update({
      where: { id },
      data: {
        lastSyncedAt: new Date(),
        lastSyncStatus: `error: ${msg.slice(0, 200)}`,
      },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
