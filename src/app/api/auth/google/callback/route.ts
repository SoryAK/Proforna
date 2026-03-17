import { NextRequest, NextResponse } from "next/server";
import { getGoogleOAuth2Client } from "@/lib/email";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(
      `${process.env.APP_URL}/email?error=no_code`
    );
  }

  try {
    const client = getGoogleOAuth2Client();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Get user email
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const { data } = await oauth2.userinfo.get();
    const email = data.email;

    if (!email) {
      return NextResponse.redirect(
        `${process.env.APP_URL}/email?error=no_email`
      );
    }

    // Upsert the email account
    await prisma.emailAccount.upsert({
      where: { provider_email: { provider: "google", email } },
      update: {
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token ?? undefined,
        tokenExpiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : null,
      },
      create: {
        provider: "google",
        email,
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : null,
      },
    });

    return NextResponse.redirect(`${process.env.APP_URL}/email?connected=google`);
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return NextResponse.redirect(
      `${process.env.APP_URL}/email?error=oauth_failed`
    );
  }
}
