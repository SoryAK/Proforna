/**
 * Action-target resolver for the AI chat code-block toolbar.
 *
 * ADR-0046 Phase D's "target-picker pattern" codifies the precedence:
 *   1. Ambient context (the page the user is currently on).
 *   2. Most-recent matching @-mention in the chat thread.
 *   3. Popover picker — only if (1) and (2) both fail.
 *
 * This file is the single source of truth for that rule. All three baseline
 * actions (`send-to-worklog`, `add-to-job-notes`, `save-as-bullet`) — and any
 * future actions — must route their target lookup through here so the rule
 * stays uniform and we never end up with one action quietly using a
 * different precedence than another.
 *
 * Pure function by design — no Prisma, no fetch, no state. The chat panel
 * gathers `pageContext` from `/api/ai/context`'s ambient field and
 * `threadContext.recentMentions` from the in-memory chat history, then
 * passes both in. Easy to unit-test in isolation.
 */

/** Tagged action identifier. New actions extend this union. */
export type ActionType =
  | "send-to-worklog"
  | "add-to-job-notes"
  | "save-as-bullet";

/** Lightweight entity reference shared between ambient context and mentions. */
export interface AmbientEntityRef {
  /**
   * Mirrors the mention-search vocabulary. Only `job` and `worklog` resolve
   * targets in v1; `skill` / `contact` are accepted in the inputs but never
   * become the resolved target for the baseline three actions.
   */
  type: "job" | "worklog" | "skill" | "contact";
  id: string;
  label: string;
}

export interface PageContext {
  activeJob?: AmbientEntityRef | null;
  activeWorklog?: AmbientEntityRef | null;
  activeSkill?: AmbientEntityRef | null;
}

export interface ThreadContext {
  /**
   * Ordered list of @-mentions used across the whole chat thread, most
   * recent LAST. Phase C's mention payload tracks insertions per send;
   * Phase D.3 wires this into per-message `mentions` so we can rebuild
   * the ordered list at resolution time.
   */
  recentMentions: AmbientEntityRef[];
}

export type ResolutionResult =
  | { kind: "resolved"; target: AmbientEntityRef }
  | { kind: "needs-picker"; entityType: "job" | "worklog" };

/**
 * Map each action to the entity type it needs to land on. Single source of
 * truth — both ambient lookup and thread fallback consult this.
 */
function entityTypeForAction(action: ActionType): "job" | "worklog" {
  if (action === "send-to-worklog") return "worklog";
  return "job";
}

/**
 * Pluck the ambient slice that matches the action's target type, if any.
 * Returns null on type mismatch or absent slice — caller falls through to
 * the thread scan.
 */
function ambientForAction(
  action: ActionType,
  page: PageContext,
): AmbientEntityRef | null {
  const wanted = entityTypeForAction(action);
  if (wanted === "job") return page.activeJob ?? null;
  return page.activeWorklog ?? null;
}

/**
 * Resolve the target for an action using the three-step precedence:
 *
 *   1. Ambient: `pageContext.activeJob` or `activeWorklog` if it matches.
 *   2. Thread: scan `threadContext.recentMentions` back-to-front for the
 *      first entry whose `type` matches.
 *   3. needs-picker.
 *
 * Pure function — no side effects, no dependencies on fetch/Prisma.
 */
export function resolveActionTarget(
  action: ActionType,
  threadContext: ThreadContext,
  pageContext: PageContext,
): ResolutionResult {
  const ambient = ambientForAction(action, pageContext);
  if (ambient) return { kind: "resolved", target: ambient };

  const wanted = entityTypeForAction(action);
  for (let i = threadContext.recentMentions.length - 1; i >= 0; i -= 1) {
    const mention = threadContext.recentMentions[i];
    if (mention.type === wanted) {
      return { kind: "resolved", target: mention };
    }
  }

  return { kind: "needs-picker", entityType: wanted };
}
