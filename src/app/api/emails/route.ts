import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { google } from "googleapis";
import {
  getValidGoogleToken,
  refreshMicrosoftToken,
} from "@/lib/email";

// GET — list synced emails (with optional account filter + pagination)
export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("accountId");
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 50));
  const search = req.nextUrl.searchParams.get("q") ?? "";

  const where: Record<string, unknown> = {};
  if (accountId) where.accountId = accountId;
  if (search) {
    where.OR = [
      { subject: { contains: search } },
      { sender: { contains: search } },
      { snippet: { contains: search } },
    ];
  }

  const [emails, total] = await Promise.all([
    prisma.email.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { account: { select: { provider: true, email: true } } },
    }),
    prisma.email.count({ where }),
  ]);

  return NextResponse.json({ emails, total, page, limit });
}

// POST — trigger sync for an account (body: { accountId })
export async function POST(req: NextRequest) {
  const { accountId } = (await req.json()) as { accountId: string };
  if (!accountId) {
    return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
  }

  const account = await prisma.emailAccount.findUnique({
    where: { id: accountId },
  });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  try {
    let synced = 0;
    if (account.provider === "google") {
      synced = await syncGmail(account);
    } else if (account.provider === "microsoft") {
      synced = await syncOutlook(account);
    }
    return NextResponse.json({ ok: true, synced });
  } catch (err) {
    console.error("Email sync error:", err);
    return NextResponse.json(
      { error: "Sync failed", details: String(err) },
      { status: 500 }
    );
  }
}

// ─── Gmail sync ────────────────────────────────────────────────

interface GmailAccount {
  id: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiry: Date | null;
}

async function syncGmail(account: GmailAccount) {
  const { client, newAccessToken, newExpiry } =
    await getValidGoogleToken(account);

  // Persist refreshed token
  if (newAccessToken) {
    await prisma.emailAccount.update({
      where: { id: account.id },
      data: {
        accessToken: newAccessToken,
        ...(newExpiry ? { tokenExpiry: newExpiry } : {}),
      },
    });
  }

  const gmail = google.gmail({ version: "v1", auth: client });

  // Get latest 100 message IDs
  const list = await gmail.users.messages.list({
    userId: "me",
    maxResults: 100,
  });

  const messageIds = (list.data.messages ?? []).map((m) => m.id!);
  if (!messageIds.length) return 0;

  // Filter out already-synced
  const existing = await prisma.email.findMany({
    where: { accountId: account.id, messageId: { in: messageIds } },
    select: { messageId: true },
  });
  const existingSet = new Set(existing.map((e) => e.messageId));
  const newIds = messageIds.filter((id) => !existingSet.has(id));

  // Fetch & store new messages (batch in parallel of 10)
  let synced = 0;
  for (let i = 0; i < newIds.length; i += 10) {
    const batch = newIds.slice(i, i + 10);
    const results = await Promise.all(
      batch.map((mid) =>
        gmail.users.messages.get({
          userId: "me",
          id: mid,
          format: "full",
        })
      )
    );

    const records = results.map((r) => {
      const msg = r.data;
      const headers = msg.payload?.headers ?? [];
      const header = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
          ?.value ?? "";

      // Extract text body
      let body = "";
      const parts = msg.payload?.parts ?? [];
      const textPart =
        parts.find((p) => p.mimeType === "text/plain") ?? msg.payload;
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, "base64url").toString("utf-8");
      }

      return {
        accountId: account.id,
        messageId: msg.id!,
        subject: header("Subject") || null,
        sender: header("From"),
        recipient: header("To") || null,
        date: new Date(header("Date") || msg.internalDate || Date.now()),
        snippet: msg.snippet || null,
        body: body || null,
        isRead: !(msg.labelIds ?? []).includes("UNREAD"),
        labels: (msg.labelIds ?? []).join(","),
      };
    });

    await prisma.email.createMany({ data: records });
    synced += records.length;
  }

  return synced;
}

// ─── Outlook (Microsoft Graph) sync ────────────────────────────

interface OutlookAccount {
  id: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiry: Date | null;
}

async function syncOutlook(account: OutlookAccount) {
  let accessToken = account.accessToken;

  // Refresh if expired
  if (
    account.tokenExpiry &&
    account.refreshToken &&
    account.tokenExpiry.getTime() - Date.now() < 5 * 60 * 1000
  ) {
    const refreshed = await refreshMicrosoftToken(account.refreshToken);
    accessToken = refreshed.access_token;
    await prisma.emailAccount.update({
      where: { id: account.id },
      data: {
        accessToken,
        refreshToken: refreshed.refresh_token ?? account.refreshToken,
        tokenExpiry: new Date(Date.now() + refreshed.expires_in * 1000),
      },
    });
  }

  // Fetch latest 100 messages
  const res = await fetch(
    "https://graph.microsoft.com/v1.0/me/messages?$top=100&$orderby=receivedDateTime desc&$select=id,subject,from,toRecipients,receivedDateTime,bodyPreview,body,isRead,categories",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    throw new Error(`Graph API ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    value: Array<{
      id: string;
      subject?: string;
      from?: { emailAddress?: { address?: string; name?: string } };
      toRecipients?: Array<{ emailAddress?: { address?: string } }>;
      receivedDateTime?: string;
      bodyPreview?: string;
      body?: { content?: string; contentType?: string };
      isRead?: boolean;
      categories?: string[];
    }>;
  };

  const messages = data.value ?? [];
  if (!messages.length) return 0;

  // Filter existing
  const msgIds = messages.map((m) => m.id);
  const existing = await prisma.email.findMany({
    where: { accountId: account.id, messageId: { in: msgIds } },
    select: { messageId: true },
  });
  const existingSet = new Set(existing.map((e) => e.messageId));
  const newMsgs = messages.filter((m) => !existingSet.has(m.id));

  if (!newMsgs.length) return 0;

  const records = newMsgs.map((m) => ({
    accountId: account.id,
    messageId: m.id,
    subject: m.subject || null,
    sender: m.from?.emailAddress?.address || "unknown",
    recipient: m.toRecipients?.[0]?.emailAddress?.address || null,
    date: m.receivedDateTime ? new Date(m.receivedDateTime) : new Date(),
    snippet: m.bodyPreview || null,
    body: m.body?.content || null,
    isRead: m.isRead ?? false,
    labels: (m.categories ?? []).join(","),
  }));

  await prisma.email.createMany({ data: records });
  return records.length;
}
