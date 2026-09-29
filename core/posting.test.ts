import { describe, expect, it } from "vitest";
import { postingFromPage } from "./posting";

const page = `<!doctype html>
<html>
  <head>
    <title>Careers | Northstar</title>
    <script>window.secret = "do-not-keep";</script>
  </head>
  <body>
    <h1>Careers</h1>
    <h2>Lead Electrician</h2>
    <p>Location: Clifton Heights, PA</p>
    <p>Run commercial fit-out and read blueprints daily.</p>
  </body>
</html>`;

describe("posting from a saved page", () => {
  it("fills the same posting a listing search already shows", () => {
    expect(
      postingFromPage({
        organization: "Northstar",
        url: "https://northstar.example/careers",
        html: page,
        query: "electrician",
        place: "Clifton Heights",
      }),
    ).toMatchObject({
      id: "page:https://northstar.example/careers",
      title: "Lead Electrician",
      organization: "Northstar",
      location: "Clifton Heights, PA",
      url: "https://northstar.example/careers",
      latitude: null,
      longitude: null,
    });
    const posting = postingFromPage({
      organization: "Northstar",
      url: "https://northstar.example/careers",
      html: page,
      query: "electrician",
    });
    expect(posting?.description).toContain("read blueprints daily");
    expect(posting?.description).not.toContain("do-not-keep");
    expect(posting?.summary.length).toBeLessThanOrEqual(180);
  });

  it("uses the role you searched for when the page mentions it without a heading", () => {
    const posting = postingFromPage({
      organization: "Northstar",
      url: "https://northstar.example/careers",
      html: "<h1>Careers</h1><p>We are hiring an electrician for site power.</p>",
      query: "electrician",
    });
    expect(posting?.title).toBe("Electrician");
  });

  it("skips a careers page that does not name the role", () => {
    expect(
      postingFromPage({
        organization: "Northstar",
        url: "https://northstar.example/careers",
        html: "<h1>Careers</h1><p>See our open roles.</p>",
        query: "electrician",
      }),
    ).toBeNull();
  });

  it("reads one named role when the search has no role words", () => {
    expect(
      postingFromPage({
        organization: "Northstar",
        url: "https://northstar.example/jobs/lead",
        html: "<h1>Lead Electrician</h1><p>Install and maintain site power.</p>",
        place: "Clifton Heights",
      })?.title,
    ).toBe("Lead Electrician");
  });
});
