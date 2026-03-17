import { NextRequest, NextResponse } from "next/server";
import { exchangeMicrosoftCode } from "@/lib/email";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(
      `${process.env.APP_URL}/email?error=no_code`
    );
  }

  try {
    const tokenData = await exchangeMicrosoftCode(code);

    if (!tokenData.access_token) {
      return NextResponse.redirect(
        `${process.env.APP_URL}/email?error=token_failed`
      );
    }

    // Get user email from Graph /me
    const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const me = (await meRes.json()) as { mail?: string; userPrincipalName?: string };
    const email = me.mail || me.userPrincipalName;

    if (!email) {
      return NextResponse.redirect(
        `${process.env.APP_URL}/email?error=no_email`
      );
    }

    const tokenExpiry = new Date(Date.now() + tokenData.expires_in * 1000);

    await prisma.emailAccount.upsert({
      where: { provider_email: { provider: "microsoft", email } },
      update: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? undefined,
        tokenExpiry,
      },
      create: {
        provider: "microsoft",
        email,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? null,
        tokenExpiry,
      },
    });

    return NextResponse.redirect(`${process.env.APP_URL}/email?connected=microsoft`);
  } catch (err) {
    console.error("Microsoft OAuth callback error:", err);
    return NextResponse.redirect(
      `${process.env.APP_URL}/email?error=oauth_failed`
    );
  }
}
