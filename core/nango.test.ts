import { describe, expect, it } from "vitest";
import {
  connectSessionBody,
  matchNangoIntegration,
  presentConnectLink,
  presentNangoConnection,
  presentNangoIntegrations,
} from "./nango";

const integrations = presentNangoIntegrations({
  configs: [
    { unique_key: "github", provider: "github" },
    { unique_key: "google-mail", provider: "google-mail" },
  ],
});

describe("sign-in helper", () => {
  it("matches Gmail to the mail integration and leaves an unknown name unmatched", () => {
    expect(matchNangoIntegration("gmail", integrations)?.uniqueKey).toBe("google-mail");
    expect(matchNangoIntegration("github", integrations)?.uniqueKey).toBe("github");
    expect(matchNangoIntegration("linkedin", integrations)).toBeNull();
  });

  it("builds a session for this occupant and one integration", () => {
    expect(connectSessionBody("local", "github")).toEqual({
      tags: { end_user_id: "local" },
      allowed_integrations: ["github"],
    });
    expect(connectSessionBody("local", "google-mail")).toEqual({
      tags: { end_user_id: "local" },
      allowed_integrations: ["google-mail"],
      integrations_config_defaults: {
        "google-mail": {
          authorization_params: {
            scope:
              "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose",
          },
        },
      },
    });
  });

  it("keeps the connect link on this machine", () => {
    expect(
      presentConnectLink(
        {
          data: {
            token: "sess",
            connect_link: "https://connect.nango.dev/link?session_token=sess",
            expires_at: "2026-09-30T00:00:00.000Z",
          },
        },
        "http://127.0.0.1:3009",
        "http://127.0.0.1:3003",
      ),
    ).toBe(
      "http://127.0.0.1:3009/link?session_token=sess&apiURL=http%3A%2F%2F127.0.0.1%3A3003",
    );
  });

  it("picks this occupant's newest connection", () => {
    expect(
      presentNangoConnection(
        {
          connections: [
            {
              connection_id: "old",
              provider_config_key: "github",
              created: "2026-09-29T00:00:00.000Z",
              tags: { end_user_id: "local" },
            },
            {
              connection_id: "other",
              provider_config_key: "github",
              created: "2026-09-30T00:00:00.000Z",
              tags: { end_user_id: "someone-else" },
            },
            {
              connection_id: "new",
              provider_config_key: "github",
              created: "2026-09-30T01:00:00.000Z",
              tags: { end_user_id: "local" },
            },
          ],
        },
        "local",
        "github",
      ),
    ).toEqual({ connectionId: "new" });
  });
});
