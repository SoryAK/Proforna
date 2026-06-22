/**
 * Pure helpers powering the AI-chat @-mention surface introduced by
 * ADR-0046 Phase C.3. Kept UI-agnostic on purpose so the textarea + mirror
 * overlay component can stay thin and the contract is exercised by
 * `ai-chat-mentions.test.ts`.
 *
 * Vocabulary:
 *   - "trigger"  — the `@` keystroke that opens the picker.
 *   - "anchor"   — the literal `@Label` substring inserted into the textarea
 *                  when the user selects a candidate from the picker. It is
 *                  the only thing the renderer + serializer needs to find
 *                  the mention again later.
 *   - "orphan"   — a mention whose anchor no longer appears verbatim in the
 *                  textarea (because the user backspaced into it, partially
 *                  edited the label, or removed it). Orphans are dropped on
 *                  every input change.
 */

/** ADR-0046 Phase C entity vocabulary — keep in sync with the route validators. */
export type MentionType = "job" | "skill" | "worklog" | "contact";

/**
 * A mention reference attached to the input. The `anchor` is the exact
 * substring (`@Label`) currently inserted in the textarea; the rest is the
 * structured payload that ships in the request body sidecar.
 */
export interface MentionRef {
  type: MentionType;
  id: string;
  label: string;
  anchor: string;
}

/**
 * Locate an in-progress mention immediately before the caret.
 *
 * Returns `null` when:
 *   - there is no `@` preceding the caret on the current "word",
 *   - the `@` is not at a word boundary (e.g. inside an email address),
 *   - the token after `@` contains whitespace (the mention is already closed).
 *
 * Otherwise returns the index of the `@` (so callers can compute the
 * replacement range) and the current query string the user has typed after
 * the trigger.
 */
export function detectMentionTrigger(
  text: string,
  cursor: number,
): { start: number; query: string } | null {
  if (cursor < 1 || cursor > text.length) return null;
  // Scan backwards from the caret looking for the closest `@` that opens a
  // valid trigger. Bail as soon as we hit whitespace (mention closed) or the
  // string start.
  for (let i = cursor - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === "@") {
      // Word boundary check: the char before `@` must be undefined or
      // whitespace. This avoids hijacking email addresses or other `@`
      // usages mid-word.
      const prev = i > 0 ? text[i - 1] : undefined;
      if (prev !== undefined && !/\s/.test(prev)) return null;
      return { start: i, query: text.slice(i + 1, cursor) };
    }
    if (/\s/.test(ch)) return null;
  }
  return null;
}

/**
 * Replace the in-progress `@query` with `@Label ` (note the trailing space —
 * lets the user keep typing immediately) and emit a `MentionRef` carrying
 * the anchor used. Caller is responsible for appending the ref to its
 * mentions array.
 */
export function insertMention(
  text: string,
  cursor: number,
  triggerStart: number,
  payload: Omit<MentionRef, "anchor">,
): { text: string; mention: MentionRef; cursor: number } {
  const anchor = `@${payload.label}`;
  const before = text.slice(0, triggerStart);
  const after = text.slice(cursor);
  const inserted = `${anchor} `;
  const nextText = `${before}${inserted}${after}`;
  return {
    text: nextText,
    mention: { ...payload, anchor },
    cursor: before.length + inserted.length,
  };
}

/**
 * Drop mentions whose `anchor` no longer appears verbatim in the textarea
 * (orphans) and collapse duplicates by `${type}:${id}` (first occurrence
 * wins). Idempotent and order-preserving for the survivors.
 *
 * Called on every input change so the mentions array stays a true subset
 * of what's actually visible to the user.
 */
export function pruneOrphanedMentions(
  text: string,
  mentions: MentionRef[],
): MentionRef[] {
  const seen = new Set<string>();
  const out: MentionRef[] = [];
  for (const m of mentions) {
    if (!text.includes(m.anchor)) continue;
    const key = `${m.type}:${m.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}
