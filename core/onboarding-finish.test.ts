import { describe, expect, it } from "vitest";
import {
  finishDraftStamp,
  finishSignature,
  parseFinishReceipt,
  receiptMatchesDraft,
  releaseFinishDraft,
  reuseSavedHistory,
  type OnboardingFinishReceipt,
} from "./onboarding-finish";

const history = {
  experience: [{ company: "Acme", title: "Engineer", achievements: ["Shipped the line"] }],
  education: [{ institution: "State", degree: "AAS" }],
  skills: ["TypeScript"],
  experienceEvidence: [{ files: [0], achievements: [0] }],
  educationEvidence: [{ files: [0] }],
  skillFiles: [0],
};

const stamp = finishDraftStamp({ fileDigests: ["resume-a"], asideIds: [] });

const saved: OnboardingFinishReceipt = {
  signature: finishSignature(history),
  historySaved: true,
  awaitingComplete: true,
  jobs: 2,
  schools: 1,
  skills: 3,
  resumes: 1,
  setAside: 0,
  draft: stamp,
};

describe("onboarding finish receipt", () => {
  it("reuses a saved history only for the same content still waiting to complete", () => {
    expect(reuseSavedHistory(saved, finishSignature(history))).toEqual(saved);
    expect(
      reuseSavedHistory(saved, finishSignature({ ...history, skills: ["Go"] })),
    ).toBeNull();
    expect(
      reuseSavedHistory(
        saved,
        finishSignature({
          ...history,
          experience: [{ company: "Acme", title: "Lead", achievements: ["Shipped the line"] }],
        }),
      ),
    ).toBeNull();
    expect(reuseSavedHistory({ ...saved, historySaved: false }, saved.signature)).toBeNull();
    expect(reuseSavedHistory({ ...saved, awaitingComplete: false }, saved.signature)).toBeNull();
    expect(reuseSavedHistory(null, saved.signature)).toBeNull();
  });

  it("completes a pending receipt only when the restored draft still matches", () => {
    const draft = {
      history,
      fileDigests: ["resume-a"],
      asideIds: [] as string[],
    };
    expect(receiptMatchesDraft(saved, draft)).toBe(true);
    expect(receiptMatchesDraft(saved, { ...draft, fileDigests: ["resume-a", "resume-b"] })).toBe(false);
    expect(
      receiptMatchesDraft(saved, { ...draft, history: { ...history, skills: ["Go"] } }),
    ).toBe(false);
    expect(receiptMatchesDraft({ ...saved, awaitingComplete: false }, draft)).toBe(false);
  });

  it("still finishes when deleting the draft fails", async () => {
    await expect(
      releaseFinishDraft(() => Promise.reject(new Error("draft store unavailable"))),
    ).resolves.toBeUndefined();
    let deleted = false;
    await releaseFinishDraft(async () => {
      deleted = true;
    });
    expect(deleted).toBe(true);
  });

  it("drops a receipt that is not the finish record", () => {
    expect(parseFinishReceipt(null)).toBeNull();
    expect(parseFinishReceipt("{")).toBeNull();
    expect(parseFinishReceipt(JSON.stringify({ signature: "a" }))).toBeNull();
    expect(parseFinishReceipt(JSON.stringify(saved))).toEqual(saved);
  });
});
