import { describe, expect, it } from "vitest";
import {
  gmailAskFromCommand,
  gmailAuthorizeUrl,
  gmailOAuthClient,
  gmailRawMessage,
  gmailRedirectUri,
  prepareGmailAsk,
  presentGmailAsk,
  readGmailMessage,
  readGmailThreads,
  readGmailToken,
} from "./gmail";

describe("gmail connection", () => {
  it("builds a sign-in address for the occupant's own client", () => {
    const url = new URL(
      gmailAuthorizeUrl({
        clientId: "client",
        redirectUri: gmailRedirectUri(42813),
        state: "state",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:42813/oauth2callback");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")).toContain("gmail.readonly");
    expect(url.searchParams.get("scope")).toContain("gmail.compose");
  });

  it("keeps a refresh token and reads a plain message", () => {
    expect(readGmailToken({ access_token: "access", refresh_token: "refresh" })).toEqual({
      accessToken: "access",
      refreshToken: "refresh",
    });
    expect(readGmailToken({ access_token: "access" })).toBeNull();
    expect(readGmailThreads({ threads: [{ id: "t1", snippet: "Hello" }] })).toEqual([
      { id: "t1", snippet: "Hello" },
    ]);
    const raw = gmailRawMessage({ to: "a@example.com", subject: "Hi", body: "There" });
    expect(raw).not.toContain("+");
    expect(raw).not.toContain("/");
    const message = readGmailMessage({
      id: "m1",
      snippet: "There",
      payload: {
        headers: [
          { name: "From", value: "Ada <a@example.com>" },
          { name: "Subject", value: "Hi" },
        ],
        mimeType: "text/plain",
        body: { data: btoa("There") },
      },
    });
    expect(message).toMatchObject({
      id: "m1",
      from: "Ada <a@example.com>",
      subject: "Hi",
    });
    expect(message?.body).toContain("There");
  });

  it("names a missing oauth client and refuses a fixed mailbox window", () => {
    expect(gmailOAuthClient({})).toEqual({
      ok: false,
      missing: ["GMAIL_OAUTH_CLIENT_ID", "GMAIL_OAUTH_CLIENT_SECRET"],
    });
    expect(
      gmailOAuthClient({
        GMAIL_OAUTH_CLIENT_ID: "client",
        GMAIL_OAUTH_CLIENT_SECRET: "secret",
      }),
    ).toEqual({ ok: true, clientId: "client", clientSecret: "secret" });
    expect(prepareGmailAsk({ query: "in:inbox" })).toEqual({
      ok: false,
      error: "query-required",
    });
    expect(prepareGmailAsk({ query: "newer_than:2y" })).toEqual({
      ok: false,
      error: "query-required",
    });
    expect(prepareGmailAsk({ query: "Northstar offer" })).toEqual({
      ok: true,
      query: "Northstar offer",
    });
    expect(gmailAskFromCommand("What should I capture next?")).toEqual({ asked: false });
    expect(gmailAskFromCommand("Search my Gmail for the Northstar offer")).toEqual({
      asked: true,
      query: "the Northstar offer",
    });
    expect(gmailAskFromCommand("Check inbox")).toEqual({ asked: true, query: "" });
    expect(presentGmailAsk({ status: "query-required" })).toContain("does not search");
    expect(
      presentGmailAsk({
        status: "found",
        threads: [{ id: "t1", snippet: "Offer letter" }],
      }),
    ).toContain("Nothing was added");
  });
});
