import { describe, expect, it } from "vitest";
import {
  careerRecordInJudgment,
  prepareJobSourceSettings,
  sourceCredentials,
  type JobSourceSettings,
} from "./job-sources";

describe("job source settings", () => {
  it("starts with no built-in source and the live career record", () => {
    const prepared = prepareJobSourceSettings({});
    expect(prepared).toMatchObject({
      ok: true,
      value: {
        sources: [],
        sites: [],
        judgment: ["profile", "history", "skills"],
      },
    });
  });

  it("keeps a named source and the sections the occupant leaves in", () => {
    const prepared = prepareJobSourceSettings({
      sources: [
        {
          id: "source-1",
          name: "Adzuna",
          applicationId: "app",
          apiKey: "secret",
          enabled: true,
        },
      ],
      sites: [
        {
          id: "site-1",
          label: "Northstar",
          url: "https://northstar.example/careers",
          enabled: true,
        },
      ],
      judgment: ["history", "worklog", "resume-file"],
    });
    expect(prepared).toMatchObject({
      ok: true,
      value: {
        judgment: ["history", "worklog"],
        sources: [{ name: "Adzuna", applicationId: "app", apiKey: "secret" }],
        sites: [{ label: "Northstar", url: "https://northstar.example/careers" }],
      },
    });
    if (prepared.ok) expect(careerRecordInJudgment(prepared.value)).toBe(true);
  });

  it("uses the key saved on a source the occupant named", () => {
    const settings = {
      sources: [
        {
          id: "source-1",
          name: "Adzuna",
          applicationId: "vault-id",
          apiKey: "vault-key",
          enabled: true,
        },
      ],
      sites: [],
      judgment: ["profile"],
    } satisfies JobSourceSettings;
    expect(sourceCredentials(settings, "Adzuna", { applicationId: "env-id", apiKey: "env-key" })).toEqual({
      applicationId: "vault-id",
      apiKey: "vault-key",
    });
    expect(
      sourceCredentials(
        {
          ...settings,
          sources: [{ ...settings.sources[0]!, applicationId: "", apiKey: "" }],
        },
        "adzuna",
        { applicationId: "env-id", apiKey: "env-key" },
      )?.applicationId,
    ).toBe("env-id");
    expect(
      sourceCredentials(
        {
          ...settings,
          sources: [{ ...settings.sources[0]!, apiKey: "" }],
        },
        "Adzuna",
        { applicationId: "env-id", apiKey: "env-key" },
      ),
    ).toBeNull();
    expect(
      sourceCredentials(
        {
          ...settings,
          sources: [{ ...settings.sources[0]!, enabled: false }],
        },
        "Adzuna",
        { applicationId: "env-id", apiKey: "env-key" },
      ),
    ).toBeNull();
  });

  it("reads an older Adzuna key as a named source", () => {
    const prepared = prepareJobSourceSettings({
      adzuna: true,
      adzunaAppId: "vault-id",
      adzunaAppKey: "vault-key",
    });
    expect(prepared).toMatchObject({
      ok: true,
      value: {
        sources: [
          {
            name: "Adzuna",
            applicationId: "vault-id",
            apiKey: "vault-key",
            enabled: true,
          },
        ],
      },
    });
  });

  it("refuses a source without a name and a careers page without an address", () => {
    expect(prepareJobSourceSettings({ sources: [{ id: "source-1", name: "" }] }).ok).toBe(false);
    expect(
      prepareJobSourceSettings({
        sites: [{ id: "site-1", label: "Northstar", url: "northstar.example" }],
      }).ok,
    ).toBe(false);
  });
});
