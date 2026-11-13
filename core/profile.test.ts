import { describe, expect, it } from "vitest";
import {
  avatarExtension,
  isAvatarType,
  personNameParts,
  prepareProfile,
  profileNameForSave,
} from "./profile";

describe("prepareProfile", () => {
  it("requires a name and keeps optional fields empty", () => {
    expect(prepareProfile({ fullName: "  Ada Lovelace  " })).toEqual({
      ok: true,
      value: {
        firstName: "Ada",
        lastName: "Lovelace",
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
        firstName: "Ada",
        lastName: "",
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

  it("keeps a typed first and last name instead of splitting them again", () => {
    expect(prepareProfile({ firstName: "Mary Anne", lastName: "Smith" })).toEqual({
      ok: true,
      value: {
        firstName: "Mary Anne",
        lastName: "Smith",
        fullName: "Mary Anne Smith",
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

  it("accepts one nonempty name part and rejects both blank", () => {
    expect(prepareProfile({ firstName: "Ada", lastName: "" })).toEqual({
      ok: true,
      value: {
        firstName: "Ada",
        lastName: "",
        fullName: "Ada",
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
    expect(prepareProfile({ firstName: "  ", lastName: "Ng" })).toEqual({
      ok: true,
      value: {
        firstName: "",
        lastName: "Ng",
        fullName: "Ng",
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
    expect(prepareProfile({ firstName: "  ", lastName: "   " })).toEqual({
      ok: false,
      error: "name-required",
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

describe("personNameParts", () => {
  it("keeps an explicit empty first name when the last name is stored", () => {
    expect(personNameParts({ firstName: "", lastName: "Ng", fullName: "Ng" })).toEqual({
      firstName: "",
      lastName: "Ng",
    });
  });

  it("splits the full name only when both stored parts are blank", () => {
    expect(personNameParts({ firstName: "", lastName: "", fullName: "Ada Lovelace" })).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
    });
    expect(personNameParts({ firstName: "   ", lastName: "  ", fullName: "Ada Lovelace" })).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
    });
  });
});

describe("profileNameForSave", () => {
  it("keeps a multi-part first name when the full name is unchanged", () => {
    expect(
      profileNameForSave({
        firstName: "Mary Jane",
        lastName: "Watson",
        fullName: "Mary Jane Watson",
        editedFullName: "Mary Jane Watson",
      }),
    ).toEqual({ firstName: "Mary Jane", lastName: "Watson" });
  });

  it("splits an edited full name before save", () => {
    expect(
      profileNameForSave({
        firstName: "Mary Jane",
        lastName: "Watson",
        fullName: "Mary Jane Watson",
        editedFullName: "Grace Hopper",
      }),
    ).toEqual({ firstName: "Grace", lastName: "Hopper" });
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
