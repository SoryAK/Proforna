import { describe, expect, it } from "vitest";
import { judgeListingFit } from "./fit-judgment";

const listing = {
  title: "Lead electrician",
  summary: "Daily blueprint reading for a zirconium welder crew",
  location: "Clifton Heights, PA",
};

describe("fit judgment", () => {
  it("leaves the career record unread when no section is checked", () => {
    const judgment = judgeListingFit(
      listing,
      {
        profile: { headline: "Licensed electrician", bio: "Commercial fit-out" },
        history: [{ title: "Zirconium welder", organization: "Northstar" }],
        skills: ["blueprint reading"],
        worklog: [{ title: "Panel upgrade" }],
        residence: { address: "Clifton Heights, PA" },
      },
      [],
    );
    expect(judgment.summary).toBe("The career record is left out of this judgment.");
    expect(JSON.stringify(judgment)).not.toContain("blueprint");
    expect(JSON.stringify(judgment)).not.toContain("Zirconium");
    expect(JSON.stringify(judgment)).not.toContain("Clifton");
  });

  it("names a skill that appears in the role, and ignores an unchecked role", () => {
    const judgment = judgeListingFit(
      listing,
      {
        history: [{ title: "Zirconium welder", organization: "Northstar" }],
        skills: ["blueprint reading", "at"],
      },
      ["skills"],
    );
    expect(judgment.summary).toBe("Lines up with blueprint reading.");
    expect(JSON.stringify(judgment)).not.toContain("Zirconium");
  });

  it("names a recent role and the home town from the sections left in", () => {
    const judgment = judgeListingFit(
      listing,
      {
        history: [{ title: "Lead electrician", organization: "Northstar" }],
        residence: { address: "67 East Broadway Avenue, Clifton Heights, PA" },
      },
      ["history", "residence"],
    );
    expect(judgment.summary).toBe(
      "Lines up with Lead electrician at Northstar and Clifton Heights.",
    );
  });

  it("says when the checked record does not line up", () => {
    expect(
      judgeListingFit(listing, { skills: ["plumbing"] }, ["skills"]).summary,
    ).toBe("Nothing in the checked career record lines up with this role.");
  });
});
