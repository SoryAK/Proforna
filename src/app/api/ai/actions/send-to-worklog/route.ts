/**
 * `send-to-worklog` action route — ADR-0046 Phase D.2.
 *
 * v1 baseline: ALWAYS creates a new WorkLog with `kind: "note"`. The ADR's
 * "prepend to active worklog editor" UX is a client-side concern (the
 * editor would consume a `?ai-prepend=<base64>` query param on mount) and
 * is deferred to a follow-up after D.3 ships so we don't conflate
 * backend-create semantics with editor-prepend semantics in one route.
 *
 * Owner-scoped: the new note's `userId` is set from the auth context,
 * never trusted from the client.
 */

import { NextResponse } from "next/server";

import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

interface RequestBody {
  content?: string;
  title?: string;
}

const TITLE_MAX_LENGTH = 80;

/**
 * Derive a title from the content when the caller doesn't supply one.
 * Picks the first non-empty trimmed line and truncates it at
 * `TITLE_MAX_LENGTH` characters.
 */
function deriveTitle(content: string): string {
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return trimmed.slice(0, TITLE_MAX_LENGTH);
    }
  }
  return "From AI Chat";
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "Content required" }, { status: 400 });
  }

  const requestedTitle =
    typeof body.title === "string" ? body.title.trim() : "";
  const title =
    requestedTitle.length > 0
      ? requestedTitle.slice(0, TITLE_MAX_LENGTH)
      : deriveTitle(content);

  const note = await prisma.workLog.create({
    data: {
      userId,
      title,
      content,
      date: new Date(),
      category: "task",
      kind: "note",
    },
    select: { id: true, title: true },
  });

  return NextResponse.json({ id: note.id, title: note.title });
}
