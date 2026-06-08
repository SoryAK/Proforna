import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { getUserId } from "@/lib/auth-utils";

/**
 * GET /api/integrations/notion/oauth/start
 *
 * Step 1 of the Notion OAuth flow (see ADR-0018):
 *   1. Verify the caller is signed in.
 *   2. Generate a random state nonce, store it in a short-lived httpOnly
 *      cookie, and include it in the authorize URL.
 *   3. Redirect the browser to Notion's authorize endpoint.
 *
 * The callback verifies cookie === query param to defeat CSRF.
 */
export async function GET() {
  const userId = await getUserId();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  if (!userId) {
    return NextResponse.redirect(`${appUrl}/login?next=/integrations`);
  }

  const clientId = process.env.NOTION_CLIENT_ID;
  const redirectUri = process.env.NOTION_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.redirect(`${appUrl}/integrations?notion=error%3Dnot_configured`);
  }

  const state = randomBytes(32).toString("base64url");

  const cookieStore = await cookies();
  cookieStore.set({
    name: "notion_oauth_state",
    value: state,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // 10 minutes
  });

  const authorize = new URL("https://api.notion.com/v1/oauth/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("owner", "user");
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("state", state);

  return NextResponse.redirect(authorize.toString());
}
