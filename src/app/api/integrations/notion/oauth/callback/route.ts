import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { encryptToken } from "@/lib/integration-crypto";

/**
 * GET /api/integrations/notion/oauth/callback
 *
 * Step 2 of the Notion OAuth flow (see ADR-0018):
 *   1. Verify state cookie matches `?state=` (CSRF defense).
 *   2. Exchange `?code=` for an access token via Notion's token endpoint.
 *   3. Encrypt the access token and upsert an IntegrationConnection row.
 *   4. Redirect back to /integrations with a status flag.
 *
 * NEVER log raw tokens. Error redirects carry an opaque `error` slug only.
 */
export async function GET(req: NextRequest) {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const back = (slug: string) =>
    NextResponse.redirect(`${appUrl}/integrations?notion=${slug}`);

  const userId = await getUserId();
  if (!userId) {
    return NextResponse.redirect(`${appUrl}/login?next=/integrations`);
  }

  const code = req.nextUrl.searchParams.get("code");
  const stateParam = req.nextUrl.searchParams.get("state");
  const errorParam = req.nextUrl.searchParams.get("error");

  if (errorParam) {
    // User cancelled or Notion rejected the request — treat as a benign decline.
    return back(`error=${encodeURIComponent(errorParam).slice(0, 64)}`);
  }
  if (!code || !stateParam) {
    return back("error=missing_params");
  }

  // CSRF defense: compare to the cookie we set in /start.
  const cookieStore = await cookies();
  const stored = cookieStore.get("notion_oauth_state")?.value;
  cookieStore.delete("notion_oauth_state");
  if (!stored || stored !== stateParam) {
    return back("error=state_mismatch");
  }

  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;
  const redirectUri = process.env.NOTION_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return back("error=not_configured");
  }

  let token: NotionTokenResponse;
  try {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("Notion token exchange failed", res.status);
      return back("error=token_exchange_failed");
    }
    token = (await res.json()) as NotionTokenResponse;
  } catch (e) {
    console.error("Notion token exchange threw", (e as Error).message);
    return back("error=token_exchange_failed");
  }

  if (!token.access_token) {
    return back("error=no_access_token");
  }

  const accessTokenCt = encryptToken(token.access_token);
  const workspaceName = token.workspace_name ?? "Notion";
  const workspaceId = token.workspace_id ?? null;
  const botId = token.bot_id ?? null;

  const config = {
    tokenRef: {
      version: "v1" as const,
      accessToken: accessTokenCt,
      // Notion public integrations don't return refresh tokens today; reserve
      // the slot so 6C (OneDrive) can drop into the same shape.
      refreshToken: null,
      expiresAt: null,
      scope: null,
    },
    workspaceId,
    workspaceName,
    botId,
  };

  // Upsert: a user reconnecting the same workspace overwrites the prior row.
  // The unique key is (userId, provider, label) — label is workspace name.
  try {
    const existing = await prisma.integrationConnection.findFirst({
      where: { userId, provider: "notion", label: workspaceName },
    });
    if (existing) {
      await prisma.integrationConnection.update({
        where: { id: existing.id },
        data: { config, enabled: true, lastSyncStatus: null },
      });
    } else {
      await prisma.integrationConnection.create({
        data: {
          userId,
          provider: "notion",
          label: workspaceName,
          config,
        },
      });
    }
  } catch (e) {
    console.error("Notion connection upsert failed", (e as Error).message);
    return back("error=db_write_failed");
  }

  return back("connected");
}

type NotionTokenResponse = {
  access_token?: string;
  workspace_id?: string;
  workspace_name?: string;
  bot_id?: string;
  owner?: unknown;
  duplicated_template_id?: string | null;
};
