import { describe, expect, it } from "vitest";
import { parseGmailMessage } from "./gmail";

describe("Gmail message parsing", () => {
  it("reads the plain-text part and the From header", () => {
    const body = Buffer.from("Your interview is on March 4, 2026.").toString("base64url");
    const parsed = parseGmailMessage({
      id: "m-int",
      internalDate: "1772380800000",
      snippet: "snippet",
      payload: {
        mimeType: "multipart/alternative",
        headers: [
          { name: "From", value: "Alex Rivera <alex@northstar.example>" },
          { name: "Subject", value: "Interview invitation: Staff Engineer at Northstar" },
        ],
        parts: [
          { mimeType: "text/plain", body: { data: body } },
          {
            mimeType: "text/html",
            body: { data: Buffer.from("<p>html</p>").toString("base64url") },
          },
        ],
      },
    });
    expect(parsed).toMatchObject({
      providerMessageId: "m-int",
      fromName: "Alex Rivera",
      fromEmail: "alex@northstar.example",
      subject: "Interview invitation: Staff Engineer at Northstar",
      body: "Your interview is on March 4, 2026.",
    });
    expect(parsed?.receivedAt).toBe(new Date(1772380800000).toISOString());
  });
});