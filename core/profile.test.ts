import { describe, expect, it } from "vitest";
import {
  avatarExtension,
  isAvatarType,
  prepareProfile,
} from "./profile";

describe("prepareProfile", () => {
  it("requires a name and keeps optional fields empty", () => {
    expect(prepareProfile({ fullName: "  Ada Lovelace  " })).toEqual({
      ok: true,
      value: {
        fullName: "Ada Lovelace",
        headline: "",
        address: "",
        city: "",
        state: "",
        bio: "",
        linkedinUrl: "",
        githubUrl: "",
        portfolioUrl: "",
      },
    });
  });

  it("rejects a blank name", () => {
    expect(prepareProfile({ fullName: "   " })).toEqual({
      ok: false,
      error: "name-required",
    });
  });

  it("saves optional copy and http(s) links", () => {
    const prepared = prepareProfile({
      fullName: "Ada",
      headline: "Mathematician",
      address: "12 Private Lane",
      city: "London",
      state: "England",
      bio: "Notes on the engine.",
      linkedinUrl: "https://linkedin.com/in/ada",
      githubUrl: "https://github.com/ada",
      portfolioUrl: "http://ada.example",
    });
    expect(prepared).toEqual({
      ok: true,
      value: {
        fullName: "Ada",
        headline: "Mathematician",
        address: "12 Private Lane",
        city: "London",
        state: "England",
        bio: "Notes on the engine.",
        linkedinUrl: "https://linkedin.com/in/ada",
        githubUrl: "https://github.com/ada",
        portfolioUrl: "http://ada.example",
      },
    });
  });

  it("rejects a link that is not http(s)", () => {
    expect(
      prepareProfile({
        fullName: "Ada",
        githubUrl: "javascript:alert(1)",
      }),
    ).toEqual({ ok: false, error: "url-invalid" });
  });
});

describe("avatar mime", () => {
  it("accepts the backup photo types", () => {
    expect(isAvatarType("image/jpeg")).toBe(true);
    expect(isAvatarType("image/png")).toBe(true);
    expect(isAvatarType("image/webp")).toBe(true);
    expect(isAvatarType("image/gif")).toBe(true);
    expect(isAvatarType("application/pdf")).toBe(false);
    expect(avatarExtension("image/jpeg")).toBe("jpg");
  });
});
