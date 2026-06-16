/**
 * ADR-0030 Unit 6 — Tiptap Extension that registers procedure commands.
 *
 * Commands operate by computing the next JSON document via the pure
 * helpers in `procedure-transforms.ts` (unit-tested) and dispatching a
 * transaction that replaces the doc content with the new shape. This
 * deliberately favors correctness over cursor-preservation; the toolbar
 * follows up with `editor.commands.focus()` on the right slot when needed.
 *
 * Commands:
 *   appendProcedureStep(title?)     → push a new step to the end.
 *   toggleProcedureTools()           → add/remove the optional tools block.
 *   moveProcedureStepUp(stepIndex)   → swap step with previous sibling.
 *   moveProcedureStepDown(stepIndex) → swap step with next sibling.
 *   setProcedureStepTitle(stepIndex, title) → write step.attrs.title.
 *
 * `stepIndex` is the 0-based index *among steps* (NOT the doc-content
 * index), matching the visual numbering the user sees.
 */

import { Extension } from "@tiptap/core";
import {
  appendStep,
  toggleTools,
  moveStepUp,
  moveStepDown,
  setStepTitle,
} from "@/lib/worklog/procedure-transforms";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    procedureCommands: {
      appendProcedureStep: (title?: string | null) => ReturnType;
      toggleProcedureTools: () => ReturnType;
      moveProcedureStepUp: (stepIndex: number) => ReturnType;
      moveProcedureStepDown: (stepIndex: number) => ReturnType;
      setProcedureStepTitle: (stepIndex: number, title: string | null) => ReturnType;
    };
  }
}

export const ProcedureCommands = Extension.create({
  name: "procedureCommands",

  addCommands() {
    return {
      appendProcedureStep:
        (title = null) =>
        ({ state, dispatch }) => {
          const next = appendStep(state.doc.toJSON(), title ?? null);
          return replaceDocWith(state, dispatch, next);
        },

      toggleProcedureTools:
        () =>
        ({ state, dispatch }) => {
          const next = toggleTools(state.doc.toJSON());
          return replaceDocWith(state, dispatch, next);
        },

      moveProcedureStepUp:
        (stepIndex) =>
        ({ state, dispatch }) => {
          const next = moveStepUp(state.doc.toJSON(), stepIndex);
          return replaceDocWith(state, dispatch, next);
        },

      moveProcedureStepDown:
        (stepIndex) =>
        ({ state, dispatch }) => {
          const next = moveStepDown(state.doc.toJSON(), stepIndex);
          return replaceDocWith(state, dispatch, next);
        },

      setProcedureStepTitle:
        (stepIndex, title) =>
        ({ state, dispatch }) => {
          const next = setStepTitle(state.doc.toJSON(), stepIndex, title);
          return replaceDocWith(state, dispatch, next);
        },
    };
  },
});

// Replace the full document content with the parsed JSON. Returns false
// (a no-op) if nothing changed (referential equality from the helper) or
// if the new JSON doesn't fit the schema.
function replaceDocWith(
  state: import("@tiptap/pm/state").EditorState,
  dispatch: ((tr: import("@tiptap/pm/state").Transaction) => void) | undefined,
  nextJson: unknown,
): boolean {
  if (nextJson === state.doc.toJSON() || nextJson === null || nextJson === undefined) {
    return false;
  }
  let nextNode: import("@tiptap/pm/model").Node;
  try {
    nextNode = state.schema.nodeFromJSON(nextJson as Parameters<typeof state.schema.nodeFromJSON>[0]);
  } catch {
    return false;
  }
  if (!dispatch) return true;
  const tr = state.tr.replaceWith(0, state.doc.content.size, nextNode.content);
  dispatch(tr.scrollIntoView());
  return true;
}
