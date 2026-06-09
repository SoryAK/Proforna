/**
 * Tests for rewriteWorklogMentionLabels — a pure function that walks a
 * ProseMirror doc and rewrites the `label` attr on every mention node with
 * `entityType === "worklog"` to match the current canonical label from a
 * caller-provided lookup.
 *
 * Used by the one-time migration `scripts/migrations/2026-06-09-fix-worklog-mention-labels.ts`
 * to fix legacy chips that captured the wrong label at insertion time
 * (the bug shipped by ADR-0016 — labels were derived from contentJson
 * first line instead of WorkLog.title).
 */

import { describe, expect, it } from "vitest";
import { rewriteWorklogMentionLabels } from "@/lib/worklog/rewrite-worklog-mention-labels";

function mentionNode(entityType: string, entityId: string, label: string) {
  return {
    type: "mention",
    attrs: { entityType, entityId, label },
  };
}

function paragraph(...inline: unknown[]) {
  return { type: "paragraph", content: inline };
}

function doc(...nodes: unknown[]) {
  return { type: "doc", content: nodes };
}

describe("rewriteWorklogMentionLabels", () => {
  it("returns changed=false and the original doc when no worklog mentions exist", () => {
    const input = doc(paragraph({ type: "text", text: "Hello world" }));
    const lookup = () => "should-not-be-called";

    const result = rewriteWorklogMentionLabels(input, lookup);

    expect(result.changed).toBe(false);
    expect(result.rewriteCount).toBe(0);
    expect(result.doc).toBe(input); // identity preserved when nothing changes
  });

  it("ignores non-worklog mentions (asset/skill/company/contact)", () => {
    const input = doc(
      paragraph(
        { type: "text", text: "Asset: " },
        mentionNode("asset", "asset-1", "old-asset-label"),
      ),
    );
    const lookup = () => "should-not-be-called";

    const result = rewriteWorklogMentionLabels(input, lookup);

    expect(result.changed).toBe(false);
    expect(result.rewriteCount).toBe(0);
  });

  it("rewrites a worklog mention label when the lookup returns a different value", () => {
    const input = doc(
      paragraph(
        { type: "text", text: "See: " },
        mentionNode("worklog", "log-1", "stale label"),
      ),
    );
    const lookup = (id: string) => (id === "log-1" ? "Crusher #3 motor issue" : null);

    const result = rewriteWorklogMentionLabels(input, lookup);

    expect(result.changed).toBe(true);
    expect(result.rewriteCount).toBe(1);

    // The mention node must carry the new label; siblings unchanged.
    const para = (result.doc as any).content[0];
    expect(para.content[0]).toEqual({ type: "text", text: "See: " });
    expect(para.content[1].attrs).toEqual({
      entityType: "worklog",
      entityId: "log-1",
      label: "Crusher #3 motor issue",
    });
  });

  it("leaves the chip untouched when the lookup returns the same label", () => {
    const input = doc(
      paragraph(mentionNode("worklog", "log-1", "Already correct")),
    );
    const lookup = () => "Already correct";

    const result = rewriteWorklogMentionLabels(input, lookup);

    expect(result.changed).toBe(false);
    expect(result.rewriteCount).toBe(0);
  });

  it("leaves the chip untouched when the lookup returns null (target deleted)", () => {
    const input = doc(
      paragraph(mentionNode("worklog", "log-orphan", "stale label")),
    );
    const lookup = () => null;

    const result = rewriteWorklogMentionLabels(input, lookup);

    expect(result.changed).toBe(false);
    expect(result.rewriteCount).toBe(0);
  });

  it("rewrites multiple mentions in one pass and reports an accurate count", () => {
    const input = doc(
      paragraph(
        mentionNode("worklog", "log-1", "old1"),
        { type: "text", text: " and " },
        mentionNode("worklog", "log-2", "old2"),
      ),
      paragraph(mentionNode("worklog", "log-1", "old1-again")),
    );
    const lookup = (id: string) => ({ "log-1": "New 1", "log-2": "New 2" })[id] ?? null;

    const result = rewriteWorklogMentionLabels(input, lookup);

    expect(result.changed).toBe(true);
    expect(result.rewriteCount).toBe(3);

    const p1 = (result.doc as any).content[0];
    const p2 = (result.doc as any).content[1];
    expect(p1.content[0].attrs.label).toBe("New 1");
    expect(p1.content[2].attrs.label).toBe("New 2");
    expect(p2.content[0].attrs.label).toBe("New 1");
  });

  it("walks nested block content (e.g. bullet list with paragraphs)", () => {
    const input = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                paragraph(mentionNode("worklog", "log-1", "stale")),
              ],
            },
          ],
        },
      ],
    };
    const lookup = () => "Fresh label";

    const result = rewriteWorklogMentionLabels(input, lookup);

    expect(result.changed).toBe(true);
    expect(result.rewriteCount).toBe(1);
    const inner = (result.doc as any).content[0].content[0].content[0].content[0];
    expect(inner.attrs.label).toBe("Fresh label");
  });

  it("returns changed=false on null/undefined doc input (safe no-op)", () => {
    expect(rewriteWorklogMentionLabels(null, () => "x")).toEqual({
      doc: null,
      changed: false,
      rewriteCount: 0,
    });
    expect(rewriteWorklogMentionLabels(undefined, () => "x")).toEqual({
      doc: undefined,
      changed: false,
      rewriteCount: 0,
    });
  });
});
