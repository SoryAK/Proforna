/**
 * Hermetic coverage for the AI-chat mention helpers introduced by
 * ADR-0046 Phase C.3. These functions are deliberately UI-agnostic so the
 * textarea + mirror-overlay component can stay thin and the contract is
 * checked here.
 */
import { describe, expect, it } from "vitest";

import {
  detectMentionTrigger,
  insertMention,
  pruneOrphanedMentions,
  type MentionRef,
} from "./ai-chat-mentions";

describe("detectMentionTrigger", () => {
  it("returns null when there is no `@` before the caret", () => {
    expect(detectMentionTrigger("hello world", 5)).toBeNull();
  });

  it("returns the trigger position and query when `@` precedes the caret", () => {
    // input: "tell me about @Acm" — caret at end (position 18)
    const result = detectMentionTrigger("tell me about @Acm", 18);
    expect(result).toEqual({ start: 14, query: "Acm" });
  });

  it("returns an empty query immediately after typing `@`", () => {
    const result = detectMentionTrigger("ask @", 5);
    expect(result).toEqual({ start: 4, query: "" });
  });

  it("returns null when the `@` is not at a word boundary", () => {
    // an email-like substring should not open the picker
    const result = detectMentionTrigger("user@example.com", 16);
    expect(result).toBeNull();
  });

  it("returns null when the token contains whitespace (mention closed)", () => {
    const result = detectMentionTrigger("hey @Acme tell me", 17);
    expect(result).toBeNull();
  });

  it("anchors to the `@` closest to the caret", () => {
    // two `@` markers; caret after the second
    const result = detectMentionTrigger("@Old then @Ne", 13);
    expect(result).toEqual({ start: 10, query: "Ne" });
  });

  it("treats the start-of-string `@` as a valid trigger", () => {
    expect(detectMentionTrigger("@Ac", 3)).toEqual({ start: 0, query: "Ac" });
  });
});

describe("insertMention", () => {
  const mention: Omit<MentionRef, "anchor"> = {
    type: "job",
    id: "job-1",
    label: "Acme Corp",
  };

  it("replaces the in-progress @query with @Label and emits a MentionRef", () => {
    const { text, mention: ref, cursor } = insertMention(
      "tell me about @Acm",
      18,
      14,
      mention,
    );
    expect(text).toBe("tell me about @Acme Corp ");
    expect(ref.anchor).toBe("@Acme Corp");
    expect(ref.type).toBe("job");
    expect(ref.id).toBe("job-1");
    expect(ref.label).toBe("Acme Corp");
    // Cursor should land after the trailing space so the user can keep typing.
    expect(cursor).toBe(text.length);
  });

  it("preserves text after the caret when inserting mid-string", () => {
    const { text } = insertMention(
      "ask about @Acm next week",
      14,
      10,
      mention,
    );
    expect(text).toBe("ask about @Acme Corp  next week");
  });

  it("works when the trigger is at the start of the string", () => {
    const { text, cursor } = insertMention("@Ac", 3, 0, mention);
    expect(text).toBe("@Acme Corp ");
    expect(cursor).toBe(11);
  });
});

describe("pruneOrphanedMentions", () => {
  const acme: MentionRef = {
    type: "job",
    id: "job-1",
    label: "Acme Corp",
    anchor: "@Acme Corp",
  };
  const beta: MentionRef = {
    type: "skill",
    id: "skill-1",
    label: "Beta",
    anchor: "@Beta",
  };

  it("keeps mentions whose anchor still appears verbatim in the text", () => {
    const text = "tell me about @Acme Corp and @Beta";
    expect(pruneOrphanedMentions(text, [acme, beta])).toEqual([acme, beta]);
  });

  it("drops a mention whose anchor was edited (e.g. partial backspace)", () => {
    const text = "tell me about @Acme Cor and @Beta";
    expect(pruneOrphanedMentions(text, [acme, beta])).toEqual([beta]);
  });

  it("drops a mention whose anchor was deleted entirely", () => {
    const text = "tell me about everything";
    expect(pruneOrphanedMentions(text, [acme, beta])).toEqual([]);
  });

  it("collapses duplicate mentions with the same ${type}:${id} (first wins)", () => {
    const text = "@Acme Corp @Acme Corp";
    const duplicate: MentionRef = { ...acme, label: "Acme Corp (alt)" };
    expect(pruneOrphanedMentions(text, [acme, duplicate])).toEqual([acme]);
  });
});
