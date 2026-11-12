import { describe, expect, it } from "vitest";
import {
  finishSignature,
  parseFinishReceipt,
  reuseSavedHistory,
  type OnboardingFinishReceipt,
} from "./onboarding-finish";

const saved: OnboardingFinishReceipt = {
  signature: finishSignature(["b", "a"]),
  historySaved: true,
  awaitingComplete: true,
  jobs: 2,
  schools: 1,
  skills: 3,
  resumes: 1,
  setAside: 0,
};

describe("onboarding finish receipt", () => {
  it("reuses a saved history only for the same roles still waiting to complete", () => {
    expect(reuseSavedHistory(saved, finishSignature(["a", "b"]))).toEqual(saved);
    expect(reuseSavedHistory(saved, finishSignature(["a"]))).toBeNull();
    expect(reuseSavedHistory({ ...saved, historySaved: false }, saved.signature)).toBeNull();
    expect(reuseSavedHistory({ ...saved, awaitingComplete: false }, saved.signature)).toBeNull();
    expect(reuseSavedHistory(null, saved.signature)).toBeNull();
  });

  it("drops a receipt that is not the finish record", () => {
    expect(parseFinishReceipt(null)).toBeNull();
    expect(parseFinishReceipt("{")).toBeNull();
    expect(parseFinishReceipt(JSON.stringify({ signature: "a" }))).toBeNull();
    expect(parseFinishReceipt(JSON.stringify(saved))).toEqual(saved);
  });
});
