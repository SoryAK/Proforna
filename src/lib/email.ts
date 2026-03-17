import { google } from "googleapis";

// ─── Google OAuth ──────────────────────────────────────────────

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function getGoogleOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.APP_URL}/api/auth/google/callback`
  );
}

export function getGoogleAuthUrl() {
  const client = getGoogleOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
  });
}

// ─── Microsoft OAuth ──────────────────────────────────────────

const MS_SCOPES = ["openid", "email", "Mail.Read", "offline_access"];
const MS_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0";

export function getMicrosoftAuthUrl() {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    response_type: "code",
    redirect_uri: `${process.env.APP_URL}/api/auth/microsoft/callback`,
    scope: MS_SCOPES.join(" "),
    response_mode: "query",
    prompt: "consent",
  });
  return `${MS_AUTH_URL}/authorize?${params}`;
}

export async function exchangeMicrosoftCode(code: string) {
  const res = await fetch(`${MS_AUTH_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      code,
      redirect_uri: `${process.env.APP_URL}/api/auth/microsoft/callback`,
      grant_type: "authorization_code",
    }),
  });
  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    id_token?: string;
  }>;
}

export async function refreshMicrosoftToken(refreshToken: string) {
  const res = await fetch(`${MS_AUTH_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: MS_SCOPES.join(" "),
    }),
  });
  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }>;
}

// ─── Token helpers ─────────────────────────────────────────────

export async function getValidGoogleToken(account: {
  accessToken: string;
  refreshToken: string | null;
  tokenExpiry: Date | null;
}) {
  const client = getGoogleOAuth2Client();
  client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
  });

  // Refresh if expired or about to expire within 5 min
  if (
    account.tokenExpiry &&
    account.tokenExpiry.getTime() - Date.now() < 5 * 60 * 1000
  ) {
    const { credentials } = await client.refreshAccessToken();
    return {
      client,
      newAccessToken: credentials.access_token!,
      newExpiry: credentials.expiry_date
        ? new Date(credentials.expiry_date)
        : null,
    };
  }

  return { client, newAccessToken: null, newExpiry: null };
}
